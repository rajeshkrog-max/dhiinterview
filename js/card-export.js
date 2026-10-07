/* DhiRise · draws the Founding Card on a canvas (never a DOM screenshot), the same layout as css/card.css
   (which is assets/cards/card-mockup (1).html scaled): rims and glow → ivory card → inner line → colour window →
   tag → name → rule → community line → seal → owl. Uses the PNGs in assets/cards/.
   DhiCardExport.create(d) → { card(): Promise<Blob 1080×1620 PNG>, story(): Promise<Blob 1080×1920 PNG> }.
   Waits for the fonts and every image; a missing image is skipped (the story's background becomes a dark gradient).
   Never throws to the page. */
(function (root) {
  "use strict";
  var DIR = "assets/cards/";
  var BODY = '"Mukta", system-ui, -apple-system, "Segoe UI", sans-serif';
  var CINZEL = '"Cinzel", Georgia, serif';
  var HEAD = '"Playfair Display", Georgia, serif';
  var CW = 1080, CH = 1620, SW = 1080, SH = 1920;
  /* the card body inside the 1080×1620 PNG: room above for the owl that breaks out, and for the rims and glow */
  var BW = 960, BH = 1440, BX = (CW - BW) / 2, BY = 90;
  var P = BW / 290;                                       /* one mockup px */
  var K = BW / 320;                                       /* one screen px on a full-size (320px) card: 1px lines */

  function loadImg(src) {
    return new Promise(function (ok) {
      var i = new Image(), done = false;
      var end = function (v) { if (!done) { done = true; ok(v); } };
      i.decoding = "async";
      i.onload = function () { end(i.naturalWidth ? i : null); };
      i.onerror = function () { end(null); };
      setTimeout(function () { end(null); }, 10000);
      i.src = src;
    });
  }
  function fontsReady() {
    var f = document.fonts;
    if (!f) return Promise.resolve();
    var want = ['700 30px "Cinzel"', '800 30px "Cinzel"', '500 20px "Mukta"', '700 20px "Mukta"', '600 20px "Mukta"', '700 40px "Playfair Display"'];
    return Promise.all(want.map(function (w) { return f.load(w).catch(function () {}); }))
      .then(function () { return f.ready; }).catch(function () {});
  }

  /* ---------- helpers ---------- */
  /* CSS letter-spacing also follows the last letter; keep that so centring matches the page */
  function spacedWidth(ctx, s, sp) { return ctx.measureText(s).width + sp * s.length; }
  function spaced(ctx, s, x, y, sp) {
    if (!sp) { ctx.textAlign = "left"; ctx.fillText(s, x, y); return; }
    ctx.textAlign = "left";
    for (var i = 0; i < s.length; i++) { ctx.fillText(s[i], x, y); x += ctx.measureText(s[i]).width + sp; }
  }
  function rounded(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function topRounded(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x, y + h); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h); ctx.closePath();
  }
  function shadow(ctx, oy, blur, col) { ctx.shadowColor = col; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = oy; ctx.shadowBlur = blur; }
  function rgba(hex, a) {
    var n = parseInt(String(hex).replace("#", ""), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function darkFill(ctx, x, y, w, h) {
    var g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, "#1c2046"); g.addColorStop(1, "#0e1022");
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  }
  function cover(ctx, im, x, y, w, h) {
    var s = Math.max(w / im.naturalWidth, h / im.naturalHeight), dw = im.naturalWidth * s, dh = im.naturalHeight * s;
    ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  /* the community line, wrapped like the page: greedy, centred, bold runs in ink */
  function wrapLine(ctx, runs, size, max) {
    var words = [];
    runs.forEach(function (r) { r.t.split(" ").forEach(function (w, i, a) { if (w) words.push({ w: w, b: r.b, gap: i < a.length - 1 }); }); });
    var font = function (b) { return (b ? "700 " : "500 ") + size + "px " + BODY; };
    ctx.font = font(false);
    var space = ctx.measureText(" ").width, lines = [], cur = [], curW = 0;
    words.forEach(function (w) {
      ctx.font = font(w.b);
      var ww = ctx.measureText(w.w).width, add = cur.length ? space + ww : ww;
      if (cur.length && curW + add > max) { lines.push({ words: cur, w: curW }); cur = [w]; curW = ww; }
      else { cur.push(w); curW += add; }
    });
    if (cur.length) lines.push({ words: cur, w: curW });
    return { lines: lines, space: space, font: font };
  }

  /* ---------- the card, 1080×1620 ---------- */
  function drawCard(ctx, d, im) {
    var R = 22 * P, cx = BX + BW / 2;

    /* glow in the style colour and the drop shadow (shapes hidden under the card) */
    ctx.save();
    shadow(ctx, 0, 60 * P, rgba(d.c, 1)); ctx.fillStyle = d.c;
    rounded(ctx, BX + 10 * P, BY + 10 * P, BW - 20 * P, BH - 20 * P, R); ctx.fill();
    shadow(ctx, 28 * P, 60 * P, "rgba(0,0,0,.8)"); ctx.fillStyle = "#000";
    rounded(ctx, BX + 18 * P, BY + 18 * P, BW - 36 * P, BH - 36 * P, R); ctx.fill();
    ctx.restore();

    /* rims: 7px soft gold, 6px dark ring, 2px gold */
    ctx.fillStyle = "rgba(217,164,65,.55)"; rounded(ctx, BX - 7 * P, BY - 7 * P, BW + 14 * P, BH + 14 * P, R + 7 * P); ctx.fill();
    ctx.fillStyle = "#2a2440"; rounded(ctx, BX - 6 * P, BY - 6 * P, BW + 12 * P, BH + 12 * P, R + 6 * P); ctx.fill();
    ctx.fillStyle = "#d9a441"; rounded(ctx, BX - 2 * P, BY - 2 * P, BW + 4 * P, BH + 4 * P, R + 2 * P); ctx.fill();

    /* ivory card */
    var g = ctx.createLinearGradient(0, BY, 0, BY + BH);
    g.addColorStop(0, "#fffaf0"); g.addColorStop(1, "#f3e6c9");
    ctx.fillStyle = g; rounded(ctx, BX, BY, BW, BH, R); ctx.fill();

    /* inner thin gold line */
    ctx.strokeStyle = "rgba(185,134,46,.45)"; ctx.lineWidth = K;
    rounded(ctx, BX + 10 * P + K / 2, BY + 10 * P + K / 2, BW - 20 * P - K, BH - 20 * P - K, 14 * P); ctx.stroke();

    /* colour window: radial gradient (90% 80% at 50% 100%), gold bottom border, a soft inner shade */
    var wx = BX + 10 * P, wy = BY + 10 * P, ww = BW - 20 * P, wh = 0.39 * BH - 10 * P;
    ctx.save();
    topRounded(ctx, wx, wy, ww, wh, 14 * P); ctx.clip();
    var rx = 0.9 * ww, ry = 0.8 * wh;
    ctx.save();
    ctx.translate(wx + ww / 2, wy + wh); ctx.scale(rx / ry, 1);
    var rg = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
    rg.addColorStop(0, d.winA); rg.addColorStop(0.85, d.winB); rg.addColorStop(1, d.winB);
    ctx.fillStyle = rg; ctx.fillRect(-ww, -wh * 2, ww * 2, wh * 3);
    ctx.restore();
    var sh = ctx.createLinearGradient(0, wy + wh - 22 * P, 0, wy + wh);
    sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,.24)");
    ctx.fillStyle = sh; ctx.fillRect(wx, wy + wh - 22 * P, ww, 22 * P);
    ctx.fillStyle = "#d9a441"; ctx.fillRect(wx, wy + wh - 2 * P, ww, 2 * P);
    ctx.restore();

    /* content, in the column under the window */
    var y = BY + 0.585 * BW + 14 * P, cw = BW - 36 * P;
    ctx.textBaseline = "middle";

    /* tag pill */
    var ts = 11 * P, tsp = 0.16 * ts;
    ctx.font = "700 " + ts + "px " + CINZEL;
    var tw = spacedWidth(ctx, d.tag, tsp), pw = tw + 28 * P, ph = ts * 1.3 + 11 * P, px = cx - pw / 2;
    ctx.save();
    shadow(ctx, 4 * P, 12 * P, rgba(d.c, 0.55)); ctx.fillStyle = d.c;
    rounded(ctx, px + 4 * P, y + 4 * P, pw - 8 * P, ph - 8 * P, ph / 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#d9a441"; rounded(ctx, px - K, y - K, pw + 2 * K, ph + 2 * K, ph / 2 + K); ctx.fill();
    ctx.fillStyle = d.c; rounded(ctx, px, y, pw, ph, ph / 2); ctx.fill();
    ctx.fillStyle = "#fff";
    spaced(ctx, d.tag, px + 14 * P, y + 6 * P + ts * 0.65, tsp);
    y += ph;

    /* name: Cinzel 800, shrinks to fit */
    y += 12 * P;
    var ns = 34 * P, name = d.first.toUpperCase();
    ctx.font = "800 " + ns + "px " + CINZEL;
    while (spacedWidth(ctx, name, 0.04 * ns) > cw && ns > 8 * P) { ns -= 0.5 * P; ctx.font = "800 " + ns + "px " + CINZEL; }
    var nw = spacedWidth(ctx, name, 0.04 * ns), nx = cx - nw / 2, ny = y + ns / 2;
    ctx.fillStyle = "#fff"; spaced(ctx, name, nx, ny + K, 0.04 * ns);
    ctx.fillStyle = "#1b1d33"; spaced(ctx, name, nx, ny, 0.04 * ns);
    y += ns + 2 * P;

    /* thin gold rule */
    y += 8 * P;
    var rw = 0.56 * cw, rgd = ctx.createLinearGradient(cx - rw / 2, 0, cx + rw / 2, 0);
    rgd.addColorStop(0, "rgba(217,164,65,0)"); rgd.addColorStop(0.5, "#d9a441"); rgd.addColorStop(1, "rgba(217,164,65,0)");
    ctx.fillStyle = rgd; ctx.fillRect(cx - rw / 2, y, rw, K);
    y += K + 10 * P;

    /* community line: 12px, 1.42, max 30ch, centred */
    var ls = 12 * P, lh = 1.42 * ls;
    ctx.font = "500 " + ls + "px " + BODY;
    var max = Math.min(cw, 30 * ctx.measureText("0").width);
    var wrapped = wrapLine(ctx, [
      { t: d.first, b: true }, { t: " completed the DhiRise Mind & Study Check and took the first step into the ", b: false },
      { t: "DhiRise community", b: true }, { t: ", for growth in studies, habits and life.", b: false }
    ], ls, max);
    wrapped.lines.forEach(function (ln, i) {
      var x = cx - ln.w / 2, yy = y + i * lh + lh / 2;
      ln.words.forEach(function (w, j) {
        ctx.font = wrapped.font(w.b); ctx.fillStyle = w.b ? "#1b1d33" : "#4a4560"; ctx.textAlign = "left";
        ctx.fillText(w.w, x, yy);
        x += ctx.measureText(w.w).width + (j < ln.words.length - 1 ? wrapped.space : 0);
      });
    });
    y += wrapped.lines.length * lh + 12 * P;

    /* seal at the bottom centre */
    if (im.seal) {
      var sw = 0.27 * BW, shh = sw * im.seal.naturalHeight / im.seal.naturalWidth;
      var sy = Math.max(y, BY + BH - 18 * P - shh);
      ctx.save(); shadow(ctx, 6 * P, 8 * P, "rgba(80,50,0,.35)");
      ctx.drawImage(im.seal, cx - sw / 2, sy, sw, shh);
      ctx.restore();
    }

    /* the owl, over everything, breaking out of the window */
    if (im.owl) {
      var ow = 0.96 * BW, oh = ow * im.owl.naturalHeight / im.owl.naturalWidth, ob = BY + (0.39 + d.sink) * BH;
      ctx.save(); shadow(ctx, 10 * P, 14 * P, "rgba(0,0,0,.35)");
      ctx.drawImage(im.owl, cx - ow / 2, ob - oh, ow, oh);
      ctx.restore();
    }
  }

  /* ---------- the story, 1080×1920 ---------- */
  function drawStory(ctx, d, im, cardCanvas) {
    if (im.story) cover(ctx, im.story, 0, 0, SW, SH); else darkFill(ctx, 0, 0, SW, SH);
    var s = SW * 0.78 / BW, w = CW * s, h = CH * s, x = (SW - w) / 2, y = 150;
    var g = ctx.createRadialGradient(SW / 2, y + h / 2, w * 0.1, SW / 2, y + h / 2, w * 0.8);
    g.addColorStop(0, rgba(d.c, 0.35)); g.addColorStop(1, rgba(d.c, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, SW, SH);
    ctx.drawImage(cardCanvas, x, y, w, h);
    ctx.textBaseline = "middle"; ctx.textAlign = "center";
    ctx.save();
    ctx.font = "700 62px " + HEAD;
    var tg = ctx.createLinearGradient(0, 1575, 0, 1635);
    tg.addColorStop(0, "#fff3cf"); tg.addColorStop(1, "#e9b95c");
    ctx.fillStyle = tg; shadow(ctx, 2, 8, "rgba(0,0,0,.7)");
    ctx.fillText("Take your DhiRise check", SW / 2, 1605);
    ctx.restore();
    if (d.url) {
      ctx.save();
      ctx.font = "600 38px " + BODY; ctx.fillStyle = "rgba(255,255,255,.85)"; shadow(ctx, 1, 6, "rgba(0,0,0,.7)");
      ctx.fillText(d.url, SW / 2, 1675, SW - 160);
      ctx.restore();
    }
  }

  function toBlob(canvas) {
    return new Promise(function (ok) {
      try { canvas.toBlob(function (b) { ok(b); }, "image/png"); } catch (e) { ok(null); }
    });
  }
  function canvas(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

  function create(d) {
    var assets = null, cardC = null, cardBlob = null, storyBlob = null;
    function load() {
      if (!assets) assets = Promise.all([
        fontsReady(), loadImg(DIR + "owl-" + d.key + ".png"), loadImg(DIR + "seal-founding-cut.png"), loadImg(DIR + "story-bg.png")
      ]).then(function (a) { return { owl: a[1], seal: a[2], story: a[3] }; });
      return assets;
    }
    function renderCard() {
      if (!cardC) cardC = load().then(function (im) {
        var c = canvas(CW, CH);
        try { drawCard(c.getContext("2d"), d, im); } catch (e) {}
        return c;
      });
      return cardC;
    }
    return {
      card: function () { if (!cardBlob) cardBlob = renderCard().then(toBlob); return cardBlob; },
      story: function () {
        if (!storyBlob) storyBlob = Promise.all([load(), renderCard()]).then(function (a) {
          var c = canvas(SW, SH);
          try { drawStory(c.getContext("2d"), d, a[0], a[1]); } catch (e) {}
          return toBlob(c);
        });
        return storyBlob;
      }
    };
  }

  root.DhiCardExport = { create: create };
})(window);
