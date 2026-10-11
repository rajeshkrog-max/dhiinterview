// Writes the winner review CSV (spec 0019, AC-2) to a file. Run from the project root, never in an AI session:
//   node tools/winner-csv.mjs review.csv           (the dev deployment)
//   node tools/winner-csv.mjs review.csv --prod    (production: only with the owner's yes)
// `npx convex run challengeAdmin:exportCsv` prints the CSV text as a JSON string, so a plain redirect would give a file full of \r\n marks. This
// runs that command itself, reads its output as UTF-8 (a shell pipe can mangle Hindi letters), and writes the real CSV with a byte order mark so
// Excel opens it correctly. It never overwrites a file, and it prints only the name of the file and the number of rows: no email, name or note.
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The CLI prints the returned string as JSON, possibly after log lines. The last line that parses as a JSON string is the CSV.
export function csvFromRunOutput(stdout) {
  const lines = String(stdout).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].startsWith('"')) continue;
    try {
      const value = JSON.parse(lines[i]);
      if (typeof value === "string") return value;
    } catch {
      // not the result line
    }
  }
  throw new Error("The command printed no CSV text.");
}

function main(argv) {
  const [file, ...flags] = argv;
  const prod = flags.includes("--prod");
  if (!file || file.startsWith("--") || flags.some((f) => f !== "--prod")) {
    console.error("Usage: node tools/winner-csv.mjs <new-file.csv> [--prod]");
    return 2;
  }
  if (existsSync(file)) {
    console.error(`${file} already exists. Choose a new name, or delete the old file first.`);
    return 2;
  }
  const args = ["node_modules/convex/bin/main.js", "run", "challengeAdmin:exportCsv", "{}", ...(prod ? ["--prod"] : [])];
  const r = spawnSync(process.execPath, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error("The command failed. Run it by hand to see why: npx convex run challengeAdmin:exportCsv" + (prod ? " --prod" : ""));
    return 1;
  }
  const csv = csvFromRunOutput(r.stdout);
  writeFileSync(file, "\uFEFF" + csv, { encoding: "utf8", flag: "wx" });
  console.log(`Wrote ${file} (${csv.trim().split(/\r?\n/).length - 1} rows, ${prod ? "production" : "dev"}). Keep it private and delete it after the announcement.`);
  return 0;
}

// Run only when started from the terminal, not when a test imports csvFromRunOutput.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
