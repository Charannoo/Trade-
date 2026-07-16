/**
 * bot/rules.ts — Rule evaluation engine.
 * 
 * Rules have JSON conditions and actions.
 * The engine evaluates conditions against market data and triggers actions.
 */
import { db } from "@/lib/db";
import { botRules, botRuleVersions, botActivity } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export interface RuleCondition {
  type: "signal" | "price" | "indicator" | "prediction" | "portfolio";
  // Signal-based
  signalType?: string;        // e.g., "rsi_oversold", "macd_bullish"
  // Price-based
  priceAbove?: number;
  priceBelow?: number;
  changeAbovePct?: number;
  changeBelowPct?: number;
  // Indicator-based
  indicator?: string;
  indicatorAbove?: number;
  indicatorBelow?: number;
  // Prediction-based
  minConfidence?: number;
  outlook?: string;
  // Portfolio-based
  maxPositions?: number;
  positionSizePct?: number;
}

export interface RuleAction {
  type: "buy" | "sell" | "buy_bracket" | "sell_bracket" | "skip" | "alert";
  // Order params
  side?: "buy" | "sell";
  orderType?: "market" | "limit" | "stop_limit";
  qtyPct?: number;           // % of buying power
  qtyShares?: number;        // Fixed number of shares
  notional?: number;         // Fixed dollar amount
  limitOffsetPct?: number;   // Limit offset from current price
  // Bracket params
  stopLossPct?: number;
  takeProfitPct?: number;
  // Alert params
  alertMessage?: string;
}

export interface EvaluatedRule {
  ruleId: number;
  ruleName: string;
  ruleVersion: number;
  matched: boolean;
  action: RuleAction | null;
  reason: string;
}

/**
 * Get all enabled rules.
 */
export function getEnabledRules() {
  return db
    .select()
    .from(botRules)
    .where(eq(botRules.enabled, true))
    .all();
}

/**
 * Get a specific rule by ID.
 */
export function getRule(ruleId: number) {
  return db
    .select()
    .from(botRules)
    .where(eq(botRules.id, ruleId))
    .all()[0];
}

/**
 * Create a new rule.
 */
export function createRule(
  name: string,
  condition: RuleCondition,
  action: RuleAction
): number {
  const now = Date.now();
  const result = db.insert(botRules)
    .values({
      name,
      enabled: true,
      condition,
      action,
      version: 1,
      createdAt: now,
    })
    .run();

  return Number(result.lastInsertRowid);
}

/**
 * Update a rule (creates a version history entry).
 */
export function updateRule(
  ruleId: number,
  condition: RuleCondition,
  action: RuleAction
): void {
  const rule = getRule(ruleId);
  if (!rule) return;

  const now = Date.now();
  const newVersion = rule.version + 1;

  // Save old version to history
  db.insert(botRuleVersions)
    .values({
      ruleId,
      version: rule.version,
      name: rule.name,
      condition: rule.condition,
      action: rule.action,
      createdAt: now,
    })
    .run();

  // Update the rule
  db.update(botRules)
    .set({
      condition,
      action,
      version: newVersion,
    })
    .where(eq(botRules.id, ruleId))
    .run();
}

/**
 * Toggle a rule's enabled state.
 */
export function toggleRule(ruleId: number): boolean {
  const rule = getRule(ruleId);
  if (!rule) return false;

  const newState = !rule.enabled;
  db.update(botRules)
    .set({ enabled: newState })
    .where(eq(botRules.id, ruleId))
    .run();

  return newState;
}

/**
 * Delete a rule.
 */
export function deleteRule(ruleId: number): void {
  db.delete(botRules).where(eq(botRules.id, ruleId)).run();
}

/**
 * Evaluate a rule against current data.
 * Returns whether the rule matched and what action to take.
 */
export function evaluateRule(
  ruleId: number,
  data: {
    symbol?: string;
    currentPrice?: number;
    indicators?: Record<string, any>;
    prediction?: { outlook: string; confidence: number };
    portfolio?: { positions: number; buyingPower: number; equity: number };
  }
): EvaluatedRule | null {
  const rule = getRule(ruleId);
  if (!rule || !rule.enabled) return null;

  const condition = rule.condition as RuleCondition;
  const action = rule.action as RuleAction;
  let matched = false;
  let reason = "";

  switch (condition.type) {
    case "signal": {
      // Check if a specific signal pattern is present
      if (condition.signalType && data.indicators) {
        matched = !!data.indicators[condition.signalType];
        reason = matched
          ? `Signal "${condition.signalType}" detected`
          : `Signal "${condition.signalType}" not present`;
      }
      break;
    }

    case "price": {
      if (data.currentPrice !== undefined) {
        if (condition.priceAbove !== undefined && data.currentPrice > condition.priceAbove) {
          matched = true;
          reason = `Price $${data.currentPrice} > $${condition.priceAbove}`;
        } else if (condition.priceBelow !== undefined && data.currentPrice < condition.priceBelow) {
          matched = true;
          reason = `Price $${data.currentPrice} < $${condition.priceBelow}`;
        }
      }
      break;
    }

    case "indicator": {
      if (condition.indicator && data.indicators) {
        const value = data.indicators[condition.indicator];
        if (value !== undefined && value !== null) {
          if (condition.indicatorAbove !== undefined && value > condition.indicatorAbove) {
            matched = true;
            reason = `${condition.indicator} = ${value} > ${condition.indicatorAbove}`;
          } else if (condition.indicatorBelow !== undefined && value < condition.indicatorBelow) {
            matched = true;
            reason = `${condition.indicator} = ${value} < ${condition.indicatorBelow}`;
          }
        }
      }
      break;
    }

    case "prediction": {
      if (data.prediction) {
        if (condition.outlook !== undefined && data.prediction.outlook !== condition.outlook) {
          matched = false;
          reason = `Outlook mismatch: ${data.prediction.outlook} != ${condition.outlook}`;
        } else if (condition.minConfidence !== undefined && data.prediction.confidence < condition.minConfidence) {
          matched = false;
          reason = `Confidence ${data.prediction.confidence} < ${condition.minConfidence}`;
        } else {
          matched = true;
          reason = `Prediction: ${data.prediction.outlook} (conf ${data.prediction.confidence})`;
        }
      }
      break;
    }

    case "portfolio": {
      if (data.portfolio) {
        if (condition.maxPositions !== undefined && data.portfolio.positions >= condition.maxPositions) {
          matched = false;
          reason = `At max positions: ${data.portfolio.positions}/${condition.maxPositions}`;
        } else {
          matched = true;
          reason = `Portfolio: ${data.portfolio.positions} positions, $${data.portfolio.buyingPower} buying power`;
        }
      }
      break;
    }
  }

  if (!matched) {
    return null;
  }

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    ruleVersion: rule.version,
    matched: true,
    action,
    reason,
  };
}

/**
 * Log a rule evaluation result.
 */
export function logRuleEvaluation(result: EvaluatedRule, symbol?: string): void {
  db.insert(botActivity)
    .values({
      ts: Date.now(),
      ruleId: result.ruleId,
      ruleVersion: result.ruleVersion,
      symbol: symbol ?? null,
      decision: result.action?.type === "buy" || result.action?.type === "buy_bracket"
        ? "buy"
        : result.action?.type === "sell" || result.action?.type === "sell_bracket"
        ? "sell"
        : "skip",
      reason: `[${result.ruleName}] ${result.reason}`,
    })
    .run();
}
