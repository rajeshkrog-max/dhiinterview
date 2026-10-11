// The live leaderboard and the winner review (spec 0015 M3 and M4; specs 0018 and 0019), through the real pages and the real terminal commands
// against the Convex DEV deployment: two referrers with friends who finish, the 5 minute job run by hand, the board and the "you" card on
// leaderboard.html, what a stranger can read, then the top 10, the CSV, and a reject followed by a restore. Needs CHALLENGE_LIVE=true and
// TEST_SIGNIN_ENABLED=true on dev. The frozen state needs a moved clock, which a deployed server cannot have, so it is proved in
// convex/challengeBoard.test.ts.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { PATH, finishedCheck, newContext, newTag, openQuestion, waitSaved } from "./helpers";

// Genuine notes, made different on every run: older dev students already hold the plain sentences, and the review marks a note shared with another referral.
const RUN = Math.random().toString(36).slice(2, 8);
const NOTES = [
  `The study blueprint really fits how I revise before exams (${RUN}a).`,
  `I did not expect the report to describe my habits so closely (${RUN}b).`,
  `Reading my strongest areas first made me feel calmer about it (${RUN}c).`,
];

// A convex function run from the terminal, the way the team runs it. The CLI is started directly (no shell), so a JSON argument needs no quoting.
function convex(fn: string, args: object = {}): string {
  const r = spawnSync(process.execPath, ["node_modules/convex/bin/main.js", "run", fn, JSON.stringify(args)], { encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout;
}
const convexJson = (fn: string, args: object = {}) => JSON.parse(convex(fn, args));
const runJob = () => convex("challengeBoard:run");

const word = () => Array.from({ length: 5 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");

// A new student who finishes the check, then joins the challenge. Returns the page and the code.
async function referrer(browser: Browser, first: string, last: string, hide: boolean) {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await finishedCheck(page, newTag(), `${first} ${last}`, 20);
  await page.goto(PATH + "challenge.html");
  await page.waitForFunction(() => !!(window as any).DhiApi && !!(window as any).DhiSession);
  expect(await page.evaluate((h) => (window as any).DhiApi.joinChallenge({ rulesAccepted: true, hideName: h }), hide)).toMatchObject({ ok: true });
  const code: string = (await page.evaluate(() => (window as any).DhiApi.getMyReferral())).code;
  return { page, code };
}

// A friend who signs up with the code and does every step with a genuine note.
async function friend(browser: Browser, code: string, name: string, note: string) {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await page.goto(`${PATH}landing.html?ref=${code}&test=${newTag()}`);
  await page.locator("#testBtn:not([hidden])").waitFor();
  await page.evaluate(() => (document.getElementById("testBtn") as HTMLButtonElement).click());
  await page.waitForFunction(() => (window as any).DhiSession.state === "needsProfile", null, { timeout: 40_000 });
  await page.fill("#name", name);
  await page.fill("#age", "20");
  await page.selectOption("#cls", "College");
  await page.evaluate(() => {
    const c = document.getElementById("consent") as HTMLInputElement;
    c.checked = true;
    c.dispatchEvent(new Event("change", { bubbles: true }));
    (document.getElementById("go") as HTMLButtonElement).click();
  });
  await page.waitForURL(/meet|question/, { timeout: 40_000 });
  await openQuestion(page, 1);
  await page.evaluate(() => {
    for (let n = 1; n <= 18; n++) (window as any).DhiStore.answer(n, `q${n}o2`);
  });
  await waitSaved(page);
  expect(await page.evaluate(() => (window as any).DhiSession.finish())).toEqual({ ok: true });
  await page.goto(PATH + "done.html");
  await page.waitForFunction(() => (window as any).DhiSession?.state === "ready");
  const phone = "9" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  expect(await page.evaluate((p) => (window as any).DhiSession.submitLead({ phone: p, wantsCommunity: false, guardianPresent: false }), phone)).toMatchObject({ ok: true });
  await page.goto(PATH + "report-student.html");
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem("dhirise.session.v1") || "{}").reportSeenAt, null, { timeout: 30_000 });
  expect(await page.evaluate((text) => (window as any).DhiSession.submitFeedback({ rating: 5, text, canShare: false }), note)).toMatchObject({ ok: true, genuine: true });
  await ctx.close();
}

const openBoard = async (page: Page) => {
  await page.goto(PATH + "leaderboard.html");
  await page.waitForFunction(() => !!(window as any).DhiApi && !!(window as any).DhiSession);
};

test("covers 0018 AC-1 to AC-8, 0019 AC-1 to AC-5: two referrers, the board and the you card, nothing private, then top 10, CSV, reject and restore", async ({ browser }) => {
  test.setTimeout(540_000);
  const fa = "Lba" + word();
  const fb = "Lbb" + word();
  const a = await referrer(browser, fa, "Rao", false);
  const b = await referrer(browser, fb, "Iyer", true); // B hides their name

  // Before anyone has finished: no rank yet, and the card says what to do.
  await openBoard(a.page);
  await expect(a.page.locator("#lbYou .lb-you-rank")).toHaveText("–", { timeout: 30_000 });
  await expect(a.page.locator("#lbYou .lb-prog-text")).toContainText("Your first valid friend puts you on the board");

  await friend(browser, a.code, "Friend Oneaa", NOTES[0]);
  await friend(browser, a.code, "Friend Twobb", NOTES[1]);
  await friend(browser, b.code, "Friend Threecc", NOTES[2]);
  runJob();

  // A: two valid. The dev board keeps students from earlier runs, so A's place is not fixed (an earlier student with 2 valid who reached it first stays above);
  // the row is marked "(you)" and the card's place is the row's place.
  await openBoard(a.page);
  await expect(a.page.locator("#lbYou")).toContainText("2 valid · 0 pending", { timeout: 30_000 });
  const rowA = a.page.locator(".lb-spot.me, .lb-row.me");
  await expect(rowA).toContainText(`${fa[0].toUpperCase()}${fa.slice(1)} R. (you)`);
  const rankA = Number((await a.page.locator("#lbYou .lb-you-rank").textContent())!.replace("#", ""));
  expect(rankA).toBeGreaterThanOrEqual(1);
  await expect(rowA.locator(".lb-medal, .lb-rank").first()).toContainText(String(rankA));
  await expect(a.page.locator("#lbYou .lb-prog-text")).toContainText(rankA === 1 ? "You're leading" : new RegExp(`\\d+ more to pass #${rankA - 1}$`));
  await expect(a.page.locator("#lbFoot")).toContainText(/Updated .+ · Every 5 minutes/);
  await expect(a.page.locator("#lbClosed")).toBeHidden();
  await expect(a.page.locator(".lb-row, .lb-spot").filter({ hasText: /Friend|Oneaa|Twobb/ })).toHaveCount(0); // a friend's name is nowhere

  // B: one valid, hidden name. The row says "Anonymous <style>", has no class, and the card says how many more to pass the place above.
  await openBoard(b.page);
  await expect(b.page.locator("#lbYou")).toContainText("1 valid · 0 pending", { timeout: 30_000 });
  await expect(b.page.locator(".lb-spot.me, .lb-row.me")).toContainText(/Anonymous (Builder|Achiever|Explorer) \(you\)/);
  await expect(b.page.locator(".lb-row.me .lb-cls")).toHaveText("");
  const rankB = Number((await b.page.locator("#lbYou .lb-you-rank").textContent())!.replace("#", ""));
  expect(rankB).toBeGreaterThan(rankA); // B has 1 valid and A has 2
  await expect(b.page.locator("#lbYou .lb-prog-text")).toContainText(new RegExp(`\\d+ more to pass #${rankB - 1}$`));
  expect(JSON.stringify(await b.page.content())).not.toContain(fb.charAt(0).toUpperCase() + fb.slice(1)); // B's own name is not on the page for the public row

  // What the board holds: only the six keys, and nothing private anywhere in the answer.
  const board = await b.page.evaluate(() => (window as any).DhiSession.challenge.leaderboard());
  expect(board.frozen).toBe(false);
  expect(board.rows.length).toBeGreaterThan(1);
  for (const row of board.rows) expect(Object.keys(row).every((k) => ["rank", "displayName", "cls", "style", "valid", "avatar"].includes(k))).toBe(true);
  const text = JSON.stringify(board);
  expect(text).not.toMatch(/@|selfDoubt|lowMood|phone|email|studentId|\b[a-z0-9]{32}\b/);
  expect(text).not.toContain("Iyer");
  const hidden = board.rows.find((r: any) => r.displayName.startsWith("Anonymous") && r.valid === 1);
  expect(hidden).toBeTruthy();
  expect(hidden).not.toHaveProperty("cls");

  // Showing a name and hiding it again change the board at once, not at the next run.
  await b.page.evaluate(() => (window as any).DhiApi.setHideName(false));
  const shown = (await b.page.evaluate(() => (window as any).DhiSession.challenge.leaderboard())).rows.find((r: any) => r.rank === rankB);
  expect(shown).toMatchObject({ displayName: `${fb[0].toUpperCase()}${fb.slice(1)} I.`, cls: "College", valid: 1 });
  await b.page.evaluate(() => (window as any).DhiApi.setHideName(true));
  const hiddenAgain = (await b.page.evaluate(() => (window as any).DhiSession.challenge.leaderboard())).rows.find((r: any) => r.rank === rankB);
  expect(hiddenAgain.displayName).toMatch(/^Anonymous /);
  expect(hiddenAgain).not.toHaveProperty("cls");

  // A visitor who is not signed in cannot read it (the bridge answers "cannot be had").
  const anon = await (await newContext(browser)).newPage();
  await anon.goto(`${PATH}landing.html`);
  await anon.waitForFunction(() => !!(window as any).DhiSession);
  expect(await anon.evaluate(() => (window as any).DhiSession.challenge.leaderboard())).toBeNull();

  // ---- the winner review, from the terminal ----
  const top = convexJson("challengeAdmin:top10");
  const mineA = top.find((r: any) => r.name === `${fa[0].toUpperCase()}${fa.slice(1)} R.`);
  const mineB = top.find((r: any) => r.name === `${fb[0].toUpperCase()}${fb.slice(1)} I.`);
  expect(mineA).toMatchObject({ validCount: 2, rank: rankA, pendingCount: 0 }); // the same order as the board
  expect(mineA.referrals).toHaveLength(2);
  expect(mineA.referrals[0]).toMatchObject({ status: "valid", check: "fresh", feedbackGenuine: true });
  expect(mineA.referrals[0].friendEmail).toMatch(/@example\.com$/);
  expect(mineA.referrals.map((x: any) => x.feedbackText).sort()).toEqual([NOTES[0], NOTES[1]].sort());
  expect(mineA.referrals.every((x: any) => x.warnings.includes("fast_finish"))).toBe(true); // the test friends answer all 18 in a second
  expect(mineA.referrals.some((x: any) => x.warnings.includes("same_text"))).toBe(false); // the notes of this run are not shared with any other referral
  // The dev board keeps students from earlier runs, so B (one valid friend) can sit below the top 10, and the review lists only the top 10.
  // B's count of 1 was already proved above (the you card and the board row); here it is checked again only when B is in the list.
  if (rankB <= 10) expect(mineB).toMatchObject({ validCount: 1 });
  else expect(mineB).toBeUndefined();
  console.log(`top10 (dev): ${top.length} referrers; ${mineA.name}: ${mineA.validCount} valid, warnings ${JSON.stringify(mineA.referrals.map((x: any) => x.warnings))}`);

  const csv: string = JSON.parse(convex("challengeAdmin:exportCsv")); // the CLI prints a string result as JSON; tools/winner-csv.mjs writes the real file
  const lines = csv.trim().split("\r\n");
  expect(lines[0]).toBe("rank,referrer,referrerEmail,class,validCount,referralId,status,rejectReason,reviewNote,signedUpAt,check,completedAt,reportSeenAt,feedbackAt,feedbackGenuine,feedbackText,friendEmail,warnings");
  expect(lines.filter((l) => l.includes(NOTES[0]) || l.includes(NOTES[1]) || l.includes(NOTES[2])).length).toBe(rankB <= 10 ? 3 : 2); // the CSV is the top 10 too: B's friend's note is in it only when B is
  console.log(`CSV (dev): ${lines.length - 1} rows; header ok`);

  // reject one of A's referrals: the count and the live ranking change; the restore puts it back.
  const target = mineA.referrals[0].referralId;
  expect(convexJson("challengeAdmin:reject", { referralId: target, reason: "e2e check", note: "rejecting on dev" })).toEqual({ ok: true, status: "rejected", referrerValid: 1 });
  const afterReject = convexJson("challengeAdmin:ranking").find((r: any) => r.name === mineA.name);
  if (afterReject) expect(afterReject.validCount).toBe(1); // with 1 valid, A can fall below the top 10 on a dev board full of earlier students; the reject answer above already proved the count
  expect(convexJson("challengeAdmin:reject", { referralId: target, reason: "again", note: "" })).toEqual({ ok: false, code: "bad_state" });
  expect(convexJson("challengeAdmin:restore", { referralId: target, reason: "e2e check", note: "restoring on dev" })).toEqual({ ok: true, status: "valid", referrerValid: 2 });
  expect(convexJson("challengeAdmin:ranking").find((r: any) => r.name === mineA.name).validCount).toBe(2);
  const reviewed = convexJson("challengeAdmin:top10").find((r: any) => r.name === mineA.name).referrals.find((x: any) => x.referralId === target);
  expect(reviewed).toMatchObject({ status: "valid", reviewNote: "e2e check: rejecting on dev | restored: e2e check: restoring on dev" });
  expect(convexJson("challengeAdmin:reject", { friendEmail: "nobody.here@example.com", reason: "x", note: "" })).toEqual({ ok: false, code: "no_match" });

  // the board reads the same after the review (a job run puts it right either way).
  runJob();
  await openBoard(a.page);
  await expect(a.page.locator("#lbYou")).toContainText("2 valid", { timeout: 30_000 });
});
