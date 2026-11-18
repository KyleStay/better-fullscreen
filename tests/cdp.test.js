import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {CDP} from "./cdp.mjs";

async function targetFor(element) {
  const input=[];
  const client=new CDP({addEventListener(){}});
  client.send=async(method,params)=>{
    if(method==="Target.attachToTarget")return {sessionId:"fixture"};
    if(method==="Runtime.evaluate")return {result:{value:vm.runInNewContext(params.expression,{document:{querySelector:()=>element}})}};
    if(method==="Input.dispatchMouseEvent")input.push(params);
    return {};
  };
  return {target:await client.attach("fixture"),input};
}

test("CDP clicks scroll to a visible target before measuring it",async()=>{
  let scrolled=false;
  const {target,input}=await targetFor({scrollIntoView(){scrolled=true;},getBoundingClientRect(){return {x:scrolled?100:3000,y:50,width:40,height:20};}});
  await target.click("#button");
  assert.equal(scrolled,true);assert.equal(input.length,2);
  assert.equal(input[0].x,120);assert.equal(input[0].y,60);
});

test("CDP clicks reject hidden targets instead of clicking the page origin",async()=>{
  const {target,input}=await targetFor({scrollIntoView(){},getBoundingClientRect(){return {x:0,y:0,width:0,height:0};}});
  await assert.rejects(target.click("#hidden"),/Click target is hidden/);
  assert.equal(input.length,0);
});
