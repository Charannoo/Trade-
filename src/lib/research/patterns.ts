/**
 * patterns.ts — Chart pattern detection (pure functions).
 * Detects breakout, pullback, crossover, support/resistance, and common candlestick patterns.
 */
import { Bar } from "./indicators";

type Pattern = string;

/**
 * Detect chart patterns from a series of bars.
 * Returns an array of human-readable pattern labels.
 */
export function detectPatterns(bars: Bar[]): Pattern[] {
  if (bars.length < 30) return [];

  const patterns: Pattern[] = [];

  // --- Candlestick patterns (last 3 bars) ---
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const prev2 = bars[bars.length - 3];

  const body = Math.abs(last.close - last.open);
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const totalRange = last.high - last.low;

  // Doji: very small body relative to range
  if (totalRange > 0 && body / totalRange < 0.1) {
    patterns.push("doji");
  }

  // Hammer: small body at top, long lower wick (bullish reversal)
  if (totalRange > 0) {
    if (lowerWick > body * 2 && upperWick < body * 0.5 && last.close >= last.open) {
      patterns.push("hammer");
    }
    // Inverted hammer / shooting star: long upper wick
    if (upperWick > body * 2 && lowerWick < body * 0.5) {
      patterns.push(prev.close < prev.open ? "shooting-star" : "inverted-hammer");
    }
  }

  // Engulfing patterns
  if (last.close > last.open && prev.close < prev.open) {
    // Bullish engulfing
    if (last.open <= prev.close && last.close >= prev.open) {
      patterns.push("bullish-engulfing");
    }
  }
  if (last.close < last.open && prev.close > prev.open) {
    // Bearish engulfing
    if (last.open >= prev.close && last.close <= prev.open) {
      patterns.push("bearish-engulfing");
    }
  }

  // Morning star / evening star (3-bar reversal)
  const prev2Body = Math.abs(prev2.close - prev2.open);
  const prevBody = Math.abs(prev.close - prev.open);
  const lastBody = Math.abs(last.close - last.open);

  if (prev2.close < prev2.open) {
    if (prevBody < prev2Body * 0.3 && last.close > last.open && lastBody > prev2Body * 0.5) {
      patterns.push("morning-star");
    }
  }
  if (prev2.close > prev2.open) {
    if (prevBody < prev2Body * 0.3 && last.close < last.open && lastBody > prev2Body * 0.5) {
      patterns.push("evening-star");
    }
  }

  // --- Structural patterns (need more history) ---
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);

  // Breakout: price closes above recent resistance (20-bar high)
  const recentHigh20 = Math.max(...highs.slice(-21, -1));
  if (last.close > recentHigh20) {
    patterns.push("breakout-above-resistance");
  }

  // Breakdown: price closes below recent support (20-bar low)
  const recentLow20 = Math.min(...lows.slice(-21, -1));
  if (last.close < recentLow20) {
    patterns.push("breakdown-below-support");
  }

  // Pullback to SMA: price pulled back to within 1% of a key SMA
  const sma20 = computeSimpleMA(closes, 20);
  const sma50 = computeSimpleMA(closes, 50);
  if (sma20 !== null && Math.abs(last.close - sma20) / sma20 < 0.01) {
    patterns.push("pullback-to-sma20");
  }
  if (sma50 !== null && Math.abs(last.close - sma50) / sma50 < 0.015) {
    patterns.push("pullback-to-sma50");
  }

  // Golden cross / death cross
  if (closes.length >= 60) {
    const sma20Now = computeSimpleMA(closes, 20);
    const sma50Now = computeSimpleMA(closes, 50);
    const sma20Prev = computeSimpleMA(closes.slice(0, -1), 20);
    const sma50Prev = computeSimpleMA(closes.slice(0, -1), 50);
    if (sma20Prev !== null && sma50Prev !== null && sma20Now !== null && sma50Now !== null) {
      if (sma20Prev <= sma50Prev && sma20Now > sma50Now) {
        patterns.push("golden-cross");
      }
      if (sma20Prev >= sma50Prev && sma20Now < sma50Now) {
        patterns.push("death-cross");
      }
    }
  }

  // Volume spike: current volume > 2x 20-day average
  const volumes = bars.map((b) => b.volume);
  const avgVol = computeSimpleMA(volumes, 20);
  if (avgVol !== null && last.volume > avgVol * 2) {
    patterns.push("volume-spike");
  }

  // Consecutive up/down days
  let upDays = 0;
  let downDays = 0;
  for (let i = bars.length - 1; i >= Math.max(0, bars.length - 10); i--) {
    if (bars[i].close > bars[i].open) {
      if (downDays > 0) break;
      upDays++;
    } else if (bars[i].close < bars[i].open) {
      if (upDays > 0) break;
      downDays++;
    }
  }
  if (upDays >= 5) patterns.push(`${upDays}-consecutive-up-days`);
  if (downDays >= 5) patterns.push(`${downDays}-consecutive-down-days`);

  return patterns;
}

function computeSimpleMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}
