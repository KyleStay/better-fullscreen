import assert from "node:assert/strict";
import http from "node:http";
import {readFile, writeFile, mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {CDP, until} from "./cdp.mjs";

const exec = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const runnerDir = process.env.CHROME_TEST_RUNNER_DIR || "/Users/kyle/.codex/skills/chrome-extension-test-runner/scripts";
const evidenceDir = path.join(root, "artifacts", "qa");
const storeCapture = process.env.STORE_CAPTURE === "1";
const captured = [];
await mkdir(evidenceDir, {recursive:true});
const results = {started: new Date().toISOString(), checks: [], errors: [], cleanup: null};
let server, browser, launch, worker, workerInfo;
let cleaned = false;
const record = name => { results.checks.push(name); console.log(`PASS ${name}`); };

async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  if (browser) await browser.send("Browser.close").catch(() => {});
  if (launch?.profile_dir) {
    const script = "import sys,json;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from test_chrome_owner import cleanup; p=Path(sys.argv[2]);s=json.loads((p/'.test-chrome-owner.json').read_text()) if p.exists() else None;ok=cleanup(s) if s else True;print(json.dumps({'processes':0 if ok else 'unknown','profiles':0 if not p.exists() else 1}));sys.exit(0 if ok else 1)";
    const {stdout} = await exec("python3", ["-c", script, runnerDir, launch.profile_dir], {timeout:20000});
    results.cleanup = JSON.parse(stdout);
  } else results.cleanup = {processes:0, profiles:0, note:"No browser launched"};
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  results.finished = new Date().toISOString();
  await writeFile(path.join(evidenceDir,"browser-results.json"), JSON.stringify(results,null,2)+"\n");
  console.log(`CLEANUP ${JSON.stringify(results.cleanup)}`);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { cleanup().finally(()=>process.exit(1)); });

async function targets() { return (await browser.send("Target.getTargets")).targetInfos; }
async function attachPage(url) {
  const info = await until(async()=> (await targets()).find(t=>t.type==="page" && t.url===url), `page ${url}`);
  const page = await browser.attach(info.targetId);
  await page.send("Runtime.enable");
  await page.send("Page.enable");
  browser.listeners.push(message => {
    if (message.sessionId===page.sessionId && message.method==="Runtime.exceptionThrown") results.errors.push(message.params.exceptionDetails.text);
  });
  return page;
}
async function configReady(page) {
  return until(()=>page.eval(`new Promise(resolve=>{const timer=setTimeout(()=>{window.removeEventListener('message',listener);resolve(false)},600);function listener(e){if(e.source===window&&e.data?.channel==='better-fullscreen:extension'&&e.data.action==='config'){clearTimeout(timer);window.removeEventListener('message',listener);resolve(e.data.enabled)}}window.addEventListener('message',listener);window.postMessage({channel:'better-fullscreen:page',action:'ready'},'*')})`), "content script enabled");
}
const session = id => worker.eval(`chrome.storage.session.get('media:${id}').then(x=>x['media:${id}']||null)`);
async function open(page, id) {
  await page.click("#enter");
  await until(()=>page.eval("window.entry==='opened'"), "fullscreen promise resolved");
  return until(async()=>{const s=await session(id);return s?.token ? s : false}, "viewport session");
}
async function returned(id) { await until(async()=> !(await session(id)), "tab restored"); }

async function screenshot(page, name, label) {
  if (!storeCapture) return;
  const size = await page.eval("({width:innerWidth,height:innerHeight})");
  assert.deepEqual(size, {width:1280,height:800});
  const {data} = await page.send("Page.captureScreenshot", {format:"png", captureBeyondViewport:false});
  const bytes = Buffer.from(data,"base64");
  assert.equal(bytes.readUInt32BE(16),1280);assert.equal(bytes.readUInt32BE(20),800);
  const file = path.join(evidenceDir, name);
  await writeFile(file,bytes);
  captured.push({file,name,label,sha256:createHash("sha256").update(bytes).digest("hex")});
}

try {
  const fixture = await readFile(path.join(root,storeCapture ? "store/demo/index.html" : "tests/fixtures/player.html"));
  server = http.createServer((req,res)=>{
    res.setHeader("Content-Type","text/html; charset=utf-8");
    if (req.url.startsWith("/embed")) res.end(`<!doctype html><title>Embedded video fixture</title><style>body{margin:24px;font:16px system-ui}iframe{width:720px;height:600px}</style><h1>Embedded video</h1><iframe src="http://localhost:${server.address().port}/player" allow="fullscreen; autoplay" allowfullscreen></iframe>`);
    else res.end(fixture);
  });
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)});
  const url = `http://127.0.0.1:${server.address().port}/player`;
  const args = [path.join(runnerDir,"launch_test_chrome.py"), "--extension",path.join(root,"extension"),"--owner-pid",String(process.pid),"--url",url];
  if (process.env.HEADLESS === "1") args.push("--headless");
  const {stdout} = await exec("python3",args,{timeout:30000,maxBuffer:2e6});
  launch = JSON.parse(stdout);
  results.launch = {pid:launch.pid, profile:launch.profile_dir, debugger_ready:launch.debugger_ready, extension_loaded:launch.extension_loaded, extension_id:launch.extension_id};
  assert.equal(launch.debugger_ready,true);
  assert.equal(launch.extension_loaded,true);
  const version = await (await fetch(`http://127.0.0.1:${launch.debug_port}/json/version`)).json();
  results.browser = version.Browser;
  browser = await CDP.connect(version.webSocketDebuggerUrl);
  workerInfo = await until(async()=> (await targets()).find(t=>t.type==="service_worker" && t.url.includes(launch.extension_id)), "extension worker");
  worker = await browser.attach(workerInfo.targetId);
  await worker.send("Runtime.enable");
  let page = await attachPage(url);
  if (storeCapture) await page.send("Emulation.setDeviceMetricsOverride",{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await configReady(page);
  const tab = await worker.eval(`chrome.tabs.query({url:${JSON.stringify(url)}}).then(t=>t[0])`);
  let id = tab.id;
  const initialStyle = await page.eval("document.querySelector('#player').style.cssText");
  const before = await page.eval("({width:innerWidth,height:innerHeight,time:document.querySelector('video').currentTime})");
  const sourceWindow = await worker.eval(`chrome.windows.get(${tab.windowId})`);
  const tabCount = await worker.eval("chrome.tabs.query({}).then(t=>t.length)");
  await open(page,id);
  const view = await page.eval("({width:innerWidth,height:innerHeight,player:document.querySelector('#player').getBoundingClientRect().toJSON(),native:document.documentElement.matches(':fullscreen'),element:document.fullscreenElement?.id,caption:getComputedStyle(document.querySelector('#caption')).color,paused:document.querySelector('video').paused})");
  assert.equal(view.element,"player");assert.equal(view.native,false);
  assert.equal(view.width,before.width);assert.equal(view.height,before.height);
  assert.equal(view.caption,"rgb(120, 230, 255)");assert.equal(view.paused,false);
  assert.ok(Math.abs(view.player.width-view.width)<2 && Math.abs(view.player.height-view.height)<2);
  assert.equal((await worker.eval(`chrome.tabs.get(${id})`)).windowId,tab.windowId);
  assert.deepEqual(await worker.eval(`chrome.windows.get(${tab.windowId})`),sourceWindow);
  assert.equal(await worker.eval("chrome.tabs.query({}).then(t=>t.length)"),tabCount);
  await until(()=>page.eval(`document.querySelector('video').currentTime>${before.time+0.2}`),"playback continues");
  const {data} = await page.send("Page.captureScreenshot",{format:"png"});
  await writeFile(path.join(evidenceDir,"media-viewport.png"),Buffer.from(data,"base64"));
  await screenshot(page,"01-viewport.png","Actual media view in the current tab");
  record("live player fills current viewport without moving/resizing the window or creating tabs");

  async function toolbar(native) {
    const rect=await page.eval("document.querySelector('[data-better-fullscreen-control]').getBoundingClientRect().toJSON()");
    await page.send("Page.bringToFront");
    for(const type of ["mousePressed","mouseReleased"])await page.send("Input.dispatchMouseEvent",{type,x:native?rect.x+22:rect.right-22,y:rect.y+22,button:"left",clickCount:1});
  }
  await toolbar(true);
  await until(()=>page.eval("document.documentElement.matches(':fullscreen')"),"native button enters real fullscreen");
  await screenshot(page,"02-native-fullscreen.png","Actual native fullscreen with inward-corners control");
  await toolbar(true);
  await until(()=>page.eval("!document.documentElement.matches(':fullscreen')"),"native toggle leaves real fullscreen");
  assert.ok(await session(id));
  record("Native fullscreen button toggles real fullscreen while retaining viewport view");

  await page.click("#video");await page.escape();await returned(id);
  assert.equal(await page.eval("document.fullscreenElement"),null);
  assert.equal(await page.eval("document.querySelector('#player').style.cssText"),initialStyle);
  await screenshot(page,"03-return-to-page.png","Actual page after Escape restores the layout");
  record("Escape wins over player key handlers and restores page layout");
  await open(page,id);await page.click("#exit");await returned(id);
  record("player exit-fullscreen control restores page");
  await open(page,id);await toolbar(false);await returned(id);
  record("visible Return to page control restores page");

  await open(page,id);await toolbar(true);
  await until(()=>page.eval("document.documentElement.matches(':fullscreen')"),"native fullscreen opens again");
  await toolbar(false);await returned(id);
  await until(()=>page.eval("!document.documentElement.matches(':fullscreen')"),"return leaves native fullscreen");
  record("Return to page also exits native fullscreen");

  const originalInline=await page.eval("({player:document.querySelector('#player').style.cssText,clipped:document.querySelector('#clipped').style.cssText})");
  await page.eval(`(()=>{const player=document.querySelector('#player'),clipped=document.querySelector('#clipped');clipped.style.contain='none';clipped.style.overflow='visible';player.style.setProperty('top','40px','important');player.style.setProperty('margin-left','12px');player.style.setProperty('padding-bottom','6px','important');player.style.setProperty('overflow-x','clip','important')})()`);
  await open(page,id);
  await page.eval("document.querySelector('#player').style.color='rebeccapurple'");
  await toolbar(false);await returned(id);
  const restored=await page.eval("(()=>{const s=document.querySelector('#player').style;return {top:s.getPropertyValue('top'),topPriority:s.getPropertyPriority('top'),margin:s.getPropertyValue('margin-left'),padding:s.getPropertyValue('padding-bottom'),paddingPriority:s.getPropertyPriority('padding-bottom'),overflow:s.getPropertyValue('overflow-x'),overflowPriority:s.getPropertyPriority('overflow-x'),color:s.color}})()");
  assert.deepEqual(restored,{top:'40px',topPriority:'important',margin:'12px',padding:'6px',paddingPriority:'important',overflow:'clip',overflowPriority:'important',color:'rebeccapurple'});
  await page.eval(`(()=>{const p=document.querySelector('#player');p.style.cssText=${JSON.stringify(originalInline.player)};p.style.setProperty('--gap','12px');p.style.setProperty('margin','var(--gap)');p.style.setProperty('margin-inline-start','24px');p.style.setProperty('top','20px','important');p.style.setProperty('inset-block-start','40px','important')})()`);
  const variableBefore=await page.eval("(()=>{const p=document.querySelector('#player'),s=getComputedStyle(p);return {css:p.style.cssText,top:s.top,margin:s.marginLeft}})()");
  await open(page,id);await toolbar(false);await returned(id);
  const variableAfter=await page.eval("(()=>{const p=document.querySelector('#player'),s=getComputedStyle(p);return {css:p.style.cssText,top:s.top,margin:s.marginLeft}})()");
  assert.deepEqual(variableAfter,variableBefore);
  await page.eval(`document.querySelector('#player').style.cssText=${JSON.stringify(originalInline.player)};document.querySelector('#clipped').style.cssText=${JSON.stringify(originalInline.clipped)}`);
  record("real CSSOM restores partial longhands, variables and declaration order without losing unrelated updates");

  await open(page,id);await page.send("Page.navigate",{url:url+"?navigation=1"});await returned(id);
  await until(()=>page.eval("document.readyState==='complete'"),"navigation complete");await configReady(page);
  record("navigation clears viewport session");
  await worker.eval("chrome.storage.local.set({disabledSites:['127.0.0.1']})");
  await until(()=>page.eval(`new Promise(resolve=>{const timer=setTimeout(()=>{window.removeEventListener('message',f);resolve(false)},300);const f=e=>{if(e.data?.channel==='better-fullscreen:extension'&&e.data.action==='config'){clearTimeout(timer);window.removeEventListener('message',f);resolve(!e.data.enabled)}};window.addEventListener('message',f);window.postMessage({channel:'better-fullscreen:page',action:'ready'},'*')})`),"site override delivered");
  await page.click("#enter");await until(()=>page.eval("document.querySelector('#player').matches(':fullscreen')"),"native fullscreen for disabled site");
  assert.equal(await session(id),null);await page.eval("document.exitFullscreen()");
  await worker.eval("chrome.storage.local.set({disabledSites:[]})");await configReady(page);
  record("per-site off switch passes media requests to native fullscreen");
  // Keep this non-media fixture out of store images, then reveal it for the real-input check.
  await page.eval("document.querySelector('#slides').style.display='block'");
  await page.click("#slides-enter");await until(()=>page.eval("document.querySelector('#slides').matches(':fullscreen')"),"nonmedia native fullscreen");
  assert.equal(await session(id),null);await page.eval("document.exitFullscreen()");
  record("non-media fullscreen requests retain native behavior");

  const embedURL=`http://127.0.0.1:${server.address().port}/embed`;
  await browser.send("Target.createTarget",{url:embedURL});page=await attachPage(embedURL);
  const childInfo=await until(async()=> (await targets()).find(t=>t.type==="iframe"&&t.url.includes("localhost")),"cross-origin iframe");
  const child=await browser.attach(childInfo.targetId);await child.send("Runtime.enable");await configReady(child);
  id=(await worker.eval(`chrome.tabs.query({url:${JSON.stringify(embedURL)}}).then(t=>t[0])`)).id;
  const rect=await child.eval("document.querySelector('#enter').getBoundingClientRect().toJSON()");
  const frameRect=await page.eval("document.querySelector('iframe').getBoundingClientRect().toJSON()");
  await page.send("Page.bringToFront");
  for(const type of ["mousePressed","mouseReleased"])await page.send("Input.dispatchMouseEvent",{type,x:frameRect.x+rect.x+rect.width/2+2,y:frameRect.y+rect.y+rect.height/2+2,button:"left",clickCount:1});
  await until(()=>child.eval("window.entry==='opened'"),"embedded player opens");
  await until(()=>page.eval("Math.abs(document.querySelector('iframe').getBoundingClientRect().width-innerWidth)<2"),"parent iframe fills viewport");
  await page.escape();await returned(id);
  record("cross-origin embedded player fills viewport and focused-child Escape restores page");

  assert.equal(results.errors.length,0,`Page exceptions: ${results.errors}`);
  if (storeCapture) {
    const output=path.join(root,"store/screenshots");await mkdir(output,{recursive:true});
    for(const capture of captured)await writeFile(path.join(output,capture.name),await readFile(capture.file));
    const manifest=JSON.parse(await readFile(path.join(root,"extension/manifest.json"),"utf8"));
    const sourceFiles=["manifest.json","background.js","policy.js","bridge.js","page.js","popup.html","popup.js","ui.css","privacy.html","icons/16.png","icons/32.png","icons/48.png","icons/128.png"];
    const hashes={};for(const file of sourceFiles)hashes[file]=createHash("sha256").update(await readFile(path.join(root,"extension",file))).digest("hex");
    results.storeCapture={version:manifest.version,sourceFiles:hashes,screenshots:captured.map(({file,...capture})=>capture),originalContent:true,source:"Actual extension in isolated Chrome for Testing on the original project demo",verified:true};
  }
} catch(error) {
  results.failure=error.stack;
  console.error(error.stack);
  process.exitCode=1;
} finally {
  await cleanup().catch(error=>{console.error("Cleanup failed",error);process.exitCode=1});
  if(storeCapture && !results.failure && results.cleanup?.processes===0 && results.cleanup?.profiles===0) {
    const receipt={started:results.started,finished:results.finished,browser:results.browser,checks:results.checks,cleanup:results.cleanup,storeCapture:results.storeCapture};
    await writeFile(path.join(root,"store/screenshots/capture.json"),JSON.stringify(receipt,null,2)+"\n");
  }
}
