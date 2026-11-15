"""Rasterize the original vector branding; these are promotional images, not screenshots."""
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
renderer = shutil.which("rsvg-convert")
if not renderer:
    raise SystemExit("rsvg-convert is required to regenerate the vector artwork. Existing PNGs can be used directly.")
assets = root / "store/assets"
for size in (16, 32, 48, 128):
    subprocess.run([renderer, "-w", str(size), "-h", str(size), "-o", str(root / f"extension/icons/{size}.png"), str(assets / "icon.svg")], check=True)
shutil.copyfile(root / "extension/icons/128.png", assets / "icon-128.png")
for name in ("promo-small", "promo-marquee"):
    subprocess.run([renderer, "-o", str(assets / f"{name}.png"), str(assets / f"{name}.svg")], check=True)
print("Rendered 128px store icon, 440×280 promo, 1400×560 marquee and extension icons.")
