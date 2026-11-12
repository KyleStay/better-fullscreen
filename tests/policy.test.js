import test from "node:test";
import assert from "node:assert/strict";
import {siteKey} from "../extension/policy.js";

test("site overrides use web hostnames and never browser-internal URLs",()=>{
  assert.equal(siteKey("https://www.youtube.com/watch?v=123"),"youtube.com");
  assert.equal(siteKey("https://m.youtube.com/"),"m.youtube.com");
  for(const url of ["chrome://extensions","file:///video.mp4","javascript:alert(1)","not a URL"])assert.equal(siteKey(url),null);
});
