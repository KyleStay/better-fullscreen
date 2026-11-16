(() => {
  const PAGE = "better-fullscreen:page";
  const EXTENSION = "better-fullscreen:extension";
  const nativeRequest = Element.prototype.requestFullscreen;
  const nativeExit = Document.prototype.exitFullscreen;
  if (!nativeRequest || !nativeExit) return;
  const nativeElement = Object.getOwnPropertyDescriptor(Document.prototype, "fullscreenElement")?.get;
  let enabled = false;
  let active = null;
  let session = null;
  let opening = false;
  const pending = new Map();
  const post = data => window.postMessage({channel: PAGE, ...data}, "*");

  function request(action) {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      pending.set(id, {resolve, reject});
      post({action, id});
    });
  }

  function signal(target) {
    for (const type of ["fullscreenchange", "webkitfullscreenchange"]) {
      (target?.isConnected ? target : document).dispatchEvent(new Event(type, {bubbles: true, composed: true}));
    }
  }

  function mediaTarget(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    if (element.matches("video") || element.querySelector("video")) return true;
    const frames = element.matches("iframe") ? [element] : [...element.querySelectorAll("iframe")];
    return frames.some(frame => {
      try {
        const host = new URL(frame.src, location.href).hostname;
        return /(^|\.)(youtube\.com|youtube-nocookie\.com|vimeo\.com|dailymotion\.com|twitch\.tv|facebook\.com)$/.test(host);
      } catch { return false; }
    });
  }

  function fullscreenCSS() {
    const pseudo = /:(?:fullscreen|-webkit-full-screen)\b/g;
    function collect(rules) {
      let css = "";
      for (const rule of rules) {
        if (rule.selectorText && pseudo.test(rule.selectorText)) {
          pseudo.lastIndex = 0;
          css += rule.cssText.replace(pseudo, "[data-better-fullscreen-target]");
        } else if (rule.cssRules) {
          const inner = collect(rule.cssRules);
          if (inner) css += `${rule.cssText.slice(0, rule.cssText.indexOf("{"))}{${inner}}`;
        }
        pseudo.lastIndex = 0;
      }
      return css;
    }
    let css = "";
    for (const sheet of document.styleSheets) {
      try { css += collect(sheet.cssRules); } catch { /* Cross-origin styles are not readable. */ }
    }
    return css;
  }

  function declarations(css) {
    const result = new Map();
    let start = 0, colon = -1, depth = 0, quote = "", escaped = false, comment = false;
    for (let i = 0; i <= css.length; i++) {
      const char = css[i] || ";", next = css[i + 1];
      if (comment) {
        if (char === "*" && next === "/") { comment = false; i++; }
        continue;
      }
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (quote) { if (char === quote) quote = ""; continue; }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === "/" && next === "*") { comment = true; i++; continue; }
      if ("([{".includes(char)) { depth++; continue; }
      if (")]}".includes(char)) { depth--; continue; }
      if (!depth && char === ":" && colon < start) colon = i;
      if (!depth && char === ";") {
        if (colon >= start) result.set(css.slice(start, colon).trim(), css.slice(start, i).trim() + ";");
        start = i + 1; colon = -1;
      }
    }
    return result;
  }

  function expand(target, token) {
    if (active?.target === target) return;
    if (active) collapse();
    const undo = [];
    function style(element, values) {
      // Serialized declarations retain var() shorthands and logical/physical cascade order.
      const original = declarations(element.style.cssText);
      const probe = document.createElement("div").style;
      for (const [property, value] of Object.entries(values)) {
        probe.setProperty(property, value, "important");
        element.style.setProperty(property, value, "important");
      }
      const owned = new Set([...Object.keys(values), ...Array.from(probe)]);
      const applied = declarations(element.style.cssText);
      undo.push(() => {
        const current = declarations(element.style.cssText);
        const restored = new Map(original);
        for (const property of new Set([...applied.keys(), ...current.keys()])) {
          if (applied.get(property) === current.get(property)) continue;
          probe.cssText = current.get(property) || applied.get(property);
          if (owned.has(property) || Array.from(probe).some(name => owned.has(name))) continue;
          if (current.has(property)) restored.set(property, current.get(property));
          else restored.delete(property);
        }
        element.style.cssText = [...restored.values()].join(" ");
      });
    }
    const previousMarker = target.getAttribute("data-better-fullscreen-target");
    target.setAttribute("data-better-fullscreen-target", "");
    undo.push(() => previousMarker === null ? target.removeAttribute("data-better-fullscreen-target") : target.setAttribute("data-better-fullscreen-target", previousMarker));
    const sheet = document.createElement("style");
    sheet.textContent = fullscreenCSS();
    (document.head || document.documentElement).append(sheet);
    undo.push(() => sheet.remove());

    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
      style(parent, {
        transform: "none", filter: "none", "backdrop-filter": "none", perspective: "none",
        contain: "none", "content-visibility": "visible", "will-change": "auto",
        overflow: "visible", clip: "auto", "clip-path": "none", isolation: "auto", "z-index": "auto", opacity: "1"
      });
    }
    style(document.documentElement, {overflow: "hidden"});
    style(target, {
      position: "fixed", inset: "0", width: "100vw", height: "100vh", "min-width": "0", "min-height": "0",
      "max-width": "none", "max-height": "none", margin: "0", padding: "0", border: "0",
      transform: "none", "box-sizing": "border-box", "z-index": "2147483646", overflow: "hidden",
      background: "black", visibility: "visible", "border-radius": "0"
    });
    const videos = target.matches("video") ? [target] : [...target.querySelectorAll("video")];
    for (const video of videos) {
      style(video, {width: "100%", height: "100%", "max-width": "none", "max-height": "none", "object-fit": "contain", left: "0", top: "0"});
      for (let parent = video.parentElement; parent && parent !== target; parent = parent.parentElement) {
        style(parent, {width: "100%", height: "100%", "max-height": "none", "max-width": "none"});
      }
    }
    const observer = new MutationObserver(() => {
      if (!target.isConnected && active?.target === target) {
        observer.disconnect();
        request("exit").catch(() => {});
      }
    });
    observer.observe(document.documentElement, {childList: true, subtree: true});
    undo.push(() => observer.disconnect());
    active = {target, token, undo, focus: document.activeElement};
  }

  function collapse() {
    if (!active) return;
    const previous = active;
    active = null;
    for (const undo of previous.undo.reverse()) undo();
    previous.focus?.focus?.({preventScroll: true});
    signal(previous.target);
    window.dispatchEvent(new Event("resize"));
  }

  function offerNative(target) {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed!important;inset:12px 12px auto auto!important;z-index:2147483647!important;display:block!important";
    const root = host.attachShadow({mode: "closed"});
    const style = document.createElement("style");
    style.textContent = "div{background:#17171e;color:white;padding:14px;border-radius:10px;font:14px system-ui;box-shadow:0 3px 16px #0005;max-width:300px}p{margin:0 0 10px}button{font:inherit;padding:7px 10px;cursor:pointer;margin-right:8px;border-radius:6px;border:1px solid #aaa}button:focus-visible{outline:3px solid #84c9ff}";
    const panel = document.createElement("div");
    panel.setAttribute("role", "alert");
    const text = document.createElement("p");
    text.textContent = "The media view couldn't open.";
    const retry = document.createElement("button");
    retry.textContent = "Use browser fullscreen";
    retry.addEventListener("click", () => {
      // Call before awaiting anything so this click supplies fresh user activation.
      nativeRequest.call(target).then(() => host.remove(), () => { text.textContent = "This player couldn't enter fullscreen. Try its controls again."; });
    });
    const dismiss = document.createElement("button");
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", () => host.remove());
    panel.append(text, retry, dismiss);
    root.append(style, panel);
    document.documentElement.append(host);
    return host;
  }

  async function replacement(options) {
    if (!enabled || !mediaTarget(this) || !document.fullscreenEnabled || !navigator.userActivation.isActive || nativeElement?.call(document)) return nativeRequest.call(this, options);
    if (active?.target === this && !opening) return;
    if (opening) throw new DOMException("A media view is already opening.", "InvalidStateError");
    opening = true;
    const target = this;
    expand(target, null);
    try {
      const result = await request("enter");
      // Escape can complete while the enter reply is still in flight.
      if (!active) return;
      session = {token: result.token};
      if (active) active.token = result.token;
      signal(target);
      window.dispatchEvent(new Event("resize"));
      post({action: "expand-parent", token: result.token});
    } catch (error) {
      // Retain the player and return controls if a session is still active after a failure.
      if (session && active) {
        signal(target);
        throw new DOMException(error.message, "InvalidStateError");
      }
      collapse();
      if (navigator.userActivation.isActive) {
        try { return await nativeRequest.call(target, options); } catch { /* Offer a fresh click below. */ }
      }
      offerNative(target);
      throw new DOMException(error.message || "The media view couldn't open.", "NotAllowedError");
    } finally { opening = false; }
  }

  function exit() {
    if (active || session) return request("exit");
    return nativeExit.call(this);
  }

  function replaceMethod(prototype, name, value) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (!descriptor || descriptor.configurable) Object.defineProperty(prototype, name, {configurable: true, writable: true, value});
  }
  replaceMethod(Element.prototype, "requestFullscreen", replacement);
  for (const name of ["webkitRequestFullscreen", "webkitRequestFullScreen"]) {
    if (name in Element.prototype) replaceMethod(Element.prototype, name, replacement);
  }
  replaceMethod(Document.prototype, "exitFullscreen", exit);
  if ("webkitExitFullscreen" in Document.prototype) replaceMethod(Document.prototype, "webkitExitFullscreen", exit);
  if ("webkitCancelFullScreen" in Document.prototype) replaceMethod(Document.prototype, "webkitCancelFullScreen", exit);
  for (const name of ["fullscreenElement", "webkitFullscreenElement", "webkitCurrentFullScreenElement"]) {
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, name);
    if (descriptor?.get && descriptor.configurable) Object.defineProperty(Document.prototype, name, {
      ...descriptor, get() { return this === document && active ? active.target : descriptor.get.call(this); }
    });
  }
  for (const name of ["webkitIsFullScreen", "webkitFullScreen"]) {
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, name);
    if (descriptor?.get && descriptor.configurable) Object.defineProperty(Document.prototype, name, {
      ...descriptor, get() { return this === document && active ? true : descriptor.get.call(this); }
    });
  }

  window.addEventListener("message", event => {
    const data = event.data;
    if (event.source !== window || data?.channel !== EXTENSION) return;
    if (data.action === "config") enabled = data.enabled === true;
    if (data.action === "reply") {
      const callbacks = pending.get(data.id);
      if (!callbacks) return;
      pending.delete(data.id);
      data.ok ? callbacks.resolve(data) : callbacks.reject(new Error(data.error));
    }
    if (data.action === "session") {
      session = data.session;
      if (!session) collapse();
    }
    if (data.action === "expand-frame" && session?.token === data.token) {
      const frame = document.querySelector(`iframe[data-better-fullscreen-frame="${CSS.escape(data.token)}"],frame[data-better-fullscreen-frame="${CSS.escape(data.token)}"]`);
      if (frame) {
        expand(frame, data.token);
        signal(frame);
      }
    }
  });
  post({action: "ready"});
})();
