// One report copy job (spec 0006). Takes the next due row, asks Cloudflare Browser Run to open our own render page with a
// short lived signed token and print it, checks that the reply is a real PDF, stores it and attaches it.
// Nothing here accepts a file, HTML or version number from a browser (AC-4): the bytes come only from Browser Run's reply
// to a page address we built. Failures are recorded as short codes; no student data goes into a log line or an error.
// `fetch` and the settings are passed in, so a test can run every branch with a pretend Browser Run.
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { MAX_PDF_BYTES, isDayLimit, isPdf, msUntilNextUtcDay, sha256Hex, signRenderToken, waitFromRetryAfter } from "./reportCore";

export type MakeConfig = {
  accountId?: string;
  apiToken?: string;
  secret?: string;
  baseUrl?: string;
};

export type MakeDeps = { config: MakeConfig; fetch: typeof fetch; now: () => number };

export const RENDER_PATH = "/dhiinterviews/report-render.html";
export const READY_SELECTOR = '#report[data-ready="1"]';
const BROWSER_TIMEOUT_MS = 45000;

// The Browser Run request. The render page sets data-ready only when the whole report is drawn and its fonts and images
// are in; on any failure it sets data-error, which never matches the selector, so the call fails instead of printing a
// blank page (an error page must never be stored as the student's report).
export function pdfRequestBody(url: string) {
  return {
    url,
    gotoOptions: { waitUntil: "networkidle0", timeout: BROWSER_TIMEOUT_MS },
    waitForSelector: { selector: READY_SELECTOR, timeout: BROWSER_TIMEOUT_MS },
    pdfOptions: { format: "a4", printBackground: true, preferCSSPageSize: false },
  };
}

// Runs one job if there is one. Returns what happened, for the caller and for tests. Never throws.
export async function runOneJob(ctx: ActionCtx, deps: MakeDeps): Promise<"idle" | "attached" | "retry" | "failed"> {
  const job = await ctx.runMutation(internal.reportCopy.claim, {});
  if (!job) return "idle";

  const { accountId, apiToken, secret, baseUrl } = deps.config;
  if (!accountId || !apiToken || !secret || !baseUrl) {
    await ctx.runMutation(internal.reportCopy.finishFailed, { id: job.id, kind: "fatal", code: "render_not_configured" });
    return "failed";
  }

  const counted = async (code: string) => {
    await ctx.runMutation(internal.reportCopy.finishFailed, { id: job.id, kind: "counted", code });
    return "retry" as const;
  };

  try {
    const token = await signRenderToken(secret, job.studentId, job.checkId, deps.now());
    const pageUrl = `${baseUrl.replace(/\/+$/, "")}${RENDER_PATH}#t=${token}`;
    const res = await deps.fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-run/pdf`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
      body: JSON.stringify(pdfRequestBody(pageUrl)),
    });

    if (res.status === 429 || res.status >= 500) {
      // Browser Run is busy or down: wait as long as it asks, and do not use up one of the five tries
      const dayLimit = res.status === 429 && isDayLimit((await res.text().catch(() => "")).slice(0, 500));
      await ctx.runMutation(internal.reportCopy.finishFailed, {
        id: job.id,
        kind: "wait",
        code: dayLimit ? "browser_day_limit" : `browser_${res.status}`,
        waitMs: dayLimit ? msUntilNextUtcDay(deps.now()) : waitFromRetryAfter(res.headers.get("retry-after")),
      });
      return "retry";
    }
    if (!res.ok) return await counted(`browser_${res.status}`);

    const bytes = await res.arrayBuffer();
    if (!isPdf(bytes)) return await counted(bytes.byteLength > MAX_PDF_BYTES ? "pdf_too_big" : "not_a_pdf");

    const sha256 = await sha256Hex(bytes);
    const storageId = await ctx.storage.store(new Blob([bytes], { type: "application/pdf" }));
    const outcome = await ctx.runMutation(internal.reportCopy.attach, { id: job.id, storageId, size: bytes.byteLength, sha256, version: job.version });
    return outcome === "attached" ? "attached" : "retry";
  } catch {
    return await counted("job_error"); // a network failure or a timeout; the cause is not logged because it may hold an address
  }
}
