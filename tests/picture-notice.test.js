// The one time picture notice (spec 0011, AC-2), asked mode only: who sees it, the guardian tick for under 18s, what each button does, and that
// a kind message replaces a failure. A tiny pretend page and a pretend DhiSession stand in for the browser and the bridge.
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

class El {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attrs = {};
    this.className = "";
    this.listeners = {};
    this.own = "";
    this.parentNode = null;
    this.checked = false;
    this.hidden = false;
  }
  set textContent(v) {
    this.own = String(v);
    this.children.forEach((c) => (c.parentNode = null));
    this.children = [];
  }
  get textContent() {
    return this.own + this.children.map((c) => c.textContent).join(" ");
  }
  set innerHTML(v) {
    this.textContent = ""; // only ever cleared by the notice
  }
  appendChild(c) {
    c.parentNode = this;
    this.children.push(c);
    return c;
  }
  insertBefore(c, ref) {
    c.parentNode = this;
    const at = ref ? this.children.indexOf(ref) : -1;
    if (at < 0) this.children.push(c);
    else this.children.splice(at, 0, c);
    return c;
  }
  removeChild(c) {
    this.children = this.children.filter((x) => x !== c);
    c.parentNode = null;
    return c;
  }
  get nextSibling() {
    if (!this.parentNode) return null;
    const i = this.parentNode.children.indexOf(this);
    return this.parentNode.children[i + 1] || null;
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
}
const all = (el, out = []) => (out.push(el), el.children.forEach((c) => all(c, out)), out);
const byText = (root, text) => all(root).find((e) => e.tag === "button" && e.textContent === text);
const flush = () => new Promise((r) => setTimeout(r, 0));
const byId = (root, id) => all(root).find((e) => e.id === id);

let session;
const makeSession = (over = {}) => {
  session = {
    enabled: true,
    notice: "ask",
    consent: { pictureLine: "DhiRise also saves the small profile picture from your Google account.", lines: ["Line one.", "Line two.", "The picture line."] },
    pictureEnabled: () => session.enabled,
    ready: () => Promise.resolve("ready"),
    pictureNotice: () => session.notice,
    acceptPicture: vi.fn(async () => ({ ok: true })),
    declinePicture: vi.fn(async () => undefined),
    ...over,
  };
  globalThis.DhiSession = session;
};

let N;
let current = null; // the page being tested: document.getElementById looks in it
beforeAll(async () => {
  globalThis.window = globalThis;
  globalThis.document = { createElement: (tag) => new El(tag), getElementById: (id) => (current ? byId(current, id) || null : null) };
  await import("../public/dhiinterviews/js/picture-notice.js");
  N = globalThis.DhiPictureNotice;
});
beforeEach(() => makeSession());

// A report page with a heading to mount the notice after, and a landing container to mount it in.
const reportPage = () => {
  const root = (current = new El("main"));
  const heading = root.appendChild(new El("header"));
  root.appendChild(new El("section"));
  return { root, heading };
};

describe("when the notice shows (AC-2, AC-16)", () => {
  test("covers AC-2: for a student who has to be asked it appears right after the heading, with the picture line, the full notice and two buttons", async () => {
    const { root, heading } = reportPage();
    N.mountAfter(heading, { age: 20 });
    await flush();
    const card = heading.nextSibling;
    expect(card.id).toBe("pictureNotice");
    expect(card.textContent).toContain("saves the small profile picture from your Google account");
    expect(card.textContent).toContain("Read the full notice");
    for (const line of session.consent.lines) expect(card.textContent).toContain(line);
    expect(byText(card, "I agree, show my picture")).toBeTruthy();
    expect(byText(card, "Not now")).toBeTruthy();
    expect(card.attrs["aria-labelledby"]).toBe("pnTitle");
    expect(root.children).toHaveLength(3);
  });

  test("covers AC-2: nothing is drawn when there is nothing to ask (the default mode, already agreed, or waiting out the 14 days)", async () => {
    for (const notice of ["none", "later"]) {
      makeSession({ notice });
      const { root, heading } = reportPage();
      N.mountAfter(heading, { age: 20 });
      await flush();
      expect(root.children, notice).toHaveLength(2);
    }
  });

  test("covers AC-16: with the feature off in this browser, nothing is drawn and the session is not even asked", async () => {
    makeSession({ enabled: false, ready: vi.fn(async () => "ready") });
    const { root, heading } = reportPage();
    N.mountAfter(heading, { age: 20 });
    await flush();
    expect(root.children).toHaveLength(2);
    expect(session.ready).not.toHaveBeenCalled();
  });

  test("covers AC-2: a second call does not draw a second card", async () => {
    const { root, heading } = reportPage();
    N.mountAfter(heading, { age: 20 });
    await flush();
    N.mountAfter(heading, { age: 20 });
    await flush();
    expect(all(root).filter((e) => e.id === "pictureNotice")).toHaveLength(1);
  });

  test("covers AC-2: on the landing welcome back state the same notice goes at the end of its container, with the landing's own button style", async () => {
    const box = (current = new El("div"));
    N.mountIn(box, { age: 20 });
    await flush();
    const card = box.children.at(-1);
    expect(card.id).toBe("pictureNotice");
    expect(card.className).toContain("pn-landing");
    expect(byText(card, "I agree, show my picture").className).toBe("btn");
    expect(byText(card, "Not now").className).toBe("btn ghost");
  });

  test("covers AC-2: a hidden landing container gets no notice", async () => {
    const box = (current = new El("div"));
    box.hidden = true;
    N.mountIn(box, { age: 20 });
    await flush();
    expect(box.children).toHaveLength(0);
  });
});

describe("agreeing (AC-2)", () => {
  test("covers AC-2: an adult agrees with no tick, the server is asked once, and a thank you replaces the card", async () => {
    const { heading } = reportPage();
    N.mountAfter(heading, { age: 20 });
    await flush();
    const card = heading.nextSibling;
    expect(all(card).some((e) => e.tag === "input")).toBe(false); // no guardian box for an adult
    byText(card, "I agree, show my picture").click();
    await flush();
    expect(session.acceptPicture).toHaveBeenCalledTimes(1);
    expect(session.acceptPicture).toHaveBeenCalledWith(false);
    expect(card.textContent).toContain("Thank you. Your picture will show in a moment.");
    expect(card.attrs.role).toBe("status");
  });

  test("covers AC-2: under 18 the guardian box is there, and what is ticked is what the server is told", async () => {
    for (const tick of [false, true]) {
      makeSession();
      const { heading } = reportPage();
      N.mountAfter(heading, { age: 15 });
      await flush();
      const card = heading.nextSibling;
      const box = all(card).find((e) => e.tag === "input");
      expect(box).toBeTruthy();
      expect(card.textContent).toContain("A parent or guardian is with me and agrees.");
      box.checked = tick;
      byText(card, "I agree, show my picture").click();
      await flush();
      expect(session.acceptPicture).toHaveBeenCalledWith(tick);
    }
  });

  test("covers AC-2: when the age is not known the guardian box is still there, so a needs_guardian answer can always be acted on", async () => {
    const { heading } = reportPage();
    N.mountAfter(heading, {});
    await flush();
    expect(all(heading.nextSibling).some((e) => e.tag === "input")).toBe(true);
  });

  test("covers AC-2: a double tap sends one request", async () => {
    let finish;
    makeSession({ acceptPicture: vi.fn(() => new Promise((r) => (finish = r))) });
    const { heading } = reportPage();
    N.mountAfter(heading, { age: 20 });
    await flush();
    const agree = byText(heading.nextSibling, "I agree, show my picture");
    agree.click();
    agree.click();
    expect(session.acceptPicture).toHaveBeenCalledTimes(1);
    expect(agree.attrs["aria-busy"]).toBe("true");
    finish({ ok: true });
    await flush();
  });

  test("covers AC-2: the server's refusals each get a kind message in the card, and the card stays so the student can try again", async () => {
    const SAYS = {
      needs_guardian: "Please ask a parent or guardian to be with you, then tick the box.",
      consent_text_changed: "This notice has changed. Please reload the page and read it again.",
      offline: "We could not save that. Please check your connection and try again.",
      something_unknown: "We could not save that. Please check your connection and try again.",
    };
    for (const [code, words] of Object.entries(SAYS)) {
      makeSession({ acceptPicture: vi.fn(async () => ({ ok: false, code })) });
      const { heading } = reportPage();
      N.mountAfter(heading, { age: 15 });
      await flush();
      const card = heading.nextSibling;
      byText(card, "I agree, show my picture").click();
      await flush();
      expect(card.parentNode, code).not.toBeNull(); // still there
      expect(card.textContent, code).toContain(words);
      expect(byText(card, "I agree, show my picture").attrs["aria-busy"], code).toBeUndefined(); // free to tap again
    }
  });

  test("covers AC-16: if the server says the feature is off, the card just goes", async () => {
    makeSession({ acceptPicture: vi.fn(async () => ({ ok: false, code: "off" })) });
    const { root, heading } = reportPage();
    N.mountAfter(heading, { age: 20 });
    await flush();
    byText(heading.nextSibling, "I agree, show my picture").click();
    await flush();
    expect(root.children).toHaveLength(2);
  });
});

describe("Not now (AC-2)", () => {
  test("covers AC-2: it tells the server, removes the card at once, and never touches the consent call", async () => {
    const { root, heading } = reportPage();
    N.mountAfter(heading, { age: 20 });
    await flush();
    byText(heading.nextSibling, "Not now").click();
    expect(session.declinePicture).toHaveBeenCalledTimes(1);
    expect(session.acceptPicture).not.toHaveBeenCalled();
    expect(root.children).toHaveLength(2);
  });
});
