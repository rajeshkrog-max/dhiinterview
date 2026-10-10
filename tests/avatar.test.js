// The profile picture circle (spec 0011, AC-3, AC-5 and AC-14): the initials rule, the fixed palette and its contrast, and what the
// circle does when the picture is missing, fails, or is swapped. A tiny pretend page stands in for the browser.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "vitest";

// ---- a minimal pretend DOM: just what avatar.js uses ----
class Node_ {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attrs = {};
    this.className = "";
    this.text = "";
  }
  get firstChild() {
    return this.children[0] ?? null;
  }
  appendChild(c) {
    this.children.push(c);
    return c;
  }
  removeChild(c) {
    this.children = this.children.filter((x) => x !== c);
    return c;
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }
  getAttribute(k) {
    return k === "src" && this.src !== undefined ? this.src : (this.attrs[k] ?? null);
  }
}
const pretendDocument = {
  createElement: (tag) => new Node_(tag),
  createElementNS: (_ns, tag) => new Node_(tag),
  createTextNode: (text) => Object.assign(new Node_("#text"), { text }),
};

let A;
beforeAll(async () => {
  globalThis.window = globalThis;
  globalThis.document = pretendDocument;
  await import("../public/dhiinterviews/js/avatar.js");
  A = globalThis.DhiAvatar;
});

const URL1 = "/api/avatar/AbCdEfGhIjKlMnOpQrStUv";
const URL2 = "/api/avatar/ZyXwVuTsRqPoNmLkJiHgFe";
const textOf = (el) => (el.firstChild?.tag === "#text" ? el.firstChild.text : null);

describe("initials (AC-3, AC-14)", () => {
  test("the first letter of the first word, upper cased", () => {
    expect(A.initialOf("Asha Rao")).toBe("A");
    expect(A.initialOf("  kavya   nair ")).toBe("K");
    expect(A.initialOf("élise")).toBe("É");
    expect(A.initialOf("आशा राव")).toBe("आ");
    expect(A.initialOf("张伟")).toBe("张");
  });
  test("an emoji, a digit, a symbol or nothing has no letter: the neutral person shape shows instead", () => {
    for (const n of ["😀 Sam", "9lives", "_x", "", "   ", null, undefined, "-"]) expect(A.initialOf(n), String(n)).toBe("");
  });
  test("a family emoji (many code points, one grapheme) is still not a letter", () => {
    expect(A.initialOf("👨‍👩‍👧 family")).toBe("");
  });
  test("the same name always gets the same colour, in range", () => {
    for (const n of ["Asha", "Ravi", "Zoya", "", "😀", "Class 8 student"]) {
      expect(A.colorIndex(n)).toBe(A.colorIndex(n));
      expect(A.colorIndex(n)).toBeGreaterThanOrEqual(0);
      expect(A.colorIndex(n)).toBeLessThan(A.COLORS);
    }
  });
});

describe("the palette (AC-14: initials meet 4.5 to 1)", () => {
  const css = readFileSync(new URL("../public/dhiinterviews/css/avatar.css", import.meta.url), "utf8");
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrastWithWhite = (hex) => 1.05 / (lum(hex) + 0.05);

  test("avatar.css defines exactly the colours avatar.js can pick, and the neutral background", () => {
    const colours = [...css.matchAll(/\.dhi-avatar--c(\d)\{background:(#[0-9a-f]{6})\}/g)];
    expect(colours.map((m) => Number(m[1]))).toEqual(Array.from({ length: A.COLORS }, (_, i) => i));
    expect(css).toMatch(/\.dhi-avatar--neutral\{background:#[0-9a-f]{6}\}/);
  });
  test("every initials colour, and the neutral one, has white text at 4.5 to 1 or better", () => {
    const all = [...css.matchAll(/\.dhi-avatar--(?:c\d|neutral)\{background:(#[0-9a-f]{6})\}/g)].map((m) => m[1]);
    expect(all.length).toBe(A.COLORS + 1);
    for (const hex of all) expect(contrastWithWhite(hex), hex).toBeGreaterThanOrEqual(4.5);
    expect(css).toMatch(/\.dhi-avatar\{[^}]*color:#fff/);
  });
  test("the circle has a fixed size in each of the three sizes and no motion", () => {
    for (const [size, px] of [[28, 28], [40, 40], [64, 64]]) expect(css).toContain(`.dhi-avatar--${size}{width:${px}px;height:${px}px;`);
    expect(css).not.toMatch(/animation|transition|@keyframes/);
  });
  test("the stylesheet loads nothing from outside", () => {
    expect(css).not.toMatch(/url\(|@import|https?:/);
  });
});

describe("the circle", () => {
  test("covers AC-14: it is decorative (aria-hidden), whatever it shows", () => {
    for (const url of [URL1, null]) expect(A.make({ url, name: "Asha", size: 40 }).attrs["aria-hidden"]).toBe("true");
  });

  test("covers AC-3: with no picture it shows the initial at the same fixed size, on a palette colour", () => {
    const el = A.make({ url: null, name: "Asha Rao", size: 64 });
    expect(textOf(el)).toBe("A");
    expect(el.className).toMatch(/^dhi-avatar dhi-avatar--64 dhi-avatar--c[0-5]$/);
  });

  test("covers AC-3: a name with no letter shows the neutral person shape, not a symbol", () => {
    const el = A.make({ url: null, name: "😀", size: 40 });
    expect(el.className).toBe("dhi-avatar dhi-avatar--40 dhi-avatar--neutral");
    expect(el.firstChild.tag).toBe("svg");
    expect(el.firstChild.attrs["aria-hidden"]).toBe("true");
  });

  test("covers AC-3 and AC-14: with a picture it draws one same origin image with its size fixed, empty alt and no referrer", () => {
    const el = A.make({ url: URL1, name: "Asha", size: 64 });
    const img = el.firstChild;
    expect(img.tag).toBe("img");
    expect(img.src).toBe(URL1);
    expect(img.alt).toBe("");
    expect(img.width).toBe(64);
    expect(img.height).toBe(64);
    expect(img.decoding).toBe("async");
    expect(img.attrs.referrerpolicy).toBe("no-referrer");
    expect(img.loading).toBe("eager"); // the student's own screens do not flicker
    expect(el.className).toBe("dhi-avatar dhi-avatar--64 dhi-avatar--photo");
  });

  test("rows in a list can ask for lazy loading", () => {
    expect(A.make({ url: URL1, name: "A", size: 28, lazy: true }).firstChild.loading).toBe("lazy");
  });

  test("covers AC-3: a picture that fails to load turns into the initials, at once, and is not tried again", () => {
    const el = A.make({ url: URL1, name: "Kavya", size: 40 });
    el.firstChild.onerror();
    expect(textOf(el)).toBe("K");
    expect(el.className).toMatch(/dhi-avatar--c[0-5]$/);
    A.update(el, URL1); // the same address that failed
    expect(textOf(el)).toBe("K");
    A.update(el, URL2); // a new address (the picture changed) is tried
    expect(el.firstChild.tag).toBe("img");
    expect(el.firstChild.src).toBe(URL2);
  });

  test("update swaps the picture in, and back to initials when it goes away", () => {
    const el = A.make({ url: null, name: "Ravi", size: 40 });
    expect(textOf(el)).toBe("R");
    A.update(el, URL1);
    expect(el.firstChild.src).toBe(URL1);
    A.update(el, URL1); // the same picture again changes nothing
    expect(el.children).toHaveLength(1);
    A.update(el, null);
    expect(textOf(el)).toBe("R");
  });

  test("covers AC-5 and AC-10: only a same origin /api/avatar/ path is ever drawn: any other address is ignored (initials)", () => {
    for (const bad of ["https://lh3.googleusercontent.com/a/x=s96-c", "http://evil.example/x.png", "//evil.example/x", "data:image/png;base64,AAAA", "javascript:alert(1)", "/other/path.png", 42]) {
      const el = A.make({ url: bad, name: "Asha", size: 40 });
      expect(textOf(el), String(bad)).toBe("A");
    }
  });

  test("an unknown size becomes 40", () => {
    expect(A.make({ url: null, name: "A", size: 99 }).className).toContain("dhi-avatar--40");
  });
});

describe("DhiAvatar.mine, the student's own circle (AC-3)", () => {
  // one stable pretend session for the whole block: avatar.js binds to the session once, as in a real page
  const listeners = [];
  const state = { enabled: true, url: null };
  beforeAll(() => {
    globalThis.DhiSession = {
      pictureEnabled: () => state.enabled,
      picture: () => state.url,
      cachedName: () => "Meera Iyer",
      onPicture: (fn) => listeners.push(fn),
    };
  });
  const tell = (url) => listeners.forEach((fn) => fn(url));

  test("with the feature off in this browser it draws nothing at all", () => {
    state.enabled = false;
    expect(A.mine({ size: 40 })).toBeNull();
    state.enabled = true;
  });

  test("with no session bridge it draws nothing at all", () => {
    const keep = globalThis.DhiSession;
    delete globalThis.DhiSession;
    expect(A.mine({ size: 40 })).toBeNull();
    globalThis.DhiSession = keep;
  });

  test("with no picture it shows the initial of the signed in student, or of the name the page gives", () => {
    state.url = null;
    expect(textOf(A.mine({ size: 40 }))).toBe("M");
    expect(textOf(A.mine({ size: 64, name: "Zoya Khan" }))).toBe("Z");
  });

  test("with a picture it draws it, at the size asked for", () => {
    state.url = URL1;
    const el = A.mine({ size: 64 });
    expect(el.firstChild.src).toBe(URL1);
    expect(el.className).toBe("dhi-avatar dhi-avatar--64 dhi-avatar--photo");
    state.url = null;
  });

  test("a first picture that lands after the page has drawn, and a Remove, reach every circle made here, through one listener", () => {
    state.url = null;
    const a = A.mine({ size: 40 });
    const b = A.mine({ size: 64 });
    expect(listeners).toHaveLength(1);
    tell(URL1);
    expect(a.firstChild.src).toBe(URL1);
    expect(b.firstChild.src).toBe(URL1);
    tell(null);
    expect(textOf(a)).toBe("M");
    expect(textOf(b)).toBe("M");
  });

  test("a circle that has left the page is dropped, not kept alive and not updated", () => {
    const gone = A.mine({ size: 40 });
    const here = A.mine({ size: 40 });
    gone.isConnected = false;
    tell(URL2);
    expect(textOf(gone)).toBe("M");
    expect(here.firstChild.src).toBe(URL2);
    tell(null);
  });
});

describe("the screens that show the student (spec 0011, M2 wiring)", () => {
  const page = (name) => readFileSync(new URL(`../src/pages/dhiinterviews/${name}.astro`, import.meta.url), "utf8");
  const own = ["landing", "done", "who", "challenge", "leaderboard", "report-student"];

  test.each(own)("covers AC-3: %s loads avatar.css and avatar.js, with the browser switch (funnel-config.js) read first", (name) => {
    const html = page(name);
    expect(html).toContain('href="css/avatar.css"');
    const config = html.indexOf('src="js/funnel-config.js"');
    const helper = html.indexOf('src="js/avatar.js"');
    expect(config).toBeGreaterThan(-1);
    expect(helper).toBeGreaterThan(config);
  });

  test.each(own)("covers AC-3: the script of %s draws the circle through DhiAvatar.mine, never by naming a Google host", (name) => {
    const scripts = { landing: "gate", done: "done", who: "who", challenge: "challenge", leaderboard: "leaderboard", "report-student": "report-student" };
    const js = readFileSync(new URL(`../public/dhiinterviews/js/${scripts[name]}.js`, import.meta.url), "utf8");
    expect(js).toContain("DhiAvatar.mine(");
    expect(js).not.toMatch(/googleusercontent/);
  });

  test.each(["question", "question2", "questions", "meet"])("covers AC-5: the %s page does not load the picture at all", (name) => {
    const html = page(name);
    expect(html).not.toMatch(/avatar|picture-notice|picture-control/);
  });

  test("covers AC-2: the landing and the report both mount the one time notice (asked mode only: the server says when)", () => {
    expect(readFileSync(new URL("../public/dhiinterviews/js/gate.js", import.meta.url), "utf8")).toContain("DhiPictureNotice.mountIn(");
    expect(readFileSync(new URL("../public/dhiinterviews/js/report-student.js", import.meta.url), "utf8")).toContain("DhiPictureNotice.mountAfter(");
    expect(page("landing")).toContain('src="js/picture-notice.js"');
    expect(page("report-student")).toContain('src="js/picture-notice.js"');
  });
});
