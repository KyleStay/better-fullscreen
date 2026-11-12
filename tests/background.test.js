import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";
import {siteKey} from "../extension/policy.js";

const code=(await readFile(new URL("../extension/background.js",import.meta.url),"utf8")).replace(/^import[^\n]+\n/,"");
const clone=value=>structuredClone(value);
function setup(options={}) {
  const tabs=new Map([[2,{id:2,windowId:1,index:0,active:true,pinned:true,groupId:3,url:"https://www.youtube.com/watch?v=test"}]]);
  const storage={local:{},session:{}},messages=[],events={};
  const event=name=>({addListener:fn=>events[name]=fn});
  const area=name=>({
    async get(key){return clone(key in storage[name]?{[key]:storage[name][key]}:{});},
    async set(value){Object.assign(storage[name],clone(value));},
    async remove(key){delete storage[name][key];}
  });
  // Window, tab-move and tab-create APIs are deliberately absent: viewport mode must never call them.
  const chrome={
    runtime:{getURL:p=>`chrome-extension://test/${p}`,getPlatformInfo:async()=>({os:options.os||"mac"}),onMessage:event("message")},
    storage:{local:area("local"),session:area("session")},
    tabs:{async get(id){if(!tabs.has(id))throw Error("No tab");return clone(tabs.get(id));},async sendMessage(id,message){messages.push({id,...clone(message)});},onRemoved:event("removed"),onUpdated:event("updated")}
  };
  function restart(){const context=vm.createContext({chrome,siteKey,crypto,console,Map,Set});vm.runInContext(code,context);return vm.runInContext("handle",context);}
  const sender={tab:clone(tabs.get(2)),frameId:0,documentId:"doc-1",url:tabs.get(2).url};
  return {tabs,storage,messages,events,handle:restart(),sender,restart};
}

test("viewport session leaves the original tab, window, pin and group intact without creating tabs",async()=>{
  const app=setup(),before=clone(app.tabs.get(2));
  const entered=await app.handle({type:"enter"},app.sender);
  assert.equal(typeof entered.token,"string");assert.equal(app.messages.at(-1).session.token,entered.token);
  await app.handle({type:"exit"},app.sender);
  assert.deepEqual(app.tabs.get(2),before);assert.equal(app.tabs.size,1);
  assert.equal(app.storage.session["media:2"],undefined);assert.equal(app.messages.at(-1).session,null);
});
test("concurrent enter and Escape requests share a single session and exit cleanly",async()=>{
  const app=setup();const entered=await Promise.all([app.handle({type:"enter"},app.sender),app.handle({type:"enter"},app.sender)]);
  assert.equal(entered[0].token,entered[1].token);
  await Promise.all([app.handle({type:"exit"},app.sender),app.handle({type:"exit"},app.sender)]);
  assert.equal(app.storage.session["media:2"],undefined);
});
test("page messages cannot modify preferences or act on another tab",async()=>{
  const app=setup();app.storage.local.disabledSites=["youtube.com"];
  await assert.rejects(app.handle({type:"enter",tabId:123},app.sender),/disabled/);
  await assert.rejects(app.handle({type:"set-enabled",enabled:true,tabId:2},app.sender),/Unknown page request/);
  assert.deepEqual(app.storage.local.disabledSites,["youtube.com"]);
  app.storage.local.disabledSites=[];await app.handle({type:"enter",tabId:123},app.sender);
  assert.ok(app.storage.session["media:2"]);assert.equal(app.storage.session["media:123"],undefined);
});
test("per-site off switch persists override and ends viewport session",async()=>{
  const app=setup();await app.handle({type:"enter"},app.sender);
  await app.handle({type:"set-enabled",tabId:2,enabled:false},{url:"chrome-extension://test/popup.html"});
  assert.deepEqual(app.storage.local.disabledSites,["youtube.com"]);assert.equal(app.storage.session["media:2"],undefined);
});
test("session and return survive service worker restart",async()=>{
  const app=setup();const entered=await app.handle({type:"enter"},app.sender);const restarted=app.restart();
  const config=await restarted({type:"config"},app.sender);assert.equal(config.session.token,entered.token);
  await restarted({type:"exit"},app.sender);assert.equal(app.storage.session["media:2"],undefined);
});
test("navigation and closing the tab clear viewport sessions",async()=>{
  const app=setup();await app.handle({type:"enter"},app.sender);app.events.updated(2,{status:"loading"});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(app.storage.session["media:2"],undefined);
  await app.handle({type:"enter"},app.sender);app.events.removed(2);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(app.storage.session["media:2"],undefined);
});
test("inactive tabs and non-macOS platforms cannot start replacement",async()=>{
  const app=setup();app.tabs.get(2).active=false;await assert.rejects(app.handle({type:"enter"},app.sender),/disabled/);
  const other=setup({os:"linux"});const config=await other.handle({type:"config"},other.sender);
  assert.equal(config.enabled,false);assert.equal(config.supported,false);
});
