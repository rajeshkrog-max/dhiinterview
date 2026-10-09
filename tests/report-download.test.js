// The Download button's rules (spec 0006, AC-6), run with a pretend server and a pretend clock: no waiting in real time.
import { beforeAll, describe, expect, test } from "vitest";

let Download;
beforeAll(async () => {
  globalThis.window = globalThis;
  await import("../public/dhiinterviews/js/report-download.js");
  Download = globalThis.DhiReportDownload;
});

const T = {
  downloadPreparing: "Getting your PDF ready",
  downloadFailed: "failed words",
  downloadOffline: "offline words",
  downloadSignin: "signin words",
};

// A pretend copy service. `script` is the list of status answers, in order (the last one repeats).
function harness(script, downloadResult = { ok: true }) {
  const log = { says: [], statusCalls: 0, requests: [], downloads: 0, prints: 0, waits: [] };
  let t = 0;
  const copy = {
    status: async () => script[Math.min(log.statusCalls++, script.length - 1)],
    request: async (force) => void log.requests.push(force),
    download: async () => (log.downloads++, downloadResult),
  };
  const run = () =>
    Download.run({
      copy,
      T,
      say: (s) => log.says.push(s),
      print: () => log.prints++,
      now: () => t,
      wait: async (ms) => (log.waits.push(ms), (t += ms)),
    });
  return { run, log };
}

describe("DhiReportDownload.run", () => {
  test("covers AC-6: a ready copy downloads at once, without asking, waiting or showing a wait message", async () => {
    const { run, log } = harness([{ state: "ready", ready: true }]);
    expect(await run()).toBe("saved");
    expect(log).toMatchObject({ downloads: 1, prints: 0, requests: [], waits: [] });
    expect(log.says).not.toContain(T.downloadPreparing);
  });

  test("covers AC-6: a copy that is on its way shows 'Getting your PDF ready', checks every 3 seconds, then downloads", async () => {
    const queued = { state: "queued", ready: false };
    const { run, log } = harness([queued, queued, { state: "making", ready: false }, { state: "ready", ready: true }]);
    expect(await run()).toBe("saved");
    expect(log.says[0]).toBe(T.downloadPreparing);
    expect(log.waits).toEqual([3000, 3000]);
    expect(log.requests).toEqual([]); // it was already asked for: not asked twice
    expect(log.downloads).toBe(1);
    expect(log.says.at(-1)).toBe("");
  });

  test("covers AC-6: when no copy was ever asked for (the first request was lost), Download asks for one, then waits", async () => {
    const { run, log } = harness([{ state: "none", ready: false }, { state: "queued", ready: false }, { state: "ready", ready: true }]);
    expect(await run()).toBe("saved");
    expect(log.requests).toEqual([true]);
    expect(log.waits).toEqual([3000]);
  });

  test("covers AC-6: if the copy is not ready after 60 seconds, a kind message shows and the print page opens", async () => {
    const { run, log } = harness([{ state: "making", ready: false }]);
    expect(await run()).toBe("print");
    expect(log.waits).toHaveLength(20); // 20 checks, 3 seconds apart, is 60 seconds
    expect(log.says.at(-1)).toBe(T.downloadFailed);
    expect(log).toMatchObject({ prints: 1, downloads: 0 });
  });

  test("covers AC-6: a copy that has failed goes straight to the message and the print page, with no waiting", async () => {
    const { run, log } = harness([{ state: "failed", ready: false }]);
    expect(await run()).toBe("print");
    expect(log).toMatchObject({ prints: 1, waits: [], requests: [] });
    expect(log.says.at(-1)).toBe(T.downloadFailed);
  });

  test("covers AC-6: a copy that fails while waiting also falls back", async () => {
    const { run, log } = harness([{ state: "queued", ready: false }, { state: "failed", ready: false }]);
    expect(await run()).toBe("print");
    expect(log.prints).toBe(1);
  });

  test("covers AC-6: when the file cannot be fetched the print page opens; a sign in problem or no network says so instead", async () => {
    const ready = [{ state: "ready", ready: true }];
    expect(await harness(ready, { ok: false, code: "failed" }).run()).toBe("print");
    expect(await harness(ready, { ok: false, code: "not_ready" }).run()).toBe("print");
    const signin = harness(ready, { ok: false, code: "signin" });
    expect(await signin.run()).toBe("signin");
    expect(signin.log.says.at(-1)).toBe(T.downloadSignin);
    expect(signin.log.prints).toBe(0);
    const off = harness(ready, { ok: false, code: "offline" });
    expect(await off.run()).toBe("offline");
    expect(off.log.says.at(-1)).toBe(T.downloadOffline);
  });

  test("covers AC-6: when the server cannot be reached at all it says so, and does not print", async () => {
    const { run, log } = harness([null]);
    expect(await run()).toBe("offline");
    expect(log).toMatchObject({ prints: 0, downloads: 0 });
    expect(log.says.at(-1)).toBe(T.downloadOffline);
  });

  test("covers AC-7: it never rejects, even if the service throws", async () => {
    const out = await Download.run({
      copy: { status: async () => { throw new Error("boom"); }, request: async () => {}, download: async () => ({ ok: true }) },
      T, say: () => {}, print: () => {},
    });
    expect(out).toBe("print");
  });
});
