"""Package the unpacked MV3 extension without dependencies or remote CI."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
extension = root / "extension"
manifest = json.loads((extension / "manifest.json").read_text())
artifacts = root / "artifacts"
artifacts.mkdir(exist_ok=True)
output = artifacts / f"better-fullscreen-{manifest['version']}.zip"
files = sorted(p for p in extension.rglob("*") if p.is_file())
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in files:
        info = zipfile.ZipInfo(path.relative_to(extension).as_posix(), (2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, path.read_bytes())
digest = hashlib.sha256(output.read_bytes()).hexdigest()
(artifacts / "checksums.txt").write_text(f"{digest}  {output.name}\n")
(artifacts / "manifest.json").write_text(json.dumps({
    "name": manifest["name"], "version": manifest["version"],
    "source": "uncommitted workspace snapshot", "archive": output.name,
    "sha256": digest, "runtime_verification": "unverified; see repository docs/qa.md",
    "files": [{"path": p.relative_to(extension).as_posix(),
               "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
}, indent=2) + "\n")
print(f"{output}\nSHA256 {digest}")
