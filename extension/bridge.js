(() => {
  const PAGE = "better-fullscreen:page";
  const EXTENSION = "better-fullscreen:extension";
  const FRAME = "better-fullscreen:frame";
  let settings = {enabled: false};
  let session = null;
  let overlay;
  let status;
  let nativeButton;
  let returning = false;
  const send = message => chrome.runtime.sendMessage(message);
  const emit = data => window.postMessage({channel: EXTENSION, ...data}, "*");

  function setIcon(button, icon, label) {
    const paths = {
      expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
      shrink: "M3 8h5V3m8 0v5h5M3 16h5v5m8 0v-5h5",
      close: "M6 6l12 12M18 6 6 18"
    };
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [name, value] of Object.entries({viewBox: "0 0 24 24", width: "20", height: "20", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false"})) {
      svg.setAttribute(name, value);
    }
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", paths[icon]);
    svg.append(path);
    button.replaceChildren(svg);
    button.setAttribute("aria-label", label);
    button.title = label;
  }

  function showSession(next) {
    if (!next && session) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      for (const frame of document.querySelectorAll("[data-better-fullscreen-frame]")) {
        if (frame.getAttribute("data-better-fullscreen-frame") === session.token) frame.removeAttribute("data-better-fullscreen-frame");
      }
    }
    session = next;
    emit({action: "session", session});
    if (!session) {
      overlay?.remove();
      overlay = null;
      nativeButton = null;
      returning = false;
      return;
    }
    if (window !== window.top || overlay) return;
    if (!document.documentElement) {
      document.addEventListener("DOMContentLoaded", () => showSession(session), {once: true});
      return;
    }
    overlay = document.createElement("div");
    overlay.setAttribute("data-better-fullscreen-control", "");
    overlay.style.cssText = "all:initial!important;position:fixed!important;top:12px!important;right:12px!important;z-index:2147483647!important;visibility:visible!important;display:block!important";
    const root = overlay.attachShadow({mode: "closed"});
    const style = document.createElement("style");
    style.textContent = "button{display:inline-grid;place-items:center;vertical-align:top;width:44px;height:44px;cursor:pointer;border:1px solid #ffffff60;border-radius:8px;background:#17171ee8;color:white;padding:0;box-shadow:0 2px 10px #0004}button+button{margin-left:8px}button:focus-visible{outline:3px solid #84c9ff;outline-offset:2px}button:hover{background:#34343f}svg{pointer-events:none}p{font:13px system-ui;max-width:320px;background:#17171e;color:white;padding:10px;border-radius:8px}p:empty{display:none}";
    nativeButton = document.createElement("button");
    nativeButton.type = "button";
    setIcon(nativeButton, "expand", "Native fullscreen");
    nativeButton.addEventListener("click", async () => {
      try {
        // The isolated world's native API bypasses the page hook and uses this click's activation.
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
        if (status) status.textContent = "";
      } catch {
        if (status) status.textContent = "Native fullscreen couldn't open. Try again or return to the page.";
      }
    });
    const button = document.createElement("button");
    button.type = "button";
    setIcon(button, "close", "Return to page");
    button.title = "Return to page (Esc)";
    button.addEventListener("click", returnToPage);
    status = document.createElement("p");
    status.setAttribute("role", "status");
    root.append(style, nativeButton, button, status);
    document.documentElement.append(overlay);
  }

  async function returnToPage() {
    if (!session || returning) return;
    returning = true;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      const result = await send({type: "exit"});
      if (!result.ok) throw new Error(result.error);
    } catch (error) {
      if (status) status.textContent = `${error.message} Press Escape or Return to page to retry.`;
    } finally { returning = false; }
  }

  // Capture before the player can swallow Escape, including in embedded players.
  window.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !session || document.fullscreenElement) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    returnToPage();
  }, true);

  document.addEventListener("fullscreenchange", () => {
    if (nativeButton) setIcon(nativeButton, document.fullscreenElement ? "shrink" : "expand", document.fullscreenElement ? "Exit native fullscreen" : "Native fullscreen");
  });

  async function loadConfig() {
    try {
      const result = await send({type: "config"});
      if (!result.ok) return;
      settings = result;
      emit({action: "config", enabled: settings.enabled});
      showSession(result.session);
    } catch { /* Reloading the extension invalidates existing content scripts. */ }
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message.type === "session") showSession(message.session);
    if (message.type === "config") {
      settings = message;
      emit({action: "config", enabled: settings.enabled});
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.disabledSites) loadConfig();
  });

  window.addEventListener("message", async event => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.channel === FRAME && session && data.token === session.token && event.source !== window) {
      const iframe = [...document.querySelectorAll("iframe,frame")].find(frame => frame.contentWindow === event.source);
      if (!iframe) return;
      iframe.setAttribute("data-better-fullscreen-frame", session.token);
      emit({action: "expand-frame", token: session.token});
      if (window !== window.top) window.parent.postMessage({channel: FRAME, token: session.token}, "*");
      return;
    }
    if (event.source !== window || data.channel !== PAGE) return;
    if (data.action === "ready") {
      emit({action: "config", enabled: settings.enabled});
      return;
    }
    if (data.action === "expand-parent") {
      if (session && data.token === session.token && window !== window.top) {
        window.parent.postMessage({channel: FRAME, token: session.token}, "*");
      }
      return;
    }
    if (!["enter", "exit"].includes(data.action) || typeof data.id !== "string" || data.id.length > 100) return;
    if (data.action === "enter" && (!settings.enabled || !navigator.userActivation.isActive || document.visibilityState !== "visible")) {
      emit({action: "reply", id: data.id, ok: false, error: "Click the player's fullscreen button again."});
      return;
    }
    try {
      const result = await send({type: data.action});
      emit({action: "reply", id: data.id, ...result});
    } catch (error) {
      emit({action: "reply", id: data.id, ok: false, error: error.message});
    }
  });

  loadConfig();
})();
