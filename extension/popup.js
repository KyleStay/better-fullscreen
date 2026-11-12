const toggle = document.querySelector("#enabled");
const status = document.querySelector("#status");
const returnButton = document.querySelector("#return");
let tab;
async function send(message) {
  const result = await chrome.runtime.sendMessage({tabId: tab.id, ...message});
  if (!result.ok) throw new Error(result.error);
  return result;
}
try {
  [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
  if (!tab) throw new Error("No browser tab selected.");
  const result = await send({type: "status"});
  document.querySelector("#site").textContent = result.site || "this page";
  toggle.checked = result.enabled;
  toggle.disabled = !result.site || !result.supported;
  returnButton.hidden = !result.active;
  if (!result.supported) status.textContent = "Better Fullscreen supports macOS.";
  else if (!result.site) status.textContent = "Open a website to enable Better Fullscreen.";
} catch (error) { status.textContent = error.message; }
toggle.addEventListener("change", async () => {
  toggle.disabled = true;
  try {
    await send({type: "set-enabled", enabled: toggle.checked});
    status.textContent = "";
    if (!toggle.checked) returnButton.hidden = true;
  } catch (error) { toggle.checked = !toggle.checked; status.textContent = error.message; }
  finally { toggle.disabled = false; }
});
returnButton.addEventListener("click", async () => {
  try { await send({type: "exit"}); window.close(); }
  catch (error) { status.textContent = error.message; }
});
