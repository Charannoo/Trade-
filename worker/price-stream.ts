/**
 * worker/price-stream.ts — Owns the single Delta Exchange India market-data websocket.
 */
import { DeltaDataStream } from "../src/lib/delta/data-stream";
import { db } from "../src/lib/db";
import { latestPrices, watchlist, holdings } from "../src/lib/db/schema";

let stream: DeltaDataStream | null = null;
let trackedSymbols: string[] = [];

function getAll<T>(builder: any): T[] {
  return builder.all() as T[];
}

function getAllTrackedSymbols(): string[] {
  const wl = getAll<{ symbol: string }>(db.select({ symbol: watchlist.symbol }).from(watchlist));
  const hl = getAll<{ symbol: string }>(db.select({ symbol: holdings.symbol }).from(holdings));
  return [...new Set([...wl.map((r) => r.symbol), ...hl.map((r) => r.symbol)])];
}

function onTrade(symbol: string, trade: { price: number; size: number; timestamp: string }) {
  db.insert(latestPrices)
    .values({
      symbol,
      price: trade.price,
      ts: Date.now(),
      marketOpen: true,
      source: "delta",
      delayed: false,
      currency: "INR",
    })
    .onConflictDoUpdate({
      target: latestPrices.symbol,
      set: {
        price: trade.price,
        ts: Date.now(),
        source: "delta",
        delayed: false,
      },
    })
    .run();
}

function onQuote(_symbol: string, _quote: { bid: number; ask: number; timestamp: string }) {}

function onStatus(status: "connected" | "disconnected" | "error") {
  console.log(`[price-stream] Status: ${status}`);
}

export const priceStreamRunner = {
  start() {
    stream = new DeltaDataStream({ onTrade, onQuote, onStatus });
    trackedSymbols = getAllTrackedSymbols();
    stream.setSymbols(trackedSymbols);
    stream.start();

    setInterval(() => {
      const newSymbols = getAllTrackedSymbols();
      const added = newSymbols.filter((s) => !trackedSymbols.includes(s));
      const removed = trackedSymbols.filter((s) => !newSymbols.includes(s));
      if (added.length > 0 || removed.length > 0) {
        trackedSymbols = newSymbols;
        stream?.setSymbols(trackedSymbols);
        console.log(`[price-stream] Resubscribed: ${trackedSymbols.length} symbols`);
      }
    }, 30000);
  },
  stop() {
    stream?.stop();
  },
};
