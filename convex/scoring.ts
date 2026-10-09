// Scoring on the server (spec 0005). It runs the SAME two files the browser loads (js/engine/questions.js and
// score.js), never a copy, so the server and the browser cannot drift. Both files hang their object on the global
// (`window` in a page, `globalThis` here), so importing them for their side effect is enough.
// Used only by `makeResult` (resultsCore.ts). Nothing here reads or writes the database.
import "../public/dhiinterviews/js/engine/questions.js";
import "../public/dhiinterviews/js/engine/score.js";

export type StyleKey = "v" | "p" | "k";
export type Confidence = "clear" | "leaning" | "blended";
export type Flags = {
  keepsFeelingsInside: boolean;
  lowCareerClarity: boolean;
  heavyExpectations: boolean;
  selfDoubt: boolean;
  sleepStrain: boolean;
  lowMood: boolean;
  lowConsistency: boolean;
};

type Said = { q: number; question: string; optionId: string; text: string; value: number } | null;
type AreaPick = { area: string; score: number; band: string; said: Said };

// What `DhiScore.score` returns (score.js). `lowConsistency` is null only when no seed is given; we always give one.
export type RawScore = {
  answered: number;
  complete: boolean;
  style: Record<StyleKey, number>;
  styleKey: StyleKey;
  styleGap: number;
  confidence: Confidence;
  state: { calm: number; restless: number; low: number };
  areas: Record<string, { score: number; band: string; negatives: number }>;
  top: AreaPick[];
  bottom: AreaPick[];
  lowest: string | null;
  indices: { studyReadiness: number; emotionalBalance: number; focusEnergy: number; direction: number };
  dhiStart: number;
  subject: { heavy: string; style: StyleKey; key: string; optionId: string } | null;
  flags: Omit<Flags, "lowConsistency"> & { lowConsistency: boolean | null };
};

type Engine = { ENGINE_VERSION: number; score: (answers: Record<string, string>, opts: { seed: string }) => RawScore };

function engine(): Engine {
  const e = (globalThis as unknown as { DhiScore?: Engine }).DhiScore;
  if (!e || typeof e.score !== "function" || !Number.isInteger(e.ENGINE_VERSION)) throw new Error("scoring engine not loaded");
  return e;
}

export const ENGINE_VERSION = (): number => engine().ENGINE_VERSION;

// answers = { q1: "q1o4", … } (option ids), exactly as the browser scores them.
export function scoreAnswers(answers: Record<string, string>, seed: string): RawScore {
  return engine().score(answers, { seed });
}

// The saved shape: the headline fields, the big block (`detail`, no flags in it) and the flags, which go to their own table.
export function splitResult(raw: RawScore) {
  const { flags, dhiStart, styleKey, confidence, style, styleGap, state, areas, top, bottom, lowest, indices, subject } = raw;
  return {
    dhiStart,
    styleKey,
    confidence,
    detail: { style, styleGap, state, areas, top, bottom, lowest, indices, subject },
    flags: { ...flags, lowConsistency: flags.lowConsistency === true },
  };
}
