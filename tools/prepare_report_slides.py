"""DhiRise · optimised backgrounds for who.html ("Who you are").

Reads assets/report/slide1.png … slide6.png (left untouched) and writes, for each,
assets/report/web/slideN.webp (quality 82) and slideN.jpg (fallback), at most 1080 px wide.

Run from the project folder:  python tools/prepare_report_slides.py
"""
from pathlib import Path
from PIL import Image

SRC = Path("assets/report")
OUT = SRC / "web"
MAX_W = 1080

OUT.mkdir(parents=True, exist_ok=True)
for n in range(1, 7):
    src = SRC / f"slide{n}.png"
    if not src.exists():
        print(f"missing {src}")
        continue
    im = Image.open(src).convert("RGB")
    if im.width > MAX_W:
        im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
    im.save(OUT / f"slide{n}.webp", "WEBP", quality=82, method=6)
    im.save(OUT / f"slide{n}.jpg", "JPEG", quality=82, optimize=True, progressive=True)
    print(f"slide{n}: {im.width}x{im.height}  "
          f"webp {(OUT / f'slide{n}.webp').stat().st_size // 1024} KB  jpg {(OUT / f'slide{n}.jpg').stat().st_size // 1024} KB")
