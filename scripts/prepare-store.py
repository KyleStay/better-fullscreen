"""Build the local submission kit and fail closed when actual screenshots are missing/stale."""
from pathlib import Path
import hashlib
import json
import shutil
import struct
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def png_size(path):
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Not a PNG: {path}")
    return struct.unpack(">II", data[16:24])


def screenshot_problems(root, manifest):
    folder = root / "store/screenshots"
    receipt = folder / "capture.json"
    if not receipt.is_file():
        return ["Genuine screenshots have not been captured and verified. Run npm run store:capture from a normal Terminal."], []
    try:
        data = json.loads(receipt.read_text())
        capture = data["storeCapture"]
        if data.get("failure") or capture.get("verified") is not True:
            raise ValueError("Capture was not successful")
        if data.get("cleanup", {}).get("processes") != 0 or data.get("cleanup", {}).get("profiles") != 0:
            raise ValueError("Capture cleanup is unverified")
        if capture["version"] != manifest["version"]:
            raise ValueError("Capture version differs from the package")
        required = {"manifest.json", "background.js", "policy.js", "bridge.js", "page.js", "popup.html", "popup.js", "ui.css", "privacy.html", "icons/16.png", "icons/32.png", "icons/48.png", "icons/128.png"}
        if set(capture["sourceFiles"]) != required:
            raise ValueError("Capture source inventory is incomplete")
        for name, digest in capture["sourceFiles"].items():
            if hashlib.sha256((root / "extension" / name).read_bytes()).hexdigest() != digest:
                raise ValueError(f"Screenshot source changed: {name}")
        shots = capture["screenshots"]
        if not 1 <= len(shots) <= 5:
            raise ValueError("One to five screenshots are required")
        for shot in shots:
            name = shot["name"]
            if Path(name).name != name:
                raise ValueError("Invalid screenshot filename")
            image = folder / name
            if png_size(image) not in ((1280, 800), (640, 400)):
                raise ValueError(f"Invalid screenshot dimensions: {name}")
            if hashlib.sha256(image.read_bytes()).hexdigest() != shot["sha256"]:
                raise ValueError(f"Screenshot changed: {name}")
        return [], [folder / shot["name"] for shot in shots]
    except (KeyError, ValueError, OSError, TypeError) as error:
        return [f"Screenshot verification failed: {error}"], []


def main():
    subprocess.run([sys.executable, str(ROOT / "scripts/package.py")], check=True)
    manifest = json.loads((ROOT / "extension/manifest.json").read_text())
    listing = json.loads((ROOT / "store/listing.json").read_text())
    assert 0 < len(manifest["description"]) <= 132
    assert 0 < len(listing["summary"]) <= 132
    archive = ROOT / "artifacts" / f"better-fullscreen-{manifest['version']}.zip"
    with zipfile.ZipFile(archive) as source:
        assert "manifest.json" in source.namelist() and source.testzip() is None
    kit = ROOT / "artifacts/chrome-web-store"
    kit.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(archive, kit / archive.name)
    for source, target in [("store/listing.json", "listing.json"), ("store/description.txt", "description.txt"), ("store/review-instructions.txt", "review-instructions.txt"), ("store/PUBLISHING.md", "START-HERE.md"), ("PRIVACY.md", "PRIVACY.md")]:
        shutil.copyfile(ROOT / source, kit / target)
    (kit / "assets").mkdir(exist_ok=True)
    for name, size in [("icon-128.png", (128, 128)), ("promo-small.png", (440, 280)), ("promo-marquee.png", (1400, 560))]:
        source = ROOT / "store/assets" / name
        assert png_size(source) == size, name
        shutil.copyfile(source, kit / "assets" / name)
    problems, shots = screenshot_problems(ROOT, manifest)
    if shots:
        (kit / "screenshots").mkdir(exist_ok=True)
        for shot in shots:
            shutil.copyfile(shot, kit / "screenshots" / shot.name)
        shutil.copyfile(ROOT / "store/screenshots/capture.json", kit / "screenshots/capture.json")
    report = {"version": manifest["version"], "readyToUpload": not problems, "remaining": problems, "extensionZip": archive.name, "extensionSha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "screenshots": [p.name for p in shots], "requiresHumanDashboardReview": True, "submitted": False}
    (kit / "READINESS.json").write_text(json.dumps(report, indent=2) + "\n")
    bundle = ROOT / "artifacts/better-fullscreen-chrome-web-store-kit.zip"
    with zipfile.ZipFile(bundle, "w", zipfile.ZIP_DEFLATED) as output:
        for path in sorted(p for p in kit.rglob("*") if p.is_file()):
            output.write(path, path.relative_to(kit))
    print(f"Submission kit: {kit}")
    print(f"Download bundle: {bundle}")
    if problems:
        print("NOT READY TO UPLOAD:\n- " + "\n- ".join(problems))
        return 2
    print("Local screenshot/package checks passed. Inspect images and confirm public URLs and live-site compatibility before submitting.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
