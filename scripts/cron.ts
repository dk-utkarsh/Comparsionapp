/**
 * Cron scheduler — runs at 6 AM IST daily.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/cron.ts          # start scheduler
 *   npx tsx --env-file=.env scripts/cron.ts --now     # run immediately + schedule
 *
 * For manual runs with more control:
 *   npx tsx --env-file=.env scripts/run-compare.ts --limit 200
 */

import cron from "node-cron";
import { execSync } from "child_process";
import path from "path";

const scriptPath = path.join(__dirname, "run-compare.ts");

console.log("⏰ Quick Compare Cron Scheduler");
console.log("📅 Schedule: Every day at 6:00 AM IST");
console.log("🚀 Runner: scripts/run-compare.ts (3 concurrent workers)\n");

function runJob() {
  const start = new Date();
  console.log(`\n[${start.toISOString()}] Starting daily comparison job...`);

  try {
    execSync(`npx tsx --env-file=.env "${scriptPath}"`, {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
      timeout: 6 * 60 * 60 * 1000, // 6 hour max
    });
  } catch (e) {
    console.error("Cron job failed:", e instanceof Error ? e.message : e);
  }
}

// Schedule at 6 AM IST
cron.schedule("0 6 * * *", runJob, { timezone: "Asia/Kolkata" });

// Run immediately if --now flag
if (process.argv.includes("--now")) {
  runJob();
}

process.on("SIGINT", () => {
  console.log("\nCron stopped.");
  process.exit(0);
});
