/**
 * yahoo/poller.ts — Delayed quotes via yahoo-finance2.
 * Handles Delta↔Yahoo symbol mapping automatically.
 */
import YahooFinance from "yahoo-finance2";
import { db } from "@/lib/db";
import { latestPrices } from "@/lib/db/schema";
import { deltaToYahoo, isDeltaSymbol } from "@/lib/delta/symbols";

const yahooFinance = new YahooFinance();

/**
 * Fetch delayed quote for a single symbol (Delta or Yahoo format).
 */
export async function getYahooQuote(symbol: string): Promise<{
  price: number;
  prevClose: number | null;
  dayOpen: number | null;
  currency: string;
} | null> {
  try {
    const yahooSymbol = deltaToYahoo(symbol);
    const quote = await yahooFinance.quote(yahooSymbol) as any;
    return {
      price: quote.regularMarketPrice ?? 0,
      prevClose: quote.regularMarketPreviousClose ?? null,
      dayOpen: quote.regularMarketOpen ?? null,
      currency: quote.currency ?? "USD",
    };
  } catch {
    return null;
  }
}

/**
 * Fetch daily bars for a symbol (Delta or Yahoo format).
 */
export async function getDailyBars(
  symbol: string,
  limit: number = 200
): Promise<
  { time: number; open: number; high: number; low: number; close: number; volume: number }[]
> {
  try {
    const yahooSymbol = deltaToYahoo(symbol);
    const period1 = new Date();
    period1.setDate(period1.getDate() - limit * 2);
    const result = await yahooFinance.chart(yahooSymbol, {
      period1,
      interval: "1d",
    }) as any;
    if (!result.quotes || result.quotes.length === 0) return [];

    return result.quotes
      .filter((q: any) => q.close != null)
      .map((q: any) => ({
        time: new Date(q.date).getTime(),
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.volume,
      }))
      .slice(-limit);
  } catch (err) {
    console.error(`[yahoo] Failed to fetch bars for ${symbol} (${deltaToYahoo(symbol)}):`, (err as Error).message);
    return [];
  }
}

/**
 * Poll delayed quotes for all tracked symbols.
 */
export async function pollYahooQuotes(symbols: string[]): Promise<void> {
  for (const symbol of symbols) {
    const quote = await getYahooQuote(symbol);
    if (quote && quote.price > 0) {
      db.insert(latestPrices)
        .values({
          symbol,
          price: quote.price,
          prevClose: quote.prevClose,
          dayOpen: quote.dayOpen,
          ts: Date.now(),
          marketOpen: false,
          source: "yahoo",
          delayed: true,
          currency: quote.currency,
        })
        .onConflictDoUpdate({
          target: latestPrices.symbol,
          set: {
            price: quote.price,
            prevClose: quote.prevClose,
            dayOpen: quote.dayOpen,
            ts: Date.now(),
            source: "yahoo",
            delayed: true,
          },
        })
        .run();
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}
