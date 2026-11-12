import assert from "node:assert/strict";
import http from "node:http";
import {readFile, writeFile, mkdir, access} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {CDP, until} from "./cdp.mjs";

const exec = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const runnerDir = process.env.CHROME_TEST_RUNNER_DIR || "/Users/kyle/.codex/skills/chrome-extension-test-runner/scripts";
const evidenceDir = path.join(root, "artifacts", "qa");
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

try {
  const fixture = await readFile(path.join(root,"tests/fixtures/player.html"));
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
  record("live player fills current viewport without moving/resizing the window or creating tabs");

  async function toolbar(native) {
    const rect=await page.eval("document.querySelector('[data-better-fullscreen-control]').getBoundingClientRect().toJSON()");
    await page.send("Page.bringToFront");
    for(const type of ["mousePressed","mouseReleased"])await page.send("Input.dispatchMouseEvent",{type,x:native?rect.x+65:rect.right-65,y:rect.y+18,button:"left",clickCount:1});
  }
  await toolbar(true);
  await until(()=>page.eval("document.documentElement.matches(':fullscreen')"),"native button enters real fullscreen");
  await toolbar(true);
  await until(()=>page.eval("!document.documentElement.matches(':fullscreen')"),"native toggle leaves real fullscreen");
  assert.ok(await session(id));
  record("Native fullscreen button toggles real fullscreen while retaining viewport view");

  await page.click("#video");await page.escape();await returned(id);
  assert.equal(await page.eval("document.fullscreenElement"),null);
  assert.equal(await page.eval("document.querySelector('#player').style.cssText"),initialStyle);
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

  await open(page,id);await page.send("Page.navigate",{url:url+"?navigation=1"});await returned(id);
  await until(()=>page.eval("document.readyState==='complete'"),"navigation complete");await configReady(page);
  record("navigation clears viewport session");
  await worker.eval("chrome.storage.local.set({disabledSites:['127.0.0.1']})");
  await until(()=>page.eval(`new Promise(resolve=>{const timer=setTimeout(()=>{window.removeEventListener('message',f);resolve(false)},300);const f=e=>{if(e.data?.channel==='better-fullscreen:extension'&&e.data.action==='config'){clearTimeout(timer);window.removeEventListener('message',f);resolve(!e.data.enabled)}};window.addEventListener('message',f);window.postMessage({channel:'better-fullscreen:page',action:'ready'},'*')})`),"site override delivered");
  await page.click("#enter");await until(()=>page.eval("document.querySelector('#player').matches(':fullscreen')"),"native fullscreen for disabled site");
  assert.equal(await session(id),null);await page.eval("document.exitFullscreen()");
  await worker.eval("chrome.storage.local.set({disabledSites:[]})");await configReady(page);
  record("per-site off switch passes media requests to native fullscreen");
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
} catch(error) {
  results.failure=error.stack;
  console.error(error.stack);
  process.exitCode=1;
} finally {
  await cleanup().catch(error=>{console.error("Cleanup failed",error);process.exitCode=1});
}
