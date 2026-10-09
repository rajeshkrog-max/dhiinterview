// The pure parts of the saved result in the browser (spec 0005), kept apart from session.ts so they can be unit tested
// with no Convex client and no page:
//  - `flatten`: the one adapter from what `results.ensure` returns back to the old flat object the pages were written for
//  - `isFlat`: the shape check for a copy read from the device, so a damaged copy is dropped instead of blanking a page
//  - `startResult`: the wait, the "could not load" box and the retry button, with exactly one live timer
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

const TOTAL = 18;

// What `results.ensure` returns, and the old flat object (score.js `score()`) rebuilt from it. `answered` and `complete`
// are not stored: a result exists only for a finished check with all 18 answers.
export type ResultView = FunctionReturnType<typeof api.results.ensure>;
export type ResultDetail = {
  style: Record<string, number>;
  styleGap: number;
  state: Record<string, number>;
  areas: Record<string, { score: number; band: string; negatives: number }>;
  top: unknown[];
  bottom: unknown[];
  lowest: string | null;
  indices: Record<string, number>;
  subject: unknown;
};
export type FlatResult = ResultDetail & {
  answered: number;
  complete: boolean;
  engineVersion: number;
  scoredAt: number;
  dhiStart: number;
  styleKey: ResultView["styleKey"];
  confidence: ResultView["confidence"];
  flags: ResultView["flags"];
};

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

// Throws "bad_result" when the saved block is not the shape the pages need.
export function flatten(view: ResultView): FlatResult {
  const d = view.detail as Partial<ResultDetail> | null;
  if (!d || !d.areas || !d.style || !d.state || !d.indices || !Array.isArray(d.top) || !Array.isArray(d.bottom)) throw new Error("bad_result");
  return {
    answered: TOTAL,
    complete: true,
    engineVersion: view.engineVersion,
    scoredAt: view.scoredAt,
    dhiStart: view.dhiStart,
    styleKey: view.styleKey,
    confidence: view.confidence,
    style: d.style,
    styleGap: d.styleGap ?? 0,
    state: d.state,
    areas: d.areas,
    top: d.top,
    bottom: d.bottom,
    lowest: d.lowest ?? null,
    indices: d.indices,
    subject: d.subject ?? null,
    flags: view.flags,
  };
}

// True when a stored copy has every part the pages read. Cheap on purpose: a hand edited or cut off copy fails it.
export function isFlat(x: unknown): x is FlatResult {
  if (!isObject(x)) return false;
  return (
    typeof x.dhiStart === "number" &&
    (x.styleKey === "v" || x.styleKey === "p" || x.styleKey === "k") &&
    typeof x.confidence === "string" &&
    isObject(x.areas) &&
    isObject(x.style) &&
    isObject(x.state) &&
    isObject(x.indices) &&
    Array.isArray(x.top) &&
    Array.isArray(x.bottom) &&
    isObject(x.flags)
  );
}

export type ResultLoader<T> = {
  // Resolves with the result, or with null after the page was sent somewhere else. Throws when it cannot be had now.
  load: () => Promise<T | null>;
  // Shows (true) or removes (false) the "could not load" box. `retry` starts a new attempt; `error` is why the last one failed.
  box: (show: boolean, retry?: () => void, error?: unknown) => void;
  waitMs: number;
};

// The promise of the result. The page draws only when it resolves. If an attempt takes `waitMs`, or fails, the box shows
// with a Try again button and the promise keeps waiting; it never redirects. There is only ever one live timer: a new
// attempt replaces it, and the first result to arrive wins, from any attempt, and removes the box for good.
export function startResult<T>(opts: ResultLoader<T>): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    let current = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const attempt = () => {
      if (settled) return;
      const id = ++current;
      opts.box(false);
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!settled && id === current) opts.box(true, attempt);
      }, opts.waitMs);
      opts.load().then(
        (r) => {
          if (settled) return;
          if (r === null) {
            if (id === current) clearTimeout(timer); // redirected away: nothing more to show
            return;
          }
          settled = true;
          clearTimeout(timer);
          opts.box(false);
          resolve(r);
        },
        (error: unknown) => {
          if (settled || id !== current) return; // an older attempt failing says nothing about the newest one
          clearTimeout(timer);
          opts.box(true, attempt, error);
        },
      );
    };
    attempt();
  });
}
