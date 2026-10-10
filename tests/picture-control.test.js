// The picture row on the report page (spec 0011, AC-9): Remove behind a confirm step that names what it cannot undo, then Use my Google
// picture. A tiny pretend page and a pretend DhiSession stand in for the browser and the bridge.
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

class El {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attrs = {};
    this.className = "";
    this.hidden = false;
    this.listeners = {};
    this.own = "";
  }
  set textContent(v) {
    this.own = String(v);
    this.children = [];
  }
  get textContent() {
    return this.own + this.children.map((c) => c.textContent).join(" ");
  }
  appendChild(c) {
    this.children.push(c);
    return c;
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }
  removeAttribute(k) {
    delete this.attrs[k];
  }
  addEventListener(ev, fn) {
    (this.listeners[ev] ||= []).push(fn);
  }
  click() {
    (this.listeners.click || []).forEach((f) => f());
  }
  focus() {
    globalThis.document.activeElement = this;
  }
}
const all = (el, out = []) => (out.push(el), el.children.forEach((c) => all(c, out)), out);
const button = (root, text) => all(root).find((e) => e.tag === "button" && e.textContent === text);
const flush = () => new Promise((r) => setTimeout(r, 0));

let session;
let listeners;
const makeSession = (control = "remove") => {
  listeners = [];
  session = {
    control,
    url: control === "remove" ? "/api/avatar/AbCdEfGhIjKlMnOpQrStUv" : null,
    enabled: true,
    pictureEnabled: () => session.enabled,
    pictureControl: () => session.control,
    picture: () => session.url,
    ready: () => Promise.resolve("ready"),
    onPicture: (fn) => listeners.push(fn),
    removePicture: vi.fn(async () => {
      session.control = "restore";
      session.url = null;
      return { ok: true };
    }),
    restorePicture: vi.fn(async () => {
      session.control = "remove";
      session.url = "/api/avatar/ZyXwVuTsRqPoNmLkJiHgFe";
      return { ok: true };
    }),
  };
  globalThis.DhiSession = session;
};

let mount;
beforeAll(async () => {
  globalThis.window = globalThis;
  globalThis.document = { createElement: (tag) => new El(tag), activeElement: null };
  await import("../public/dhiinterviews/js/picture-control.js");
  mount = globalThis.DhiPictureControl.mount;
});
beforeEach(() => makeSession("remove"));

const open = async (profile = { name: "Asha Rao" }) => {
  const root = new El("main");
  mount(root, profile);
  await flush();
  return { root, card: root.children[0] };
};

describe("Remove (AC-9)", () => {
  test("covers AC-9: with a picture stored, the row says it is shown and offers Remove; nothing is removed by merely opening it", async () => {
    const { card } = await open();
    expect(card.hidden).toBe(false);
    expect(card.textContent).toContain("Your picture is shown across DhiRise.");
    expect(button(card, "Remove my picture")).toBeTruthy();
    expect(session.removePicture).not.toHaveBeenCalled();
  });

  test("covers AC-9: Remove asks first, and the words name the copies it cannot purge (browser copies for an hour, report copies, share links)", async () => {
    const { card } = await open();
    button(card, "Remove my picture").click();
    expect(session.removePicture).not.toHaveBeenCalled();
    const said = card.textContent;
    expect(said).toContain("taken off every screen and deleted from DhiRise");
    expect(said).toContain("browser copies for up to an hour");
    expect(said).toMatch(/Report copies and share links already made keep the picture they drew/);
    expect(button(card, "Yes, remove my picture")).toBeTruthy();
    expect(globalThis.document.activeElement).toBe(button(card, "Keep my picture")); // the safe choice has the focus
  });

  test("covers AC-9: Keep my picture goes back with nothing removed", async () => {
    const { card } = await open();
    button(card, "Remove my picture").click();
    button(card, "Keep my picture").click();
    expect(session.removePicture).not.toHaveBeenCalled();
    expect(button(card, "Remove my picture")).toBeTruthy();
    expect(card.textContent).not.toContain("deleted from DhiRise");
  });

  test("covers AC-9: Yes removes it once, says so, and offers Use my Google picture", async () => {
    const { card } = await open();
    button(card, "Remove my picture").click();
    const yes = button(card, "Yes, remove my picture");
    yes.click();
    yes.click(); // a double tap
    await flush();
    expect(session.removePicture).toHaveBeenCalledTimes(1);
    expect(card.textContent).toContain("Done. Your picture is removed.");
    expect(card.textContent).toContain("Your picture is off.");
    expect(button(card, "Use my Google picture")).toBeTruthy();
    expect(button(card, "Remove my picture")).toBeUndefined();
  });

  test("covers AC-9: a Remove that could not reach the server says so kindly and keeps the picture row", async () => {
    session.removePicture = vi.fn(async () => ({ ok: false, code: "offline" }));
    const { card } = await open();
    button(card, "Remove my picture").click();
    button(card, "Yes, remove my picture").click();
    await flush();
    expect(card.textContent).toContain("We could not do that. Please check your connection and try again.");
    expect(button(card, "Remove my picture")).toBeTruthy();
  });
});

describe("Use my Google picture (AC-9)", () => {
  test("covers AC-9: after a Remove the row offers Restore; Restore brings the Remove row back and says the picture is back", async () => {
    makeSession("restore");
    const { card } = await open();
    expect(card.textContent).toContain("Your picture is off.");
    button(card, "Use my Google picture").click();
    await flush();
    expect(session.restorePicture).toHaveBeenCalledTimes(1);
    expect(card.textContent).toContain("Your picture is back.");
    expect(button(card, "Remove my picture")).toBeTruthy();
  });

  test("covers AC-9: if no picture has landed yet it says it will appear next time, not that it is back", async () => {
    makeSession("restore");
    session.restorePicture = vi.fn(async () => {
      session.control = "none";
      return { ok: true };
    });
    const { card } = await open();
    button(card, "Use my Google picture").click();
    await flush();
    expect(card.textContent).toContain("We could not find a picture to show.");
    expect(card.textContent).not.toContain("Your picture is back.");
  });

  // Found by /check verify and the review: the row used to be redrawn at once, which built a new button with no aria-busy and dropped the focus.
  test("covers AC-9: while a Restore is waiting, the same button stays, is marked busy and keeps its place, and the status line announces the wait", async () => {
    makeSession("restore");
    let finish;
    session.restorePicture = vi.fn(() => new Promise((r) => (finish = r)));
    const { card } = await open();
    const before = button(card, "Use my Google picture");
    before.focus();
    before.click();
    const waiting = button(card, "Use my Google picture");
    expect(waiting).toBe(before); // not rebuilt
    expect(waiting.attrs["aria-busy"]).toBe("true");
    expect(waiting.disabled).toBe(true);
    expect(globalThis.document.activeElement).toBe(before);
    expect(card.textContent).toContain("Getting your picture");
    session.control = "remove";
    session.url = "/api/avatar/ZyXwVuTsRqPoNmLkJiHgFe";
    finish({ ok: true });
    await flush();
    expect(card.textContent).toContain("Your picture is back.");
  });

  test("covers AC-9: the status line is one element that stays in the page, so a screen reader hears each change", async () => {
    const { card } = await open();
    const live = all(card).find((e) => e.attrs.role === "status");
    expect(live.attrs["aria-live"]).toBe("polite");
    button(card, "Remove my picture").click();
    button(card, "Yes, remove my picture").click();
    await flush();
    expect(all(card).find((e) => e.attrs.role === "status")).toBe(live); // the same element after the redraws
    expect(live.textContent).toBe("Done. Your picture is removed.");
  });

  test("covers AC-9: a picture that lands while the confirm step is open does not redraw it, so the focused button is not lost", async () => {
    const { card } = await open();
    button(card, "Remove my picture").click();
    const keep = button(card, "Keep my picture");
    expect(globalThis.document.activeElement).toBe(keep);
    listeners.forEach((fn) => fn(session.url)); // a background update
    expect(button(card, "Keep my picture")).toBe(keep);
    expect(globalThis.document.activeElement).toBe(keep);
  });

  test("covers AC-9: a refused Restore (needs agreement, blocked, off) asks for a reload and never claims success", async () => {
    for (const code of ["needs_consent", "blocked", "off"]) {
      makeSession("restore");
      session.restorePicture = vi.fn(async () => ({ ok: false, code }));
      const { card } = await open();
      button(card, "Use my Google picture").click();
      await flush();
      expect(card.textContent, code).toContain("Please reload this page and try again.");
      expect(card.textContent, code).not.toContain("Your picture is back.");
    }
  });
});

describe("when the row stays out of the way (AC-9, AC-16)", () => {
  test("covers AC-9: with no stored picture, or a team block, the row is hidden", async () => {
    makeSession("none");
    const { card } = await open();
    expect(card.hidden).toBe(true);
  });

  test("covers AC-16: with the picture feature off in this browser, nothing is added to the page at all", async () => {
    session.enabled = false;
    const root = new El("main");
    mount(root, { name: "Asha" });
    await flush();
    expect(root.children).toHaveLength(0);
  });

  test("covers AC-9: a picture that lands later (a fetch that finished) shows the right row without a reload", async () => {
    makeSession("none");
    const { card } = await open();
    expect(card.hidden).toBe(true);
    session.control = "remove";
    session.url = "/api/avatar/AbCdEfGhIjKlMnOpQrStUv";
    listeners.forEach((fn) => fn(session.url));
    expect(card.hidden).toBe(false);
    expect(button(card, "Remove my picture")).toBeTruthy();
  });
});

describe("how the row is wired in (AC-9, AC-5)", () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  test("covers AC-9: the report page loads the row's script and styles, after the picture helper, and the report mounts it outside the saved copy", () => {
    const html = read("src/pages/dhiinterviews/report-student.astro");
    expect(html).toContain('href="css/picture-control.css"');
    expect(html.indexOf('src="js/avatar.js"')).toBeLessThan(html.indexOf('src="js/picture-control.js"'));
    expect(html.indexOf('src="js/picture-control.js"')).toBeLessThan(html.indexOf('src="js/report-student.js"'));
    expect(read("public/dhiinterviews/js/report-student.js")).toMatch(/if \(!PRINT && window\.DhiPictureControl\) DhiPictureControl\.mount\(/);
  });

  test("covers AC-5: no other page loads the row, and the script never names a Google host", () => {
    for (const p of ["landing", "done", "who", "challenge", "leaderboard", "question", "question2", "questions", "meet", "report-render"]) {
      expect(read(`src/pages/dhiinterviews/${p}.astro`), p).not.toContain("picture-control");
    }
    expect(read("public/dhiinterviews/js/picture-control.js")).not.toMatch(/googleusercontent|fetch\(|XMLHttpRequest|localStorage/);
  });

  test("the plain words: no dash or hyphen used as punctuation in what a student reads", () => {
    const js = read("public/dhiinterviews/js/picture-control.js");
    const says = js.slice(js.indexOf("var SAYS = {"), js.indexOf("};", js.indexOf("var SAYS = {")));
    expect(says).not.toMatch(/[–—]| - /);
  });
});
