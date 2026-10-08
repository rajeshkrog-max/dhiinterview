"""Dhirise · prepare the card images (Part C1). RETIRED: the card now uses the owl design (js/card.js);
these frame/hero sources and their output were moved to assets/cards/_unused/. Kept so the old card can be rebuilt.
Reads assets/cards/_unused/*.png (never modified) and writes everything to assets/cards/_unused/final/.
Run from the project root:  python tools/prepare_cards.py
"""
import json, os
import numpy as np
from PIL import Image

SRC = "assets/cards/_unused"
LIVE = "public/dhiinterviews/assets/cards"                      # card-back.png and story-bg.png stayed here
OUT = os.path.join(SRC, "final")
os.makedirs(OUT, exist_ok=True)
FRAMES = ["explorer", "achiever", "builder"]
FW, FH = 1080, 1620

# The name text box inside each bottom banner, in source pixels (1024x1536): x0, y0, x1, y1.
# Measured from brightness profiles of the plaques; covers the name and its two sparkles.
BANNER = {
    "explorer": (232, 1322, 812, 1396),   # purple
    "achiever": (222, 1288, 818, 1352),   # orange
    "builder":  (226, 1298, 814, 1366),   # green
}


# ---------- small numpy helpers (no scipy) ----------
def shift(m, dy, dx):
    out = np.zeros_like(m)
    h, w = m.shape
    ys, yd = (slice(0, h - dy), slice(dy, h)) if dy >= 0 else (slice(-dy, h), slice(0, h + dy))
    xs, xd = (slice(0, w - dx), slice(dx, w)) if dx >= 0 else (slice(-dx, w), slice(0, w + dx))
    out[yd, xd] = m[ys, xs]
    return out


def dilate(m, r=1):
    out = m.copy()
    for _ in range(r):
        n = out.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n |= shift(out, dy, dx)
        out = n
    return out


def flood(cand, seeds):
    """Connected parts of cand reachable from seeds (4-connected)."""
    reg = cand & seeds
    while True:
        grown = dilate(reg, 8) & cand
        if grown.sum() == reg.sum():
            return grown
        reg = grown


def box_blur(a, r):
    """Mean filter of radius r on a float 2D array (edge-padded)."""
    k = 2 * r + 1
    p = np.pad(a.astype(np.float64), r, mode="edge")
    c = np.pad(p.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    return ((c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)).astype(np.float32)


def bbox(mask):
    ys, xs = np.where(mask)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


# ---------- 1. frames ----------
def checker_mask(rgb):
    """True where the painted grey/white checkerboard is, connected to the centre window or the outer edges."""
    a = rgb.astype(np.float32)
    mx, mn = a.max(2), a.min(2)
    lum = a.mean(2)
    neutral = (mx - mn) < 16
    # the checker is two flat greys (~135-150 and ~185-210), plus the soft fade near the glow
    cand = neutral & (lum > 105) & (lum < 228)
    # a painted checker is flat inside each cell: reject textured highlights (sparkles, white glints)
    var = box_blur(lum ** 2, 2) - box_blur(lum, 2) ** 2
    cand &= var < 900
    h, w = cand.shape
    seeds = np.zeros_like(cand)
    seeds[0, :] = seeds[-1, :] = True
    seeds[:, 0] = seeds[:, -1] = True
    seeds[h // 2 - 40:h // 2 + 40, w // 2 - 40:w // 2 + 40] = True
    bg = flood(cand, seeds)
    # second pass: checker cells tinted by a glow painted over them. They are not neutral, but they keep the
    # checker's signature (checker_signature below). Ribbons and highlights don't.
    tinted = checker_signature(lum) & ((mx - mn) < 40) & (lum > 105) & (lum < 235) & (var < 900)
    bg = flood(bg | tinted, bg)
    # the 1px seams between cells are a touch off-grey: take neutral neighbours of the flood too
    bg |= dilate(bg, 1) & ((mx - mn) < 40) & (lum > 100)
    return bg


def decontaminate(rgb, bg):
    """Feathered alpha, with edge colours pulled toward the nearby frame colour (no light fringe)."""
    a = rgb.astype(np.float32)
    solid = ~dilate(bg, 3)                # frame pixels well clear of the checker
    col = np.where(solid[..., None], a, 0)
    wgt = solid.astype(np.float32)
    for _ in range(6):                    # grow the frame colours outward into the 3px edge ring
        c2 = np.stack([box_blur(col[..., i] * (wgt > 0), 1) for i in range(3)], -1)
        w2 = box_blur((wgt > 0).astype(np.float32), 1)
        grow = (wgt == 0) & (w2 > 0)
        col[grow] = c2[grow] / w2[grow][:, None]
        wgt[grow] = 1
    band = ~bg & ~solid
    out = a.copy()
    out[band] = col[band]
    alpha = box_blur((~bg).astype(np.float32), 1)
    alpha[bg] = 0
    alpha = np.clip((alpha - 0.15) / 0.85, 0, 1)
    return np.clip(out, 0, 255).astype(np.uint8), (alpha * 255).astype(np.uint8)


def blank_banner(rgb, box):
    """Replace the name text with the plaque's own background.
    Text pixels (and their glow) are masked; each masked row starts from a straight blend of the plaque
    at its left and right ends, then the fill is relaxed toward the surrounding plaque (harmonic inpaint),
    so it meets the plaque's own gradient on every side with no box edge. A faint grain matches the paint."""
    a = rgb.astype(np.float32).copy()
    x0, y0, x1, y1 = box
    pad = 6
    reg = a[y0 - pad:y1 + pad, x0 - pad:x1 + pad].copy()
    lum = reg.mean(2)
    ref = np.percentile(lum, 35, axis=1, keepdims=True)
    text = np.zeros(lum.shape, bool)
    text[pad:-pad, pad:-pad] = (lum > ref + 16)[pad:-pad, pad:-pad]
    text = dilate(text, 5)
    text[:pad, :] = text[-pad:, :] = False
    text[:, :pad] = text[:, -pad:] = False
    fill = reg.copy()
    w = reg.shape[1]
    for r in range(reg.shape[0]):                       # start: left/right ends of each row, interpolated
        if not text[r].any():
            continue
        L = np.median(reg[r, :pad + 4], 0); R = np.median(reg[r, -pad - 4:], 0)
        t = np.linspace(0, 1, w)[:, None]
        fill[r, text[r]] = (L * (1 - t) + R * t)[text[r]]
    for _ in range(1500):                               # relax toward the plaque around the text
        avg = (np.roll(fill, 1, 0) + np.roll(fill, -1, 0) + np.roll(fill, 1, 1) + np.roll(fill, -1, 1)) / 4
        fill[text] = avg[text]
    rng = np.random.default_rng(7)
    grain = rng.normal(0, 1.6, fill.shape[:2])[..., None]
    fill[text] += grain[text]
    m = np.clip(box_blur(text.astype(np.float32), 1) * 1.3, 0, 1)[..., None]
    a[y0 - pad:y1 + pad, x0 - pad:x1 + pad] = reg * (1 - m) + fill * m
    return np.clip(a, 0, 255).astype(np.uint8)


def checker_signature(lum):
    """True where a pixel sits in the painted grid: ~12px away is the other tone, ~24px away the same tone."""
    sig = np.zeros(lum.shape, bool)
    for d in (11, 12, 13):
        for dy, dx in ((0, d), (0, -d), (d, 0), (-d, 0)):
            one = np.roll(lum, (-dy, -dx), (0, 1))
            two = np.roll(lum, (-2 * dy, -2 * dx), (0, 1))
            sig |= (np.abs(lum - one) > 35) & (np.abs(lum - two) < 22)
    return sig


def recolour_leftover(src, rgb, alpha, bg, window):
    """Checker cells still visible (behind translucent ribbons and glows) keep their alpha but take the
    average colour of nearby frame pixels (radius ~6px, wider where none are close). Outside the window only."""
    a = src.astype(np.float32)
    lum, sat = a.mean(2), a.max(2) - a.min(2)
    left = checker_signature(lum) & (sat < 50) & (lum > 105) & (lum < 240) & (alpha > 0) & ~bg
    left |= dilate(left, 1) & (sat < 50) & (lum > 100) & (alpha > 0) & ~bg     # the 1px seams between cells
    wx0, wy0, wx1, wy1 = window
    left[wy0:wy1, wx0:wx1] = False
    good = ((alpha > 0) & ~bg & ~left).astype(np.float32)
    out = rgb.astype(np.float32).copy()
    todo = left.copy()
    for r in (6, 12, 24):
        wsum = box_blur(good, r)
        ok = todo & (wsum > 0.02)
        if not ok.any():
            continue
        for ch in range(3):
            avg = box_blur(out[..., ch] * good, r)
            out[..., ch][ok] = avg[ok] / wsum[ok]
        todo &= ~ok
    return np.clip(out, 0, 255).astype(np.uint8), int(left.sum())


def frames():
    layout = {}
    for n in FRAMES:
        rgb = np.asarray(Image.open(f"{SRC}/frame-{n}.png").convert("RGB"))
        h, w = rgb.shape[:2]
        bg = checker_mask(rgb)
        rgb2, alpha = decontaminate(rgb, bg)
        seed = np.zeros_like(bg); seed[h // 2 - 5:h // 2 + 5, w // 2 - 5:w // 2 + 5] = True
        wx0, wy0, wx1, wy1 = bbox(flood(bg, seed))
        rgb2, nfix = recolour_leftover(rgb, rgb2, alpha, bg, (wx0, wy0, wx1, wy1))
        rgb2 = blank_banner(rgb2, BANNER[n])
        print(f"frame-{n}: recoloured {nfix} leftover checker px")
        bx0, by0, bx1, by1 = BANNER[n]
        frac = lambda x0, y0, x1, y1: {"x": round(x0 / w, 4), "y": round(y0 / h, 4), "w": round((x1 - x0) / w, 4), "h": round((y1 - y0) / h, 4)}
        layout[n] = {"window": frac(wx0, wy0, wx1, wy1), "banner": frac(bx0, by0, bx1, by1)}
        im = Image.fromarray(np.dstack([rgb2, alpha]), "RGBA").resize((FW, FH), Image.LANCZOS)
        im.save(f"{OUT}/frame-{n}.png", optimize=True)
        im.save(f"{OUT}/frame-{n}.webp", quality=90, method=6)
        print(f"frame-{n}: window {layout[n]['window']}  banner {layout[n]['banner']}")
    layout["_note"] = "Fractions of the frame's width/height (frames are 1080x1620). window = centre transparent area; banner = name text box."
    with open(f"{OUT}/layout.json", "w") as f:
        json.dump(layout, f, indent=2)


# ---------- 2. seal ----------
def seal():
    rgb = np.asarray(Image.open(f"{SRC}/seal-founding.png").convert("RGB")).astype(np.float32)
    mx, mn = rgb.max(2), rgb.min(2)
    cand = (mn > 225) & (mx - mn < 22)
    seeds = np.zeros_like(cand); seeds[0, :] = seeds[-1, :] = seeds[:, 0] = seeds[:, -1] = True
    bg = flood(cand, seeds)
    alpha = box_blur((~bg).astype(np.float32), 1)
    alpha[bg] = 0
    # un-mix the white from the soft edge: c = a*F + (1-a)*255  ->  F = (c - (1-a)*255) / a
    a3 = np.clip(alpha, 0.2, 1)[..., None]
    rgb = np.where((alpha < 1)[..., None], np.clip((rgb - (1 - a3) * 255) / a3, 0, 255), rgb)
    im = Image.fromarray(np.dstack([rgb.astype(np.uint8), (alpha * 255).astype(np.uint8)]), "RGBA")
    im = im.crop(im.getbbox())
    s = max(im.size)
    sq = Image.new("RGBA", (s, s), (0, 0, 0, 0)); sq.paste(im, ((s - im.width) // 2, (s - im.height) // 2))
    sq = sq.resize((600, 600), Image.LANCZOS)
    sq.save(f"{OUT}/seal-founding.png", optimize=True)
    sq.save(f"{OUT}/seal-founding.webp", quality=90, method=6)
    print("seal-founding: trimmed to", im.size, "-> 600x600")


# ---------- 3. heroes ----------
# owl face centre in each source (fractions of width, height), read off the images
FACE = {"explorer": (0.56, 0.38), "achiever": (0.50, 0.38), "builder": (0.47, 0.20)}


def heroes():
    for n in FRAMES:
        im = Image.open(f"{SRC}/hero-{n}.png").convert("RGB")
        w, h = im.size
        tw, th = 1000, 1300
        ch, cw = h, round(h * tw / th)
        if cw > w: cw, ch = w, round(w * th / tw)
        fx, fy = FACE[n]
        x = int(min(max(fx * w - cw / 2, 0), w - cw))
        y = int(min(max(fy * h - ch * 0.4, 0), h - ch))
        out = im.crop((x, y, x + cw, y + ch)).resize((tw, th), Image.LANCZOS)
        out.save(f"{OUT}/hero-{n}.jpg", quality=88, optimize=True, progressive=True)
        out.save(f"{OUT}/hero-{n}.webp", quality=85, method=6)
        print(f"hero-{n}: crop {cw}x{ch} at ({x},{y}); face at ({(fx*w-x)/cw:.2f}, {(fy*h-y)/ch:.2f}) of the crop")


# ---------- 4. back and story ----------
def cover(path, size, name):
    im = Image.open(path).convert("RGB")
    tw, th = size
    s = max(tw / im.width, th / im.height)
    r = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (r.width - tw) // 2, (r.height - th) // 2
    r = r.crop((x, y, x + tw, y + th))
    r.save(f"{OUT}/{name}.png", optimize=True)
    r.save(f"{OUT}/{name}.webp", quality=86, method=6)
    print(f"{name}: {im.size} -> {size}")


# ---------- 5. preview ----------
def preview():
    layout = json.load(open(f"{OUT}/layout.json"))
    tiles, H = [], 720
    for n in FRAMES:
        win = layout[n]["window"]
        fr = Image.open(f"{OUT}/frame-{n}.png")
        hero = Image.open(f"{OUT}/hero-{n}.jpg")
        card = Image.new("RGBA", fr.size, (16, 14, 12, 255))
        wx, wy, ww, wh = round(win["x"] * FW), round(win["y"] * FH), round(win["w"] * FW), round(win["h"] * FH)
        bleed = 24                                    # a little under the frame so no gap shows
        s = max((ww + 2 * bleed) / hero.width, (wh + 2 * bleed) / hero.height)
        hr = hero.resize((round(hero.width * s), round(hero.height * s)), Image.LANCZOS)
        card.paste(hr, (wx - bleed - (hr.width - ww - 2 * bleed) // 2, wy - bleed))
        card.alpha_composite(fr)
        tiles.append(card.resize((round(FW * H / FH), H), Image.LANCZOS))
    tiles.append(Image.open(f"{OUT}/seal-founding.png").resize((420, 420), Image.LANCZOS))
    tiles.append(Image.open(f"{OUT}/card-back.png").convert("RGBA").resize((round(FW * H / FH), H), Image.LANCZOS))
    W = sum(t.width for t in tiles) + 24 * (len(tiles) + 1)
    sheet = Image.new("RGBA", (W, H + 48), (22, 20, 30, 255))
    x = 24
    for t in tiles:
        sheet.alpha_composite(t, (x, 24 + (H - t.height) // 2)); x += t.width + 24
    sheet.convert("RGB").save(f"{OUT}/_preview.png", optimize=True)
    print("preview:", f"{OUT}/_preview.png", sheet.size)


if __name__ == "__main__":
    frames()
    seal()
    heroes()
    cover(f"{LIVE}/card-back.png", (FW, FH), "card-back")
    cover(f"{LIVE}/story-bg.png", (1080, 1920), "story-bg")
    preview()
