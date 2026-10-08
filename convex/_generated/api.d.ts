/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as checks from "../checks.js";
import type * as consentText from "../consentText.js";
import type * as crons from "../crons.js";
import type * as feedback from "../feedback.js";
import type * as feedbackRules from "../feedbackRules.js";
import type * as health from "../health.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as leads from "../leads.js";
import type * as limits from "../limits.js";
import type * as purge from "../purge.js";
import type * as sheetAdmin from "../sheetAdmin.js";
import type * as sheetFlush from "../sheetFlush.js";
import type * as sheetFlushCore from "../sheetFlushCore.js";
import type * as sheetRows from "../sheetRows.js";
import type * as sheetRowsCore from "../sheetRowsCore.js";
import type * as sheetSync from "../sheetSync.js";
import type * as sheetsGoogle from "../sheetsGoogle.js";
import type * as students from "../students.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  checks: typeof checks;
  consentText: typeof consentText;
  crons: typeof crons;
  feedback: typeof feedback;
  feedbackRules: typeof feedbackRules;
  health: typeof health;
  helpers: typeof helpers;
  http: typeof http;
  leads: typeof leads;
  limits: typeof limits;
  purge: typeof purge;
  sheetAdmin: typeof sheetAdmin;
  sheetFlush: typeof sheetFlush;
  sheetFlushCore: typeof sheetFlushCore;
  sheetRows: typeof sheetRows;
  sheetRowsCore: typeof sheetRowsCore;
  sheetSync: typeof sheetSync;
  sheetsGoogle: typeof sheetsGoogle;
  students: typeof students;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
