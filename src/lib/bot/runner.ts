/**
 * bot/runner.ts — Bot execution engine.
 *
 * Evaluates rules against real data from DB, places orders, enforces safeguards.
 */
import { db } from "@/lib/db";
import { botActivity, latestPrices, predictions, quantSignals, holdings, watchlist } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getBotSettings, isBotEnabled, checkDailyLossLimit } from "./config";
import { getEnabledRules, evaluateRule, logRuleEvaluation } from "./rules";
import { placeOrder } from "@/lib/paper/service";

let startOfDayEquity: number | null = null;
let lastCheckDay = "";

function getAll<T>(builder: any): T[] {
  return builder.all() as T[];
}

/**
 * Run one cycle of the bot.
 */
export async function runBotCycle(): Promise<{
  evaluated: number;
  triggered: number;
  orders: number;
  halted: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  let evaluated = 0;
  let triggered = 0;
  let orders = 0;

  if (!isBotEnabled()) {
    return { evaluated: 0, triggered: 0, orders: 0, halted: true, errors: [] };
  }

  const settings = getBotSettings();

  const today = new Date().toISOString().split("T")[0];
  if (today !== lastCheckDay) {
    lastCheckDay = today;
    startOfDayEquity = null;
  }

  const rules = getEnabledRules();
  if (rules.length === 0) {
    return { evaluated: 0, triggered: 0, orders: 0, halted: false, errors: [] };
  }

  // Get all tracked symbols
  const symbols = getAll<{ symbol: string }>(
    db.select({ symbol: watchlist.symbol }).from(watchlist)
  );

  for (const { symbol } of symbols) {
    const data = gatherEvaluationData(symbol);

    for (const rule of rules) {
      evaluated++;
      try {
        const result = evaluateRule(rule.id, data);
        if (!result || !result.matched) continue;

        triggered++;
        logRuleEvaluation(result, data.symbol);

        if (result.action && settings.enabled && !settings.killSwitch) {
          const ok = await executeAction(result.action, data, settings);
          if (ok) orders++;
        }
      } catch (err: any) {
        errors.push(`Rule ${rule.name} on ${symbol}: ${err.message}`);
      }
    }
  }

  return { evaluated, triggered, orders, halted: false, errors };
}

/**
 * Gather real data from DB for rule evaluation.
 */
function gatherEvaluationData(symbol: string): {
  symbol: string;
  currentPrice?: number;
  indicators?: Record<string, any>;
  prediction?: { outlook: string; confidence: number };
  portfolio?: { positions: number; buyingPower: number; equity: number };
} {
  // Latest price
  const priceRow = getAll<{ price: number }>(
    db.select({ price: latestPrices.price }).from(latestPrices).where(eq(latestPrices.symbol, symbol)).limit(1)
  );
  const currentPrice = priceRow[0]?.price;

  // Latest quant signal (indicators)
  const signalRow = getAll<{ payload: Record<string, any> }>(
    db.select({ payload: quantSignals.payload }).from(quantSignals).where(eq(quantSignals.symbol, symbol)).orderBy(desc(quantSignals.computedAt)).limit(1)
  );
  const indicators = signalRow[0]?.payload?.indicators;

  // Latest prediction
  const predRow = getAll<{ outlook: string; confidence: number }>(
    db.select({ outlook: predictions.outlook, confidence: predictions.confidence })
      .from(predictions)
      .where(eq(predictions.symbol, symbol))
      .orderBy(desc(predictions.createdAt))
      .limit(1)
  );
  const prediction = predRow[0] ?? undefined;

  // Portfolio summary
  const allHoldings = getAll<{ symbol: string; shares: number; costBasis: number }>(
    db.select().from(holdings)
  );
  const totalEquity = allHoldings.reduce((sum, h) => {
    // Use cost basis as proxy — real equity needs current prices
    return sum + h.shares * h.costBasis;
  }, 0);

  const portfolio = {
    positions: allHoldings.length,
    buyingPower: Math.max(0, 500000 - totalEquity), // Start with 5L capital
    equity: totalEquity || 500000,
  };

  return {
    symbol,
    currentPrice,
    indicators,
    prediction,
    portfolio,
  };
}

/**
 * Execute a rule action.
 */
async function executeAction(
  action: { type: string; side?: string; qtyPct?: number; notional?: number; stopLossPct?: number; takeProfitPct?: number },
  data: { symbol?: string; currentPrice?: number; portfolio?: { buyingPower: number; equity: number } },
  settings: { maxOrderValue: number; stopLossPct: number; takeProfitPct: number }
): Promise<boolean> {
  if (!data.symbol || !data.currentPrice || !data.portfolio) return false;

  let orderValue = 0;
  let qty: string | undefined;

  if (action.notional) {
    orderValue = Math.min(action.notional, settings.maxOrderValue);
  } else if (action.qtyPct) {
    orderValue = (action.qtyPct / 100) * data.portfolio.buyingPower;
    orderValue = Math.min(orderValue, settings.maxOrderValue);
    qty = String(Math.floor(orderValue / data.currentPrice));
  }

  if (orderValue > settings.maxOrderValue || orderValue <= 0) return false;

  try {
    const side = (action.type === "buy" || action.type === "buy_bracket") ? "buy" : "sell";

    const orderParams: any = {
      symbol: data.symbol,
      side,
      type: "market",
      source: "bot",
    };

    if (qty) orderParams.qty = qty;
    if (action.notional) orderParams.notional = String(orderValue);

    if (action.stopLossPct) {
      orderParams.stopLossPrice = String(data.currentPrice * (1 - action.stopLossPct / 100));
    }
    if (action.takeProfitPct) {
      orderParams.takeProfitPrice = String(data.currentPrice * (1 + action.takeProfitPct / 100));
    }

    await placeOrder(orderParams);
    return true;
  } catch (err: any) {
    db.insert(botActivity)
      .values({
        ts: Date.now(),
        symbol: data.symbol,
        decision: "blocked",
        reason: `Order failed: ${err.message}`,
      })
      .run();
    return false;
  }
}
