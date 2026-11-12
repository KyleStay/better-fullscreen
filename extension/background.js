import {siteKey} from "./policy.js";

const key = id => `media:${id}`;
const readSession = async id => (await chrome.storage.session.get(key(id)))[key(id)];
const broadcast = (id, message) => chrome.tabs.sendMessage(id, message).catch(() => {});
const locks = new Map();

function serialized(id, action) {
  const next = (locks.get(id) || Promise.resolve()).catch(() => {}).then(action);
  locks.set(id, next);
  next.finally(() => { if (locks.get(id) === next) locks.delete(id); }).catch(() => {});
  return next;
}

async function config(tab) {
  const site = siteKey(tab.url);
  const {disabledSites = []} = await chrome.storage.local.get("disabledSites");
  const platform = await chrome.runtime.getPlatformInfo();
  return {site, enabled: platform.os === "mac" && !!site && !disabledSites.includes(site), supported: platform.os === "mac"};
}

async function exit(id) {
  await chrome.storage.session.remove(key(id));
  await broadcast(id, {type: "session", session: null});
  return {};
}

async function enter(id) {
  const tab = await chrome.tabs.get(id);
  if (!tab.active || !(await config(tab)).enabled) throw new Error("Fullscreen replacement is disabled on this site.");
  const existing = await readSession(id);
  if (existing) return {token: existing.token};
  const session = {token: crypto.randomUUID()};
  await chrome.storage.session.set({[key(id)]: session});
  await broadcast(id, {type: "session", session});
  return session;
}

async function handle(message, sender) {
  if (!message || typeof message !== "object") throw new Error("Invalid request.");
  if (sender.tab) {
    const id = sender.tab.id;
    if (message.type === "config") {
      return {...await config(await chrome.tabs.get(id)), session: await readSession(id) || null};
    }
    if (message.type === "enter") return serialized(id, () => enter(id));
    if (message.type === "exit") return serialized(id, () => exit(id));
    throw new Error("Unknown page request.");
  }
  // Page messages can affect only their own media view, never preferences or other tabs.
  if (!sender.url?.startsWith(chrome.runtime.getURL(""))) throw new Error("Invalid caller.");
  if (!Number.isInteger(message.tabId)) throw new Error("No tab selected.");
  const tab = await chrome.tabs.get(message.tabId);
  if (message.type === "status") return {...await config(tab), active: !!await readSession(tab.id)};
  if (message.type === "exit") return serialized(tab.id, () => exit(tab.id));
  if (message.type === "set-enabled" && typeof message.enabled === "boolean") {
    const site = siteKey(tab.url);
    if (!site) throw new Error("This page cannot use Better Fullscreen.");
    const {disabledSites = []} = await chrome.storage.local.get("disabledSites");
    const sites = new Set(disabledSites);
    message.enabled ? sites.delete(site) : sites.add(site);
    await chrome.storage.local.set({disabledSites: [...sites]});
    await broadcast(tab.id, {type: "config", ...await config(tab)});
    if (!message.enabled) await serialized(tab.id, () => exit(tab.id));
    return {};
  }
  throw new Error("Unknown request.");
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  handle(message, sender).then(value => reply({ok: true, ...value}), error => reply({ok: false, error: error.message}));
  return true;
});
chrome.tabs.onRemoved.addListener(id => {
  serialized(id, () => chrome.storage.session.remove(key(id))).catch(console.error);
});
chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.status === "loading") serialized(id, () => exit(id)).catch(console.error);
});
