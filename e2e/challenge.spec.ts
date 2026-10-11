// The live challenge, first thread (spec 0015 M1; specs 0016 and 0017), through the real pages against the Convex DEV deployment:
// a student joins and gets a code, a friend signs up with the code on the landing form, finishes, sees the report and leaves a genuine note,
// and after the settle job runs the referrer's valid count goes up. Needs CHALLENGE_LIVE=true on dev (like TEST_SIGNIN_ENABLED).
import { expect, test, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { PATH, finishedCheck, newContext, newTag, openQuestion, waitSaved } from "./helpers";

const NOTE = "The study blueprint really fits how I revise before exams.";

// The 5 minute job, run now by hand on the dev deployment (a cron would do the same within 5 minutes).
function runSettleJob() {
  const r = spawnSync("pnpm", ["exec", "convex", "run", "challengeBoard:run", "{}"], { shell: true, encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
}
const mine = (page: Page) => page.evaluate(() => (window as any).DhiApi.getMyReferral());

test("covers 0016 AC-3, AC-5, AC-7, 0017 AC-1: join, a friend signs in with the code and finishes, and the valid count goes up after the job", async ({ browser }) => {
  test.setTimeout(240_000);

  // 1. Ananya finishes the check and joins from the challenge page (rules tick, then the join button).
  const a = await newContext(browser);
  const pa = await a.newPage();
  await finishedCheck(pa, newTag(), "Ananya Rao", 20);
  await pa.goto(PATH + "challenge.html");
  await pa.waitForFunction(() => !!(window as any).DhiApi && !!(window as any).DhiSession);
  await pa.locator("#cpAgree").check();
  await pa.evaluate(() => (document.querySelector("#cpJoinBody .cp-gold") as HTMLButtonElement).click());
  const code = (await pa.locator(".cp-code").textContent())!.trim();
  expect(code).toMatch(/^ANA[A-HJ-NP-Z2-9]{4}$/);
  expect(await mine(pa)).toMatchObject({ code, valid: 0, pending: 0 });
  expect((await mine(pa)).link).toContain(`/landing.html?ref=${code}`);

  // 2. Ravi opens the invite link, signs in, and sends the landing form: the page sends the waiting code with it.
  const b = await newContext(browser);
  const pb = await b.newPage();
  const tag = newTag();
  await pb.goto(`${PATH}landing.html?ref=${code}&test=${tag}`);
  await pb.locator("#testBtn:not([hidden])").waitFor();
  await pb.evaluate(() => (document.getElementById("testBtn") as HTMLButtonElement).click());
  await pb.waitForFunction(() => (window as any).DhiSession.state === "needsProfile", null, { timeout: 40_000 });
  await expect(pb.locator("#ref")).toHaveValue(code);
  await pb.fill("#name", "Ravi Kumar");
  await pb.fill("#age", "20");
  await pb.selectOption("#cls", "College");
  await pb.evaluate(() => {
    const c = document.getElementById("consent") as HTMLInputElement;
    c.checked = true;
    c.dispatchEvent(new Event("change", { bubbles: true }));
    (document.getElementById("go") as HTMLButtonElement).click();
  });
  await pb.waitForURL(/meet|question/, { timeout: 40_000 });

  // 3. Ravi finishes all 18, leaves his number (the report needs it), sees the report and leaves a genuine note.
  await openQuestion(pb, 1);
  await pb.evaluate(() => {
    for (let n = 1; n <= 18; n++) (window as any).DhiStore.answer(n, `q${n}o2`);
  });
  await waitSaved(pb);
  expect(await pb.evaluate(() => (window as any).DhiSession.finish())).toEqual({ ok: true });
  await pb.goto(PATH + "done.html");
  await pb.waitForFunction(() => (window as any).DhiSession?.state === "ready");
  expect(await pb.evaluate(() => (window as any).DhiSession.submitLead({ phone: "9876543211", wantsCommunity: false, guardianPresent: false }))).toMatchObject({ ok: true });
  await pb.goto(PATH + "report-student.html");
  await pb.waitForFunction(() => !!JSON.parse(localStorage.getItem("dhirise.session.v1") || "{}").reportSeenAt, null, { timeout: 30_000 });
  expect(await pb.evaluate((text) => (window as any).DhiSession.submitFeedback({ rating: 5, text, canShare: false }), NOTE)).toMatchObject({ ok: true, genuine: true });

  // 4. Before the job, Ananya sees the friend as pending; nothing about the friend is shown.
  await pa.reload();
  await pa.waitForFunction(() => !!(window as any).DhiApi);
  const before = await mine(pa);
  expect(before.valid).toBe(0);
  expect(before.pending).toBe(1);
  expect(JSON.stringify(before)).not.toMatch(/Ravi|Kumar|@/);

  // 5. The job settles it, and the count goes up.
  runSettleJob();
  await pa.reload();
  await pa.waitForFunction(() => !!(window as any).DhiApi);
  expect(await mine(pa)).toMatchObject({ code, valid: 1, pending: 0 });
  await pa.goto(PATH + "leaderboard.html");
  await expect(pa.locator("#lbYou")).toContainText("1 valid", { timeout: 30_000 });
});

test("covers 0016 AC-3: a wrong or unknown code never blocks sign in", async ({ browser }) => {
  const b = await newContext(browser);
  const pb = await b.newPage();
  await pb.goto(`${PATH}landing.html?ref=ZZZZZZZ&test=${newTag()}`);
  await pb.locator("#testBtn:not([hidden])").waitFor();
  await pb.evaluate(() => (document.getElementById("testBtn") as HTMLButtonElement).click());
  await pb.waitForFunction(() => (window as any).DhiSession.state === "needsProfile", null, { timeout: 40_000 });
  await pb.fill("#name", "Mira Test");
  await pb.fill("#age", "20");
  await pb.selectOption("#cls", "College");
  await pb.evaluate(() => {
    const c = document.getElementById("consent") as HTMLInputElement;
    c.checked = true;
    c.dispatchEvent(new Event("change", { bubbles: true }));
    (document.getElementById("go") as HTMLButtonElement).click();
  });
  await pb.waitForURL(/meet|question/, { timeout: 40_000 });
});

test("covers 0017 AC-2: a student under 18 cannot join without the parent tick, and joins with it", async ({ browser }) => {
  const ctx = await newContext(browser);
  const p = await ctx.newPage();
  await finishedCheck(p, newTag(), "Mira Minor", 15);
  await p.goto(PATH + "challenge.html");
  await p.waitForFunction(() => !!(window as any).DhiApi && !!(window as any).DhiSession);
  expect(await p.evaluate(() => (window as any).DhiApi.joinChallenge({ rulesAccepted: true }))).toEqual({ ok: false, reason: "parentConsent" });
  expect(await p.evaluate(() => (window as any).DhiApi.joinChallenge({ rulesAccepted: true, parentConsent: true }))).toMatchObject({ ok: true });
});

test("covers 0016 AC-2, 0017 AC-5, AC-6: the code hint on the landing form, hide my name, and leaving, through the real pages", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await newContext(browser);
  const pa = await a.newPage();
  await finishedCheck(pa, newTag(), "Ananya Rao", 20);
  await pa.goto(PATH + "challenge.html");
  await pa.waitForFunction(() => !!(window as any).DhiApi && !!(window as any).DhiSession);

  // the join form shows the words, the rules tick and the hide my name tick; join with the name hidden
  await expect(pa.locator(".cp-words")).toContainText("Founding Circle Challenge is a contest");
  await expect(pa.locator("#cpHide + label")).toContainText("Show me as Anonymous");
  await pa.locator("#cpAgree").check();
  await pa.locator("#cpHide").check();
  await pa.evaluate(() => (document.querySelector("#cpJoinBody .cp-gold") as HTMLButtonElement).click());
  const code = (await pa.locator(".cp-code").textContent())!.trim();
  await expect(pa.locator("#cpHideNow")).toBeChecked();

  // a visitor with the link sees "Invited by a friend" while the name is hidden
  const b = await newContext(browser);
  const pb = await b.newPage();
  await pb.goto(`${PATH}landing.html?ref=${code}&test=${newTag()}`);
  await pb.locator("#testBtn:not([hidden])").waitFor();
  await pb.evaluate(() => (document.getElementById("testBtn") as HTMLButtonElement).click());
  await pb.waitForFunction(() => (window as any).DhiSession.state === "needsProfile", null, { timeout: 40_000 });
  await expect(pb.locator("#refStatus")).toContainText("Invited by a friend", { timeout: 20_000 });
  await expect(pb.locator("#refStatus")).toContainText("An invite counts when you are new to DhiRise");

  // showing the name again changes the hint
  await pa.locator("#cpHideNow").uncheck();
  await expect(pa.locator(".cp-manage .cp-msg")).toContainText("Your first name will show");
  expect(await pb.evaluate((c) => (window as any).DhiApi.validateCode(c), code)).toEqual({ ok: true, referrerFirstName: "Ananya" });

  // leaving takes two taps, then the page shows the join form again and the code is unknown
  const leaveBtn = pa.locator(".cp-manage .cp-ghost");
  await leaveBtn.click();
  await expect(leaveBtn).toContainText("Tap again to leave");
  await leaveBtn.click();
  await expect(pa.locator("#cpAgree")).toBeVisible({ timeout: 30_000 });
  expect(await pb.evaluate((c) => (window as any).DhiApi.validateCode(c), code)).toEqual({ ok: false, reason: "unknown" });
});
