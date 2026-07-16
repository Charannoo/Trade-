/**
 * research/market.ts — Market context: S&P trend, VIX, regime tagging.
 */
import yahooFinance from "yahoo-finance2";
import { computeIndicators, Bar } from "./indicators";

export interface MarketContext {
  sp500Trend: "up" | "down" | "flat";
  vix: number | null;
  regime: "bull-calm" | "bull-vol" | "bear" | "chop";
  description: string;
}

/**
 * Determine market regime from S&P 500 trend and VIX.
 */
export async function getMarketContext(): Promise<MarketContext> {
  let vix: number | null = null;
  let sp500Trend: "up" | "down" | "flat" = "flat";

  try {
    const vixQuote = await yahooFinance.quote("^VIX") as any;
    vix = vixQuote.regularMarketPrice ?? null;
  } catch {
    // VIX not available
  }

  try {
    const bars = await getMarketBars("SPY", 210);
    if (bars.length >= 200) {
      const indicators = computeIndicators(bars);
      const lastClose = bars[bars.length - 1].close;
      if (indicators.sma200) {
        sp500Trend = lastClose > indicators.sma200 * 1.02
          ? "up"
          : lastClose < indicators.sma200 * 0.98
            ? "down"
            : "flat";
      }
    }
  } catch {
    // SPY not available
  }

  let regime: MarketContext["regime"];
  if (sp500Trend === "up" && (vix === null || vix < 20)) {
    regime = "bull-calm";
  } else if (sp500Trend === "up" && vix !== null && vix >= 20) {
    regime = "bull-vol";
  } else if (sp500Trend === "down") {
    regime = "bear";
  } else {
    regime = "chop";
  }

  const description = describeRegime(regime, sp500Trend, vix);

  return { sp500Trend, vix, regime, description };
}

function describeRegime(
  regime: MarketContext["regime"],
  _spTrend: string,
  vix: number | null
): string {
  const vixStr = vix !== null ? `VIX=${vix.toFixed(1)}` : "VIX=unknown";
  switch (regime) {
    case "bull-calm":
      return `Bull market, calm (${vixStr}). S&P trending up. Favor long setups with trend alignment.`;
    case "bull-vol":
      return `Bull market, volatile (${vixStr}). S&P up but choppy. Tighter stops, smaller positions.`;
    case "bear":
      return `Bear market (${vixStr}). S&P below 200-day SMA. Prefer shorts or cash. Be cautious with longs.`;
    case "chop":
      return `Choppy/unclear regime (${vixStr}). S&P near flat. Range-bound strategies preferred. Reduce size.`;
  }
}

async function getMarketBars(symbol: string, limit: number): Promise<Bar[]> {
  try {
    const period1 = new Date();
    period1.setDate(period1.getDate() - limit * 2);
    const result = await yahooFinance.chart(symbol, { period1, interval: "1d" }) as any;
    return (result.quotes || [])
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
  } catch {
    return [];
  }
}
