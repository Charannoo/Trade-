/**
 * indicators.ts — Pure technical indicator functions.
 * All functions are side-effect-free and testable.
 */
import { detectPatterns } from "./patterns";

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Indicators {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema12: number | null;
  ema26: number | null;
  rsi: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  atr: number | null;
  atrPct: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  bbWidth: number | null;
  obv: number | null;
  obvTrend: "up" | "down" | "flat" | null;
  high52w: number | null;
  low52w: number | null;
  avgVolume20: number | null;
}

// --- Helpers ---

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let emaVal = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    emaVal = values[i] * k + emaVal * (1 - k);
  }
  return emaVal;
}

function trueRanges(bars: Bar[]): number[] {
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prevClose = bars[i - 1].close;
    trs.push(
      Math.max(
        bars[i].high - bars[i].low,
        Math.abs(bars[i].high - prevClose),
        Math.abs(bars[i].low - prevClose)
      )
    );
  }
  return trs;
}

function atr(bars: Bar[], period: number): number | null {
  const trs = trueRanges(bars);
  if (trs.length < period) return null;
  // Wilder's smoothing (EMA with alpha = 1/period)
  let atrVal = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atrVal = (atrVal * (period - 1) + trs[i]) / period;
  }
  return atrVal;
}

// --- Main computation ---

export function computeIndicators(bars: Bar[]): Indicators {
  if (bars.length < 20) {
    return {
      sma20: null, sma50: null, sma200: null,
      ema12: null, ema26: null, rsi: null,
      macdLine: null, macdSignal: null, macdHistogram: null,
      atr: null, atrPct: null,
      bbUpper: null, bbMiddle: null, bbLower: null, bbWidth: null,
      obv: null, obvTrend: null,
      high52w: null, low52w: null, avgVolume20: null,
    };
  }

  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);

  // SMAs
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);

  // EMAs for MACD
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);

  // RSI (14-period)
  let rsi: number | null = null;
  if (closes.length >= 15) {
    const changes: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }
    const gains = changes.map((c) => (c > 0 ? c : 0));
    const losses = changes.map((c) => (c < 0 ? -c : 0));

    let avgGain = gains.slice(0, 14).reduce((a, b) => a + b, 0) / 14;
    let avgLoss = losses.slice(0, 14).reduce((a, b) => a + b, 0) / 14;

    for (let i = 14; i < gains.length; i++) {
      avgGain = (avgGain * 13 + gains[i]) / 14;
      avgLoss = (avgLoss * 13 + losses[i]) / 14;
    }

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi = 100 - 100 / (1 + rs);
  }

  // MACD
  const macdLine = ema12 !== null && ema26 !== null ? ema12 - ema26 : null;
  // Signal line = 9-period EMA of MACD line (need full MACD history)
  let macdSignal: number | null = null;
  let macdHistogram: number | null = null;
  if (macdLine !== null && bars.length >= 35) {
    const macdValues: number[] = [];
    let e12 = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
    let e26 = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
    macdValues.push(e12 - e26);
    for (let i = 26; i < closes.length; i++) {
      e12 = closes[i] * (2 / 13) + e12 * (11 / 13);
      e26 = closes[i] * (2 / 27) + e26 * (25 / 27);
      macdValues.push(e12 - e26);
    }
    macdSignal = ema(macdValues, 9);
    if (macdSignal !== null) {
      macdHistogram = macdValues[macdValues.length - 1] - macdSignal;
    }
  }

  // ATR
  const atrVal = atr(bars, 14);
  const lastClose = closes[closes.length - 1];
  const atrPct = atrVal !== null && lastClose > 0 ? (atrVal / lastClose) * 100 : null;

  // Bollinger Bands (20, 2)
  const sma20Val = sma(closes, 20);
  let bbUpper: number | null = null;
  let bbLower: number | null = null;
  let bbWidth: number | null = null;
  if (sma20Val !== null && closes.length >= 20) {
    const slice = closes.slice(-20);
    const variance = slice.reduce((sum, val) => sum + (val - sma20Val) ** 2, 0) / 20;
    const std = Math.sqrt(variance);
    bbUpper = sma20Val + 2 * std;
    bbLower = sma20Val - 2 * std;
    bbWidth = sma20Val > 0 ? ((bbUpper - bbLower) / sma20Val) * 100 : null;
  }

  // OBV (On-Balance Volume)
  let obv: number | null = null;
  let obvTrend: "up" | "down" | "flat" | null = null;
  if (bars.length >= 2) {
    let obvVal = 0;
    for (let i = 1; i < bars.length; i++) {
      if (bars[i].close > bars[i - 1].close) obvVal += bars[i].volume;
      else if (bars[i].close < bars[i - 1].close) obvVal -= bars[i].volume;
    }
    obv = obvVal;
    // OBV trend over last 20 bars
    if (bars.length >= 21) {
      let obvPrev = 0;
      for (let i = bars.length - 20; i < bars.length; i++) {
        if (bars[i].close > bars[i - 1].close) obvPrev += bars[i].volume;
        else if (bars[i].close < bars[i - 1].close) obvPrev -= bars[i].volume;
      }
      obvTrend = obvVal > obvPrev * 1.05 ? "up" : obvVal < obvPrev * 0.95 ? "down" : "flat";
    }
  }

  // 52-week high/low (use last 252 bars)
  const yearBars = bars.slice(-252);
  const high52w = yearBars.length > 0 ? Math.max(...yearBars.map((b) => b.high)) : null;
  const low52w = yearBars.length > 0 ? Math.min(...yearBars.map((b) => b.low)) : null;

  // 20-day average volume
  const avgVolume20 = sma(volumes, 20);

  return {
    sma20, sma50, sma200,
    ema12, ema26, rsi,
    macdLine, macdSignal, macdHistogram,
    atr: atrVal, atrPct,
    bbUpper, bbMiddle: sma20Val, bbLower, bbWidth,
    obv, obvTrend,
    high52w, low52w, avgVolume20,
  };
}

/**
 * Compute a full snapshot (indicators + patterns) from bars.
 */
export function computeSnapshot(bars: Bar[]): {
  indicators: Indicators;
  patterns: string[];
} {
  return {
    indicators: computeIndicators(bars),
    patterns: detectPatterns(bars),
  };
}
