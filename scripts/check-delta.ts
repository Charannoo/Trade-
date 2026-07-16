/**
 * scripts/check-delta.ts — Check Delta Exchange India account + products.
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const { getAccount, getPositions, loadProductCache, getProductId } = await import("../src/lib/delta/rest");

  console.log("=== Delta Exchange India ===\n");

  // Check account balance
  try {
    const account = await getAccount();
    console.log("Account:");
    console.log("  Balance:", account.cash);
    console.log("  Currency:", account.currency);
    console.log("  Status:", account.status);
  } catch (err: any) {
    console.error("Account error:", err.message);
  }

  // Check positions
  try {
    const positions = await getPositions();
    console.log("\nOpen Positions:", positions.length);
    for (const p of positions) {
      console.log(`  ${p.symbol}: ${p.side} ${p.qty} @ ${p.avg_entry_price} (PnL: ${p.unrealized_pl})`);
    }
  } catch (err: any) {
    console.error("Positions error:", err.message);
  }

  // Check available products
  try {
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "DOGEUSDT", "XRPUSDT"];
    console.log("\nProduct availability:");
    for (const sym of symbols) {
      const id = await getProductId(sym);
      console.log(`  ${sym}: ${id ? `id=${id}` : "NOT FOUND"}`);
    }
  } catch (err: any) {
    console.error("Products error:", err.message);
  }
}

main().catch(console.error);
