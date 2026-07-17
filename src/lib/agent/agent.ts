import { db } from "@/lib/db";
import { latestPrices, predictions, quantSignals, holdings, ordersLog, watchlist } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getAccount } from "@/lib/delta/rest";
import { getBotSettings } from "@/lib/bot/config";
import { placeOrder } from "@/lib/paper/service";
import { notifyTrade, notifySignal } from "@/lib/telegram/notifier";
import { env } from "@/lib/env";

interface MarketSnapshot {
  symbol: string;
  price: number;
  rsi?: number;
  macd?: number;
  sma50?: number;
  sma200?: number;
  atrPct?: number;
  regime?: string;
  prediction?: { outlook: string; confidence: number };
}

interface PortfolioState {
  balance: number;
  positions: string[];
  buyingPower: number;
  equity: number;
}

interface AgentDecision {
  action: "buy" | "sell" | "hold" | "close";
  symbol?: string;
  reason: string;
  confidence: number;
  qtyPct?: number;
  notional?: number;
}

function getAll<T>(builder: any): T[] {
  return builder.all() as T[];
}

async function getMarketSnapshot(): Promise<MarketSnapshot[]> {
  const symbols = getAll<{ symbol: string }>(
    db.select({ symbol: watchlist.symbol }).from(watchlist)
  );

  const snapshots: MarketSnapshot[] = [];

  for (const { symbol } of symbols) {
    const priceRow = getAll<{ price: number }>(
      db.select({ price: latestPrices.price }).from(latestPrices)
        .where(eq(latestPrices.symbol, symbol)).limit(1)
    );
    if (!priceRow[0]) continue;

    const signalRow = getAll<{ payload: Record<string, any> }>(
      db.select({ payload: quantSignals.payload }).from(quantSignals)
        .where(eq(quantSignals.symbol, symbol)).orderBy(desc(quantSignals.computedAt)).limit(1)
    );

    const predRow = getAll<{ outlook: string; confidence: number }>(
      db.select({ outlook: predictions.outlook, confidence: predictions.confidence })
        .from(predictions).where(eq(predictions.symbol, symbol))
        .orderBy(desc(predictions.createdAt)).limit(1)
    );

    const indicators = signalRow[0]?.payload?.indicators ?? {};

    snapshots.push({
      symbol,
      price: priceRow[0].price,
      rsi: indicators.rsi,
      macd: indicators.macdHistogram,
      sma50: indicators.sma50,
      sma200: indicators.sma200,
      atrPct: indicators.atrPct,
      regime: indicators.regime,
      prediction: predRow[0],
    });
  }

  return snapshots;
}

async function getPortfolioState(): Promise<PortfolioState> {
  let balance = 0;
  try {
    const acct = await getAccount();
    balance = parseFloat(acct.cash);
  } catch {}

  const pos = getAll<{ symbol: string }>(
    db.select({ symbol: holdings.symbol }).from(holdings)
  );

  const settings = getBotSettings();
  return {
    balance,
    positions: pos.map(p => p.symbol),
    buyingPower: balance * (settings.leverage || 1),
    equity: balance,
  };
}

async function recordAgentActivity(decision: AgentDecision, symbol: string) {
  db.insert(require("@/lib/db/schema").botActivity)
    .values({
      ts: Date.now(),
      symbol,
      decision: decision.action,
      reason: decision.reason,
    }).run();
}

async function callAiForDecision(
  goal: string,
  market: MarketSnapshot[],
  portfolio: PortfolioState,
  settings: Record<string, any>
): Promise<AgentDecision | null> {
  const apiKey = env.AI_API_KEY;
  const baseUrl = env.AI_BASE_URL.replace(/\/+$/, "");
  const model = env.AI_MODEL;

  if (!apiKey && !baseUrl.includes("localhost") && !baseUrl.includes("127.0.0.1")) {
    console.log("[agent] No AI_API_KEY set — falling back to quant heuristic");
    return null;
  }

  const marketData = market.map(m =>
    `${m.symbol}: $${m.price} RSI:${m.rsi ?? "?"} MACD:${m.macd ?? "?"} SMA50:${m.sma50 ?? "?"} SMA200:${m.sma200 ?? "?"} Regime:${m.regime ?? "?"} Pred:${m.prediction?.outlook ?? "?"}(${m.prediction?.confidence ?? "?"})`
  ).join("\n");

  const systemPrompt = "You are a crypto trading agent for Delta Exchange India. Return ONLY valid JSON.";
  const userPrompt = `## User's Goal
"${goal}"

## Portfolio
Balance: $${portfolio.balance.toFixed(2)}
Leverage: ${settings.leverage}x
Max position value: $${settings.maxOrderValue}
Positions: ${portfolio.positions.length > 0 ? portfolio.positions.join(", ") : "None"}

## Settings
Stop-loss: ${settings.stopLossPct}%
Take-profit: ${settings.takeProfitPct}%
Max open positions: ${settings.maxOpenPositions}

## Market Data
${marketData}

## Rules
- Available pairs: BTCUSD, ETHUSD, SOLUSD, DOGEUSD, XRPUSD
- Trade ONLY perpetual futures on Delta India
- Use the ${settings.leverage}x leverage to maximize small capital
- Place bracket orders with stop-loss and take-profit
- Consider RSI (<30 oversold buy, >70 overbought sell)
- Consider MACD, SMA crossovers, predictions

Return ONLY a JSON object:
{
  "action": "buy" | "sell" | "hold" | "close",
  "symbol": "<symbol or null if hold>",
  "reason": "<detailed trading thesis>",
  "confidence": <1-10>,
  "qtyPct": <percentage of buying power to use, 10-100, omit if hold>,
  "notional": <optional fixed dollar amount>
}`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[agent] API ${resp.status}: ${body.slice(0, 300)}`);
      return null;
    }

    const data = await resp.json() as any;
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) return null;

    const json = extractJson(text);
    if (!json) return null;

    return json as AgentDecision;
  } catch (err: any) {
    console.error(`[agent] Error: ${err.message}`);
    return null;
  }
}

function extractJson(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

async function executeDecision(
  decision: AgentDecision,
  market: MarketSnapshot[],
  portfolio: PortfolioState
): Promise<boolean> {
  if (decision.action === "hold") return false;

  const symbol = decision.symbol;
  if (!symbol) return false;

  const marketData = market.find(m => m.symbol === symbol);
  if (!marketData) return false;

  const settings = getBotSettings();
  const price = marketData.price;
  const leverage = settings.leverage || 1;
  const leveragedPower = portfolio.buyingPower;

  let orderValue = 0;
  let qty: string | undefined;

  if (decision.notional) {
    orderValue = Math.min(decision.notional, settings.maxOrderValue);
  } else if (decision.qtyPct) {
    orderValue = (decision.qtyPct / 100) * leveragedPower;
    orderValue = Math.min(orderValue, settings.maxOrderValue);
    qty = String(Math.floor(orderValue / price));
  } else {
    orderValue = Math.min(leveragedPower * 0.5, settings.maxOrderValue);
    qty = String(Math.floor(orderValue / price));
  }

  if (orderValue <= 0 || (qty && parseFloat(qty) <= 0)) return false;

  try {
    const orderParams: any = {
      symbol,
      side: decision.action === "sell" || decision.action === "close" ? "sell" : "buy",
      type: "market",
      source: "agent",
    };

    if (qty) orderParams.qty = qty;
    if (leverage > 1) orderParams.leverage = leverage;

    if (settings.stopLossPct) {
      orderParams.stopLossPrice = String(price * (1 - settings.stopLossPct / 100));
    }
    if (settings.takeProfitPct) {
      orderParams.takeProfitPrice = String(price * (1 + settings.takeProfitPct / 100));
    }

    await placeOrder(orderParams);

    await recordAgentActivity(decision, symbol);

    await notifyTrade({
      symbol,
      side: orderParams.side,
      qty,
      status: "submitted",
      reason: decision.reason,
      balance: portfolio.balance,
    });

    return true;
  } catch (err: any) {
    console.error(`[agent] Order failed: ${err.message}`);

    db.insert(require("@/lib/db/schema").botActivity)
      .values({
        ts: Date.now(),
        symbol,
        decision: "blocked",
        reason: `Agent order failed: ${err.message}`,
      }).run();

    return false;
  }
}

export async function runAgentCycle(goal: string): Promise<{
  decision: AgentDecision | null;
  executed: boolean;
  error?: string;
}> {
  try {
    const market = await getMarketSnapshot();
    const portfolio = await getPortfolioState();
    const settings = getBotSettings();

    if (!settings.enabled || settings.killSwitch) {
      return { decision: null, executed: false, error: "Bot is disabled" };
    }

    if (market.length === 0) {
      return { decision: null, executed: false, error: "No market data" };
    }

    // Try AI-powered decision first
    let decision = await callAiForDecision(goal, market, portfolio, settings);

    // Fallback: quant heuristic if AI unavailable
    if (!decision) {
      decision = quantHeuristicDecision(market, portfolio, settings);
    }

    if (!decision || decision.action === "hold") {
      return { decision, executed: false };
    }

    const executed = await executeDecision(decision, market, portfolio);
    return { decision, executed };

  } catch (err: any) {
    console.error(`[agent] Cycle error: ${err.message}`);
    return { decision: null, executed: false, error: err.message };
  }
}

function quantHeuristicDecision(
  market: MarketSnapshot[],
  portfolio: PortfolioState,
  settings: Record<string, any>
): AgentDecision {
  // If we have positions open, check for close signals
  if (portfolio.positions.length > 0) {
    for (const pos of portfolio.positions) {
      const data = market.find(m => m.symbol === pos);
      if (!data) continue;

      // Check for overbought — sell
      if (data.rsi !== undefined && data.rsi > 70) {
        return {
          action: "sell",
          symbol: pos,
          reason: `RSI ${data.rsi.toFixed(0)} overbought — take profit`,
          confidence: 7,
          qtyPct: 100,
        };
      }

      // Check for bearish prediction
      if (data.prediction?.outlook === "bearish" && data.prediction.confidence >= 6) {
        return {
          action: "sell",
          symbol: pos,
          reason: `Bearish prediction (conf ${data.prediction.confidence})`,
          confidence: 6,
          qtyPct: 100,
        };
      }
    }
  }

  // Find best buy candidate
  const candidates = market.map(m => {
    let score = 0;
    const reasons: string[] = [];

    if (m.rsi !== undefined) {
      if (m.rsi < 30) { score += 3; reasons.push(`RSI ${m.rsi.toFixed(0)} oversold`); }
      else if (m.rsi < 40) { score += 1; reasons.push(`RSI ${m.rsi.toFixed(0)} near oversold`); }
    }

    if (m.prediction?.outlook === "bullish") {
      score += m.prediction.confidence / 2;
      reasons.push(`Bullish pred ${m.prediction.confidence}%`);
    }

    if (m.regime === "bull-calm") { score += 1; reasons.push("Bull regime"); }

    if (m.sma50 && m.sma200 && m.sma50 > m.sma200) { score += 1; reasons.push("SMA50>SMA200"); }

    if (m.macd !== undefined && m.macd > 0) { score += 1; reasons.push("MACD+"); }

    return { symbol: m.symbol, score, reason: reasons.join("; ") };
  })
  .filter(c => c.score >= 2)
  .sort((a, b) => b.score - a.score);

  if (candidates.length === 0 || portfolio.positions.length >= settings.maxOpenPositions) {
    // Check if we should close positions
    for (const pos of portfolio.positions) {
      const data = market.find(m => m.symbol === pos);
      if (!data) continue;

      if (data.prediction?.outlook === "bearish") {
        return {
          action: "close",
          symbol: pos,
          reason: `Closing ${pos} — bearish outlook on portfolio`,
          confidence: 5,
          qtyPct: 100,
        };
      }
    }

    return { action: "hold", reason: "No good candidates or at max positions", confidence: 5 };
  }

  const best = candidates[0];
  return {
    action: "buy",
    symbol: best.symbol,
    reason: best.reason,
    confidence: Math.min(best.score, 10),
    qtyPct: Math.min(30 + best.score * 5, settings.maxPositionPct || 60),
  };
}
