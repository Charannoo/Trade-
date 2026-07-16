/**
 * worker/yahoo-poller.ts — Polls delayed quotes via yahoo-finance2.
 * Polls ALL tracked symbols (Delta symbols get mapped to Yahoo).
 */
import { pollYahooQuotes } from "../src/lib/yahoo/poller";
import { db } from "../src/lib/db";
import { watchlist, holdings } from "../src/lib/db/schema";
import { hasDeltaKeys } from "../src/lib/env";

let interval: NodeJS.Timeout | null = null;

function getAll<T>(builder: any): T[] {
  return builder.all() as T[];
}

function getAllTrackedSymbols(): string[] {
  const wl = getAll<{ symbol: string }>(db.select({ symbol: watchlist.symbol }).from(watchlist));
  const hl = getAll<{ symbol: string }>(db.select({ symbol: holdings.symbol }).from(holdings));
  return [...new Set([...wl.map((r) => r.symbol), ...hl.map((r) => r.symbol)])];
}

export const yahooPollerRunner = {
  start() {
    const poll = async () => {
      try {
        const symbols = getAllTrackedSymbols();
        if (symbols.length > 0) {
          await pollYahooQuotes(symbols);
        }
      } catch (err) {
        console.error("[yahoo-poller] Error:", err);
      }
    };

    poll();
    interval = setInterval(poll, 120_000);
  },
  stop() {
    if (interval) clearInterval(interval);
  },
};
