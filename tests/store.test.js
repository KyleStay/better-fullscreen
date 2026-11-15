import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";

test("store preparation refuses missing or stale capture receipts",()=>{
  const result=spawnSync("python3",["-B","-c",`
from pathlib import Path
import json,runpy,tempfile
check=runpy.run_path('scripts/prepare-store.py')['screenshot_problems']
with tempfile.TemporaryDirectory(prefix='better-fullscreen-store-check-') as temporary:
 root=Path(temporary);folder=root/'store/screenshots';folder.mkdir(parents=True)
 problems,shots=check(root,{'version':'0.3.0'})
 assert problems and not shots
 (folder/'capture.json').write_text(json.dumps({'cleanup':{'processes':0,'profiles':0},'storeCapture':{'verified':True,'version':'old','sourceFiles':{},'screenshots':[]}}))
 problems,shots=check(root,{'version':'0.3.0'})
 assert problems and 'version' in problems[0] and not shots
`],{encoding:"utf8"});
  assert.equal(result.status,0,result.stderr||result.stdout);
});
