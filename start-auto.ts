/**
 * start-auto.ts — One-command automation entry point.
 *
 * Usage:
 *   npx tsx start-auto.ts                         # interactive mode
 *   npx tsx start-auto.ts "I want ₹200 profit"    # direct command
 *
 * Runs the full pipeline: check balance → parse goal → configure bot → start worker
 */
import dotenv from "dotenv";
import path from "path";
import { spawn } from "child_process";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const { getAccount } = await import("./src/lib/delta/rest");
  const { parseGoal, createPlan, applyPlan } = await import("./src/lib/command/interpreter");

  const command = process.argv[2] || "";

  console.log("=".repeat(60));
  console.log("  TradeS Autonomous Trading Bot");
  console.log("=".repeat(60));

  // Check balance
  let balance = 0;
  try {
    const acct = await getAccount();
    balance = parseFloat(acct.cash);
    const currency = acct.currency;
    const inrEst = currency === "USD" ? balance * 83 : balance;
    console.log(`\n📊 Account balance: $${balance.toFixed(2)} ${currency}${currency === "USD" ? ` (≈ ₹${inrEst.toFixed(0)})` : ""}`);
  } catch (err: any) {
    console.log(`\n⚠ Could not fetch balance: ${err.message}`);
  }

  // Get goal
  let rawCommand = command;
  if (!rawCommand) {
    const readline = await import("readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rawCommand = await new Promise<string>((resolve) => {
      rl.question(`\n🎯 What's your trading goal?\n   e.g. "I want ₹200 from ₹59", "Make 20%", "Double my money"\n\n> `, resolve);
      rl.close();
    });
  }

  // Parse and plan
  console.log(`\n📝 Parsing: "${rawCommand}"`);
  const goal = parseGoal(rawCommand);
  const plan = await createPlan(goal);

  console.log(`\n📋 Plan:`);
  console.log(`   Balance: ₹${plan.balanceDetected}`);
  console.log(`   Risk level: ${plan.goal.riskLevel}`);
  console.log(`   ${plan.summary}`);

  if (plan.warnings.length > 0) {
    console.log(`\n⚠ Warnings:`);
    for (const w of plan.warnings) console.log(`   • ${w}`);
  }

  // Confirm
  if (!command) {
    const readline = await import("readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question(`\n✅ Apply this configuration and start the bot? (Y/n): `, resolve);
      rl.close();
    });
    if (answer.toLowerCase().startsWith("n")) {
      console.log("\n❌ Cancelled.");
      process.exit(0);
    }
  }

  // Apply
  const result = await applyPlan(plan);
  if (!result.applied) {
    console.error(`\n❌ ${result.message}`);
    process.exit(1);
  }
  console.log(`\n✅ ${result.message}`);

  // Start worker
  console.log("\n🚀 Starting autonomous worker...");
  const worker = spawn("npx", ["tsx", "worker/index.ts"], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env },
  });

  process.on("SIGINT", () => {
    console.log("\n\nShutting down...");
    worker.kill();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    worker.kill();
    process.exit(0);
  });

  await new Promise(() => {});
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err.message);
  process.exit(1);
});
