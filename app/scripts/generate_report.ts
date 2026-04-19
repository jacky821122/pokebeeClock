/**
 * generate_report.ts
 *
 * On-demand display-layer xlsx report. Reads raw_punches + employees +
 * amendments from Sheets, runs the analyzer, and writes a human-readable
 * xlsx to `data/reports/clock_report_<YYYY-MM>.xlsx`.
 *
 * Usage:
 *   npx tsx scripts/generate_report.ts <YYYY-MM>
 *
 * Core logic lives in `src/lib/report_generator.ts` so a future admin
 * route can reuse it and stream the same buffer as a download.
 */

import * as fs from "fs";
import * as path from "path";

import { generateReport } from "../src/lib/report_generator";

function loadEnvLocal(): void {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log("Usage: npx tsx scripts/generate_report.ts <YYYY-MM>");
    process.exit(0);
  }

  const yyyyMm = args[0]!;
  if (!/^\d{4}-\d{2}$/.test(yyyyMm)) {
    console.error(`Invalid month format: "${yyyyMm}". Expected YYYY-MM.`);
    process.exit(1);
  }

  loadEnvLocal();
  if (!process.env.GOOGLE_SA_JSON || !process.env.SHEET_ID) {
    console.error("GOOGLE_SA_JSON and SHEET_ID must be set (put them in app/.env.local).");
    process.exit(1);
  }

  console.log(`Generating report for ${yyyyMm}...`);
  const buf = await generateReport(yyyyMm);

  const outDir = path.resolve(__dirname, "../data/reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `clock_report_${yyyyMm}.xlsx`);
  fs.writeFileSync(outPath, buf);
  console.log(`Wrote ${outPath} (${buf.length} bytes).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
