import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../extension/bridge.js",import.meta.url),"utf8");
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function setup({top=false,nativeFails=false}={}) {
  const listeners=new Map(),requests=[],emitted=[],order=[];let onMessage;
  class Element {
    constructor(tagName){this.tagName=tagName;this.children=[];this.style={};this.listeners=new Map();this.attributes=new Map();this.textContent="";}
    setAttribute(name,value){this.attributes.set(name,value);}getAttribute(name){return this.attributes.get(name);}
    append(...children){this.children.push(...children);}replaceChildren(...children){this.children=[...children];}
    attachShadow(){this.shadow=new Element();return this.shadow;}
    addEventListener(type,fn){this.listeners.set(type,fn);}
    remove(){this.removed=true;}
  }
  const window={top:{},parent:{postMessage(){}},addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},postMessage(data){emitted.push(data);}};
  if(top)window.top=window;
  const chrome={runtime:{async sendMessage(message){requests.push(message);order.push(message.type);return message.type==="config"?{ok:true,enabled:true,session:null}:{ok:true,token:"token"};},onMessage:{addListener(fn){onMessage=fn;}}},storage:{onChanged:{addListener(){}}}};
  const document={visibilityState:"visible",fullscreenElement:null,querySelectorAll:()=>[],createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag),addEventListener(type,fn){listeners.set('document:'+type,[fn]);}};
  document.documentElement=new Element();
  document.documentElement.requestFullscreen=async()=>{order.push('native-enter');if(nativeFails)throw Error('denied');document.fullscreenElement=document.documentElement;dispatch('document:fullscreenchange',{});};
  document.exitFullscreen=async()=>{order.push('native-exit');document.fullscreenElement=null;dispatch('document:fullscreenchange',{});};
  const navigator={userActivation:{isActive:true}};
  function dispatch(type,event){for(const listener of listeners.get(type)||[]){listener(event);if(event.stopped)break;}}
  vm.runInNewContext(source,{window,chrome,document,navigator,console});
  return {window,document,navigator,requests,emitted,order,activate:()=>onMessage({type:"session",session:{token:"token"}}),deactivate:()=>onMessage({type:"session",session:null}),dispatch,buttons:()=>document.documentElement.children.at(-1).shadow.children.filter(e=>e.listeners.has('click'))};
}
test("Escape in an embedded player is captured before site handlers and requests return",async()=>{
  const app=setup();await settle();app.activate();let swallowed=false;
  app.window.addEventListener("keydown",()=>{swallowed=true;});
  const event={key:"Escape",preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};
  app.dispatch("keydown",event);await settle();assert.equal(swallowed,false);assert.equal(event.prevented,true);assert.equal(app.requests.filter(m=>m.type==="exit").length,1);
});
test("Escape outside a view or during native fullscreen retains normal browser behavior",async()=>{
  const app=setup();await settle();const event={key:"Escape",preventDefault(){throw Error("should not prevent");},stopImmediatePropagation(){throw Error("should not stop");}};
  app.dispatch("keydown",event);app.activate();app.document.fullscreenElement=app.document.documentElement;app.dispatch("keydown",event);
  assert.equal(app.requests.some(m=>m.type==="exit"),false);
});
test("Native fullscreen button calls the real API directly before asynchronous messaging",async()=>{
  const app=setup({top:true});await settle();app.activate();const [native,back]=app.buttons();
  assert.equal(native.getAttribute('aria-label'),"Native fullscreen");assert.equal(back.getAttribute('aria-label'),"Return to page");
  const outward=native.children[0].children[0].getAttribute('d');
  const click=native.listeners.get('click')();assert.equal(app.order.at(-1),'native-enter');await click;
  assert.equal(app.document.fullscreenElement,app.document.documentElement);assert.equal(native.getAttribute('aria-label'),"Exit native fullscreen");
  assert.equal(native.title,"Exit native fullscreen");assert.notEqual(native.children[0].children[0].getAttribute('d'),outward);
  await native.listeners.get('click')();assert.equal(app.document.fullscreenElement,null);assert.equal(native.getAttribute('aria-label'),"Native fullscreen");
  assert.equal(native.children[0].children[0].getAttribute('d'),outward);
  assert.equal(app.requests.filter(r=>r.type==='exit').length,0);
});
test("icon controls have accessible names, tooltips and decorative SVGs without text labels",async()=>{
  const app=setup({top:true});await settle();app.activate();const [native,back]=app.buttons();
  for(const button of [native,back]){
    assert.equal(button.type,'button');assert.equal(button.textContent,'');
    assert.ok(button.getAttribute('aria-label'));assert.ok(button.title);
    assert.equal(button.children.length,1);assert.equal(button.children[0].tagName,'svg');
    assert.equal(button.children[0].getAttribute('aria-hidden'),'true');assert.equal(button.children[0].getAttribute('focusable'),'false');
  }
  assert.equal(native.title,'Native fullscreen');assert.equal(back.title,'Return to page (Esc)');
});
test("Return to page leaves native fullscreen before ending viewport mode",async()=>{
  const app=setup({top:true});await settle();app.activate();const [native,back]=app.buttons();
  await native.listeners.get('click')();await back.listeners.get('click')();
  assert.deepEqual(app.order.slice(-2),['native-exit','exit']);
});
test("native fullscreen failure keeps the view available and shows recovery",async()=>{
  const app=setup({top:true,nativeFails:true});await settle();app.activate();await app.buttons()[0].listeners.get('click')();
  const root=app.document.documentElement.children.at(-1).shadow;
  assert.match(root.children.at(-1).textContent,/couldn't open/);assert.equal(app.requests.some(r=>r.type==='exit'),false);
});
test("ending a native view through the extension exits real fullscreen",async()=>{
  const app=setup({top:true});await settle();app.activate();await app.buttons()[0].listeners.get('click')();app.deactivate();await settle();
  assert.equal(app.document.fullscreenElement,null);assert.equal(app.document.documentElement.children.at(-1).removed,true);
});
test("page bridge rejects privileged actions, missing activation, and messages from other frames",async()=>{
  const app=setup();await settle();
  app.dispatch("message",{source:app.window,data:{channel:"better-fullscreen:page",action:"set-enabled",id:"1"}});
  app.dispatch("message",{source:{},data:{channel:"better-fullscreen:page",action:"enter",id:"2"}});
  app.navigator.userActivation.isActive=false;
  app.dispatch("message",{source:app.window,data:{channel:"better-fullscreen:page",action:"enter",id:"3"}});
  await settle();assert.equal(app.requests.filter(m=>m.type!=="config").length,0);assert.equal(app.emitted.find(m=>m.id==="3").ok,false);
});
