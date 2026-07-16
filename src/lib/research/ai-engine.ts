/**
 * research/ai-engine.ts — Market analysis engine.
 *
 * Tries Anthropic API if valid key exists, otherwise uses local
 * quant heuristic based on technical indicators.
 */
import { extractJson, validatePrediction, type Prediction } from "./schema";
import { getActiveStrategy } from "./strategy";

export interface AgentResult {
  prediction: Prediction | null;
  error?: string;
  reasoning?: string;
  rawOutput?: string;
  schemaConfidence?: number;
}

/**
 * Call the Anthropic Messages API directly.
 */
async function callAnthropic(prompt: string): Promise<{ text: string; error?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !apiKey.startsWith("sk-ant-")) {
    return { text: "", error: "No valid Anthropic API key" };
  }

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!resp.ok) {
      const body = await resp.text();
      return { text: "", error: `API ${resp.status}: ${body.slice(0, 300)}` };
    }

    const data = await resp.json() as any;
    const text = data.content?.[0]?.text ?? "";
    return { text };
  } catch (err: any) {
    return { text: "", error: err.message ?? "API call failed" };
  }
}

/**
 * Run the Market Analyst agent on a single symbol.
 */
export async function runAnalyst(
  symbol: string,
  opts?: { horizonDays?: number; quantOnly?: boolean }
): Promise<AgentResult> {
  const strategy = getActiveStrategy();
  if (!strategy) {
    return { prediction: null, error: "No active strategy version found" };
  }

  // Try API if we have a valid key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && apiKey.startsWith("sk-ant-")) {
    const horizon = opts?.horizonDays ?? 60;
    const prompt = `You are the Market Analyst for TradeS. Produce a JSON prediction.

## Investment strategy (v${strategy.version})

${strategy.fullText}

## Output format (strict JSON only)

Return ONLY a JSON object:
{
  "outlook": "bullish" | "neutral" | "bearish",
  "confidence": <integer 1-10>,
  "horizonDays": ${horizon},
  "thesis": "<50+ char plain-English thesis>",
  "risks": ["<risk1>", ...],
  "catalysts": ["<catalyst1>", ...],
  "sources": [{ "title": "<title>", "url": "https://..." }]
}

Research ${symbol} and return ONLY the JSON object.`;

    const { text: rawOutput, error: apiError } = await callAnthropic(prompt);

    if (!apiError && rawOutput) {
      const json = extractJson(rawOutput);
      if (json) {
        const validated = validatePrediction(json);
        if (validated.success && validated.data) {
          const prediction = validated.data;
          prediction.confidence = Math.max(2, Math.min(10, prediction.confidence));
          if (prediction.confidence <= 3) prediction.outlook = "neutral";
          return { prediction, reasoning: rawOutput, rawOutput, schemaConfidence: prediction.confidence };
        }
      }
    }
  }

  return { prediction: null, error: "No valid API — use quantHeuristic()" };
}

/**
 * Generate prediction purely from quantitative signals (no API needed).
 */
export function quantHeuristic(
  symbol: string,
  indicators: Record<string, any> | undefined
): { prediction: Prediction; rawOutput: string } {
  const rsi = indicators?.rsi ?? 50;
  const sma50 = indicators?.sma50;
  const sma200 = indicators?.sma200;
  const regime = indicators?.regime ?? "chop";
  const macdHistogram = indicators?.macdHistogram ?? 0;
  const atrPct = indicators?.atrPct ?? 0;
  const bbUpper = indicators?.bbUpper;
  const bbLower = indicators?.bbLower;

  let outlook: "bullish" | "neutral" | "bearish" = "neutral";
  let confidence = 3;
  const reasons: string[] = [];

  // Trend (SMA crossover)
  if (sma50 && sma200) {
    if (sma50 > sma200) { outlook = "bullish"; confidence += 1; reasons.push(`SMA50 > SMA200`); }
    else { outlook = "bearish"; confidence += 1; reasons.push(`SMA50 < SMA200`); }
  }

  // RSI
  if (rsi < 30) { confidence += 1; reasons.push(`RSI ${rsi.toFixed(0)} oversold`); if (outlook !== "bearish") outlook = "bullish"; }
  else if (rsi > 70) { confidence += 1; reasons.push(`RSI ${rsi.toFixed(0)} overbought`); outlook = "bearish"; }
  else if (rsi < 45 && outlook === "bullish") { confidence += 1; reasons.push(`RSI pullback in uptrend`); }

  // MACD
  if (macdHistogram > 0 && outlook !== "bearish") { confidence += 1; reasons.push("MACD bullish"); }
  if (macdHistogram < 0 && outlook !== "bullish") { confidence += 1; reasons.push("MACD bearish"); }

  // Bollinger Bands
  if (bbUpper && bbLower && bbLower > 0) {
    const lastClose = indicators?.lastClose ?? 0;
    if (lastClose > 0) {
      const bbPos = ((lastClose - bbLower) / (bbUpper - bbLower)) * 100;
      if (bbPos < 10) { reasons.push("Near lower BB"); if (outlook !== "bearish") outlook = "bullish"; }
      if (bbPos > 90) { reasons.push("Near upper BB"); outlook = "bearish"; }
    }
  }

  // Regime
  if (regime === "bear") { outlook = "bearish"; confidence += 1; reasons.push("Bear regime"); }
  if (regime === "bull-calm") { confidence += 1; reasons.push("Calm bull"); }
  if (regime === "chop") { confidence = Math.max(confidence - 1, 2); reasons.push("Choppy"); }

  confidence = Math.max(2, Math.min(8, confidence));

  const thesis = `${symbol}: ${outlook.toUpperCase()} — ${reasons.join("; ")}. Regime: ${regime}, ATR: ${atrPct.toFixed(1)}%.`;
  const risks = ["Market regime shift", "Volatility expansion", "Liquidity risk", "Correlation breakdown"];
  const catalysts = reasons.length > 0 ? [...reasons] : ["Technical breakout", "Mean reversion"];

  const prediction: Prediction = {
    outlook,
    confidence,
    horizonDays: 60,
    thesis,
    risks,
    catalysts,
    sources: [],
  };

  return { prediction, rawOutput: JSON.stringify(prediction) };
}
