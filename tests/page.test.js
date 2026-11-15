import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const source = await readFile(new URL("../extension/page.js",import.meta.url),"utf8");
const settle = () => new Promise(resolve=>setImmediate(resolve));

function setup({enabled=true,media=true,autoReply=true}={}) {
  let native = null, calls = 0;
  const messages = [], listeners = [], changes = [];
  const shorthands={
    inset:["top","right","bottom","left"],
    margin:["margin-top","margin-right","margin-bottom","margin-left"],
    padding:["padding-top","padding-right","padding-bottom","padding-left"],
    overflow:["overflow-x","overflow-y"],
    border:["top","right","bottom","left"].flatMap(side=>["width","style","color"].map(part=>`border-${side}-${part}`)),
    background:["background-image","background-color"]
  };
  class Style {
    constructor(){this.values=new Map();}
    [Symbol.iterator](){return this.values.keys();}
    setProperty(k,v,p=""){for(const name of shorthands[k]||[k])this.values.set(name,[v,p]);}
    getPropertyValue(k){const names=shorthands[k]||[k];const values=names.map(name=>this.values.get(name)?.[0]||"");return values.every(value=>value===values[0])?values[0]:"";}
    getPropertyPriority(k){const names=shorthands[k]||[k];const priorities=names.map(name=>this.values.get(name)?.[1]||"");return priorities.every(value=>value===priorities[0])?priorities[0]:"";}
    removeProperty(k){for(const name of shorthands[k]||[k])this.values.delete(name);}
  }
  class Element {
    constructor(tag="div"){this.tag=tag;this.style=new Style();this.attributes=new Map();this.children=[];this.isConnected=true;}
    matches(selector){return selector===this.tag;}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
    append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}}
    setAttribute(k,v){this.attributes.set(k,v);}
    getAttribute(k){return this.attributes.get(k)??null;}
    removeAttribute(k){this.attributes.delete(k);}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);this.isConnected=false;}
    dispatchEvent(event){changes.push({element:this,type:event.type});}
    focus(){document.activeElement=this;}
    attachShadow(){this.shadow=new Element("shadow");return this.shadow;}
    addEventListener(){}
    async requestFullscreen(){calls++;if(!navigator.userActivation.isActive)throw new DOMException("No gesture","NotAllowedError");native=this;}
  }
  class Document {
    get fullscreenElement(){return native;}
    async exitFullscreen(){native=null;}
    dispatchEvent(event){changes.push({element:this,type:event.type});}
    createElement(tag){return new Element(tag);}
    querySelector(){return null;}
  }
  const document=new Document();
  document.documentElement=new Element("html");document.head=new Element("head");document.body=new Element("body");
  document.documentElement.append(document.head,document.body);
  document.styleSheets=[];document.activeElement=document.body;document.fullscreenEnabled=true;
  const target=new Element("div");document.body.append(target);
  const video=new Element("video");if(media)target.append(video);
  target.style.setProperty("position","relative");document.body.style.setProperty("overflow","clip");
  const navigator={userActivation:{isActive:true}};
  const window={
    addEventListener(type,fn){if(type==="message")listeners.push(fn);},
    postMessage(data){queueMicrotask(()=>{const event={source:window,data};for(const listener of listeners)listener(event);});},
    dispatchEvent(){}
  };
  const emit=data=>window.postMessage({channel:"better-fullscreen:extension",...data});
  window.addEventListener("message",event=>{
    const data=event.data;if(data.channel!=="better-fullscreen:page")return;messages.push(data);
    if(data.action==="ready")emit({action:"config",enabled});
    if(!autoReply)return;
    if(data.action==="enter"){emit({action:"session",session:{token:"test-token"}});emit({action:"reply",id:data.id,ok:true,token:"test-token"});}
    if(data.action==="exit"){emit({action:"session",session:null});emit({action:"reply",id:data.id,ok:true});}
  });
  class Observer{observe(){}disconnect(){}}
  const context=vm.createContext({window,document,navigator,Element,Document,crypto,DOMException,Event,MutationObserver:Observer,CSS:{escape:s=>s},console,Map});
  vm.runInContext(source,context);
  return {document,window,target,video,navigator,messages,emit,changes,nativeCalls:()=>calls};
}

test("media request fills the viewport, exposes fullscreen state, then restores layout",async()=>{
  const app=setup();await settle();await app.target.requestFullscreen();
  assert.equal(app.nativeCalls(),0);assert.equal(app.document.fullscreenElement,app.target);
  assert.equal(app.target.style.getPropertyValue("position"),"fixed");
  assert.equal(app.target.style.getPropertyValue("height"),"100vh");
  assert.equal(app.changes.filter(x=>x.type==="fullscreenchange").length,1);
  await app.document.exitFullscreen();await settle();
  assert.equal(app.document.fullscreenElement,null);
  assert.equal(app.target.style.getPropertyValue("position"),"relative");
  assert.equal(app.document.body.style.getPropertyValue("overflow"),"clip");
  assert.equal(app.target.getAttribute("data-better-fullscreen-target"),null);
  assert.equal(app.changes.filter(x=>x.type==="fullscreenchange").length,2);
});

test("disabled sites and non-media targets call native fullscreen directly",async()=>{
  for(const options of [{enabled:false},{media:false}]){
    const app=setup(options);await settle();await app.target.requestFullscreen();
    assert.equal(app.nativeCalls(),1);assert.equal(app.messages.filter(m=>m.action==="enter").length,0);
    assert.equal(app.target.style.getPropertyValue("position"),"relative");
  }
});

test("return preserves partial inline longhands and priorities without reverting unrelated style updates",async()=>{
  const app=setup();await settle();
  const original={top:["40px","important"],"margin-left":["12px",""],"padding-bottom":["6px","important"],"border-bottom-color":["red",""],"background-image":["linear-gradient(red,blue)",""],"overflow-x":["clip","important"]};
  for(const [name,[value,priority]] of Object.entries(original))app.target.style.setProperty(name,value,priority);
  await app.target.requestFullscreen();
  app.target.style.setProperty("color","rebeccapurple");
  await app.document.exitFullscreen();await settle();
  for(const [name,[value,priority]] of Object.entries(original)){
    assert.equal(app.target.style.getPropertyValue(name),value,name);
    assert.equal(app.target.style.getPropertyPriority(name),priority,name);
  }
  assert.equal(app.target.style.getPropertyValue("color"),"rebeccapurple");
  assert.equal(app.target.style.getPropertyValue("right"),"");
});

test("requests without a gesture and disallowed fullscreen pass through to native policy",async()=>{
  const app=setup();await settle();app.navigator.userActivation.isActive=false;
  await assert.rejects(app.target.requestFullscreen(),/No gesture/);
  assert.equal(app.messages.filter(m=>m.action==="enter").length,0);
  app.navigator.userActivation.isActive=true;app.document.fullscreenEnabled=false;
  await app.target.requestFullscreen();assert.equal(app.messages.filter(m=>m.action==="enter").length,0);
});

test("Escape restoration arriving before the enter reply does not leave stale fullscreen state",async()=>{
  const app=setup({autoReply:false});await settle();
  const promise=app.target.requestFullscreen();await settle();const enter=app.messages.find(m=>m.action==="enter");
  app.emit({action:"session",session:{token:"test-token"}});
  app.emit({action:"session",session:null});
  app.emit({action:"reply",id:enter.id,ok:true,token:"test-token"});
  await promise;assert.equal(app.document.fullscreenElement,null);
  assert.equal(app.target.style.getPropertyValue("position"),"relative");
});

test("session failure rolls layout back and tries native fullscreen while gesture remains",async()=>{
  const app=setup({autoReply:false});await settle();
  const promise=app.target.requestFullscreen();await settle();const enter=app.messages.find(m=>m.action==="enter");
  app.emit({action:"reply",id:enter.id,ok:false,error:"Session failed"});
  await promise;assert.equal(app.nativeCalls(),1);
  assert.equal(app.target.style.getPropertyValue("position"),"relative");
});

test("expired activation offers recovery and rejects rather than claiming fullscreen succeeded",async()=>{
  const app=setup({autoReply:false});await settle();
  const promise=app.target.requestFullscreen();await settle();const enter=app.messages.find(m=>m.action==="enter");
  app.navigator.userActivation.isActive=false;app.emit({action:"reply",id:enter.id,ok:false,error:"Session failed"});
  await assert.rejects(promise,/Session failed/);
  assert.equal(app.document.fullscreenElement,null);
  assert.equal(app.target.style.getPropertyValue("position"),"relative");
  const recovery=app.document.documentElement.children.find(e=>e.shadow);
  assert.ok(recovery);assert.equal(recovery.shadow.children[1].children[1].textContent,"Use browser fullscreen");
});
