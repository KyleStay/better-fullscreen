export class CDP {
  constructor(socket) {
    this.socket = socket;
    this.next = 0;
    this.pending = new Map();
    this.listeners = [];
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        clearTimeout(entry.timer);
        this.pending.delete(message.id);
        message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result);
      } else for (const listener of this.listeners) listener(message);
    });
    socket.addEventListener("close", () => {
      for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error("CDP closed")); }
      this.pending.clear();
    });
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, {once:true}); socket.addEventListener("error", reject, {once:true}); });
    return new CDP(socket);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      this.pending.set(id, {resolve, reject, timer});
      this.socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
    });
  }
  async attach(targetId) {
    const {sessionId} = await this.send("Target.attachToTarget", {targetId, flatten:true});
    return new Target(this, sessionId);
  }
}

class Target {
  constructor(cdp, sessionId) { this.cdp = cdp; this.sessionId = sessionId; }
  send(method, params) { return this.cdp.send(method, params, this.sessionId); }
  async eval(expression) {
    const response = await this.send("Runtime.evaluate", {expression, awaitPromise:true, returnByValue:true, userGesture:false});
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  }
  async click(selector) {
    const box = await this.eval(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await this.send("Page.bringToFront");
    await this.send("Input.dispatchMouseEvent", {type:"mousePressed", ...box, button:"left", clickCount:1});
    await this.send("Input.dispatchMouseEvent", {type:"mouseReleased", ...box, button:"left", clickCount:1});
  }
  async escape() {
    await this.send("Input.dispatchKeyEvent", {type:"keyDown", key:"Escape", code:"Escape", windowsVirtualKeyCode:27});
    await this.send("Input.dispatchKeyEvent", {type:"keyUp", key:"Escape", code:"Escape", windowsVirtualKeyCode:27});
  }
}

export async function until(fn, description, timeout = 10000) {
  const deadline = Date.now()+timeout;
  let last;
  while (Date.now()<deadline) {
    try { const value=await fn(); if(value) return value; } catch(error) { last=error; }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error(`Timed out: ${description}${last ? ` (${last.message})` : ""}`);
}
