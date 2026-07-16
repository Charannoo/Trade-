/**
 * worker/signal-runner.ts — Computes technical indicators every 30 min in market hours.
 */
import cron from "node-cron";
import { db } from "../src/lib/db";
import { watchlist, holdings, quantSignals, barsCache } from "../src/lib/db/schema";
import { getDailyBars } from "../src/lib/yahoo/poller";
import { computeSnapshot } from "../src/lib/research/indicators";

function getAll<T>(builder: any): T[] {
  return builder.all() as T[];
}

function getAllTrackedSymbols(): string[] {
  const wl = getAll<{ symbol: string }>(db.select({ symbol: watchlist.symbol }).from(watchlist));
  const hl = getAll<{ symbol: string }>(db.select({ symbol: holdings.symbol }).from(holdings));
  return [...new Set([...wl.map((r) => r.symbol), ...hl.map((r) => r.symbol)])];
}

async function computeSignalsForSymbol(symbol: string) {
  try {
    const bars = await getDailyBars(symbol, 252);
    if (bars.length < 20) return;

    for (const bar of bars) {
      db.insert(barsCache)
        .values({
          symbol,
          timeframe: "1Day",
          ts: bar.time,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
        })
        .onConflictDoUpdate({
          target: [barsCache.symbol, barsCache.timeframe, barsCache.ts],
          set: {
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
          },
        })
        .run();
    }

    const snapshot = computeSnapshot(bars);

    db.insert(quantSignals)
      .values({
        symbol,
        computedAt: Date.now(),
        payload: snapshot,
      })
      .run();

    console.log(`[signal-runner] Computed signals for ${symbol} (${bars.length} bars)`);
  } catch (err) {
    console.error(`[signal-runner] Failed for ${symbol}:`, err);
  }
}

export const signalRunner = {
  start() {
    cron.schedule("*/30 9-16 * * 1-5", async () => {
      console.log("[signal-runner] Cron: computing signals for all tracked symbols");
      const symbols = getAllTrackedSymbols();
      for (const symbol of symbols) {
        await computeSignalsForSymbol(symbol);
        await new Promise((r) => setTimeout(r, 200));
      }
    });

    cron.schedule("0 18 * * 1-5", async () => {
      console.log("[signal-runner] End-of-day signal computation");
      const symbols = getAllTrackedSymbols();
      for (const symbol of symbols) {
        await computeSignalsForSymbol(symbol);
        await new Promise((r) => setTimeout(r, 200));
      }
    });

    // Prime once ~5s after boot
    setTimeout(async () => {
      console.log("[signal-runner] Initial signal computation");
      const symbols = getAllTrackedSymbols();
      for (const symbol of symbols) {
        await computeSignalsForSymbol(symbol);
        await new Promise((r) => setTimeout(r, 200));
      }
    }, 5000);
  },
  stop() {},
};
