/**
 * worker/index.ts — Background worker boot.
 * Fully autonomous: price stream + research + bot cycles.
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const env = await import("../src/lib/env");

  const { db } = await import("../src/lib/db");
  const { priceStreamRunner } = await import("./price-stream");
  const { yahooPollerRunner } = await import("./yahoo-poller");
  const { signalRunner } = await import("./signal-runner");
  const { runResearchCycle } = await import("./research-runner");
  const { runBotCycle } = await import("../src/lib/bot/runner");
  const { runAgentCycle } = await import("../src/lib/agent/agent");
  const { captureAccountSnapshot } = await import("../src/lib/paper/service");
  const { startTelegramBot } = await import("../src/lib/telegram/bot");

  console.log("=".repeat(60));
  console.log("TradeS Worker Booting...");
  console.log(`  Delta keys: ${env.hasDeltaKeys}`);
  console.log(`  Database: ${env.env.DATABASE_PATH}`);
  console.log("=".repeat(60));

  // Start price stream
  if (env.hasDeltaKeys) {
    priceStreamRunner.start();
  } else {
    console.log("[worker] No Delta keys — using Yahoo delayed quotes only");
  }

  // Start Yahoo poller
  yahooPollerRunner.start();

  // Start signal computation
  signalRunner.start();

  // Start Telegram bot
  startTelegramBot();

  // === AUTONOMOUS CYCLES ===

  // Research cycle — every 30 minutes
  setInterval(async () => {
    try {
      const result = await runResearchCycle();
      if (result.newPredictions > 0) {
        console.log(`[research] ${result.newPredictions} new predictions, ${result.skipped} skipped`);
      }
    } catch (err: any) {
      console.error("[research] Error:", err.message);
    }
  }, 30 * 60 * 1000);

  // Bot cycle — every 5 minutes
  setInterval(async () => {
    try {
      const result = await runBotCycle();
      if (result.orders > 0) {
        console.log(`[bot] ${result.orders} orders placed, ${result.triggered} rules triggered`);
      }
    } catch (err: any) {
      console.error("[bot] Error:", err.message);
    }
  }, 5 * 60 * 1000);

  // AI Agent cycle — every 3 minutes (pattern day trading)
  setInterval(async () => {
    try {
      const result = await runAgentCycle("Auto-trading: maximize profit with 50x leverage on Delta India");
      if (result.executed && result.decision) {
        console.log(`[agent] ${result.decision.action} ${result.decision.symbol} — ${result.decision.reason}`);
      }
    } catch (err: any) {
      console.error("[agent] Cycle error:", err.message);
    }
  }, 3 * 60 * 1000);

  // Account snapshot — every 15 minutes
  setInterval(async () => {
    try {
      await captureAccountSnapshot();
    } catch {
      // Non-critical
    }
  }, 15 * 60 * 1000);

  // Run initial research + bot cycle immediately
  setTimeout(async () => {
    try {
      console.log("[worker] Running initial research cycle...");
      const research = await runResearchCycle();
      console.log(`[worker] Research: ${research.newPredictions} predictions, ${research.errors.length} errors`);
      if (research.errors.length > 0) {
        console.log("[worker] Research errors:", JSON.stringify(research.errors.slice(0, 5)));
      }
    } catch (err: any) {
      console.error("[worker] Initial research error:", err.message);
    }

    try {
      console.log("[worker] Running initial bot cycle...");
      const bot = await runBotCycle();
      console.log(`[worker] Bot: ${bot.orders} orders, ${bot.triggered} triggered`);
    } catch (err: any) {
      console.error("[worker] Initial bot error:", err.message);
    }
  }, 10_000); // 10s after boot

  console.log("[worker] All runners + autonomous cycles started.");

  process.on("SIGINT", () => {
    console.log("\n[worker] Shutting down...");
    priceStreamRunner.stop();
    yahooPollerRunner.stop();
    signalRunner.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n[worker] Shutting down...");
    priceStreamRunner.stop();
    yahooPollerRunner.stop();
    signalRunner.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
