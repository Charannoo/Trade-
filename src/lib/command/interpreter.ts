import { getAccount } from "@/lib/delta/rest";
import { createRule, getEnabledRules, deleteRule } from "@/lib/bot/rules";
import { updateBotSettings, getBotSettings, isBotEnabled } from "@/lib/bot/config";
import type { RuleCondition, RuleAction } from "@/lib/bot/rules";

export interface TradingGoal {
  raw: string;
  targetProfit?: number;
  targetPct?: number;
  capital?: number;
  riskLevel: "conservative" | "moderate" | "aggressive" | "ludicrous";
}

export interface BotPlan {
  goal: TradingGoal;
  balanceDetected: number;
  settings: Record<string, any>;
  rules: Array<{ name: string; condition: RuleCondition; action: RuleAction }>;
  summary: string;
  warnings: string[];
}

const RISK_PROFILES = {
  conservative: {
    maxOrderValue: 200,
    maxPositionPct: 20,
    maxDailyLossPct: 5,
    stopLossPct: 2,
    takeProfitPct: 4,
    minConfidence: 7,
    maxOpenPositions: 2,
    leverage: 1,
  },
  moderate: {
    maxOrderValue: 500,
    maxPositionPct: 40,
    maxDailyLossPct: 10,
    stopLossPct: 3,
    takeProfitPct: 6,
    minConfidence: 5,
    maxOpenPositions: 3,
    leverage: 5,
  },
  aggressive: {
    maxOrderValue: 2000,
    maxPositionPct: 60,
    maxDailyLossPct: 15,
    stopLossPct: 5,
    takeProfitPct: 10,
    minConfidence: 3,
    maxOpenPositions: 4,
    leverage: 20,
  },
  ludicrous: {
    maxOrderValue: 5000,
    maxPositionPct: 80,
    maxDailyLossPct: 25,
    stopLossPct: 8,
    takeProfitPct: 16,
    minConfidence: 1,
    maxOpenPositions: 5,
    leverage: 50,
  },
};

export function parseGoal(input: string): TradingGoal {
  const raw = input.trim();
  let targetProfit: number | undefined;
  let targetPct: number | undefined;
  let capital: number | undefined;
  let riskLevel: TradingGoal["riskLevel"] = "moderate";

  const lower = raw.toLowerCase();

  const INR_TO_USD = 0.012; // 1 ₹ ≈ $0.012

  function parseAmount(s: string): number {
    const cleaned = s.replace(/[₹$,\s]/g, "");
    const num = parseFloat(cleaned);
    if (isNaN(num)) return 0;
    if (s.includes("$") || s.includes("USD") || s.includes("dollar")) return num;
    if (s.includes("₹") || s.includes("INR") || s.includes("rupee")) return num * INR_TO_USD;
    return num;
  }

  function extractAmount(pattern: RegExp): number | undefined {
    const m = raw.match(pattern);
    if (m) return parseAmount(m[1] + (m[2] || ""));
    return undefined;
  }

  capital = extractAmount(/(?:from|with|have|of)\s*([₹$]?\s*[\d,]+(?:\s*(?:USD|INR|dollar|rupee)s?)?)/i);
  targetProfit = extractAmount(/(?:profit|make|earn|get|want|target)\s*([₹$]?\s*[\d,]+(?:\s*(?:USD|INR|dollar|rupee)s?)?)/i);

  // Extract percentage target
  const pctMatch = raw.match(/(\d+)\s*%\s*(?:profit|return|gain)/);
  if (pctMatch) targetPct = parseFloat(pctMatch[1]);

  // Extract "double" / "triple" type keywords
  if (/\bdouble\b/.test(lower)) targetPct = 100;
  if (/\btriple\b/.test(lower)) targetPct = 200;

  // Detect risk level from keywords
  if (/\b(ludicrous|yolo|max|degen|extreme)\b/.test(lower)) riskLevel = "ludicrous";
  else if (/\b(aggressive|high risk|risky|aggressive\.*)\b/.test(lower)) riskLevel = "aggressive";
  else if (/\b(conservative|safe|cautious|low risk)\b/.test(lower)) riskLevel = "conservative";
  else if (/\b(moderate|medium|balanced)\b/.test(lower)) riskLevel = "moderate";

  // Detect "from ₹X to ₹Y" pattern
  const fromTo = raw.match(/from\s*([₹$]?\s*[\d,]+(?:\s*(?:USD|INR|dollar|rupee)s?)?)\s*to\s*([₹$]?\s*[\d,]+(?:\s*(?:USD|INR|dollar|rupee)s?)?)/i);
  if (fromTo) {
    capital = parseAmount(fromTo[1]);
    targetProfit = parseAmount(fromTo[2]);
  }

  // If we have capital and target, calculate pct
  if (capital && targetProfit && targetPct === undefined) {
    targetPct = ((targetProfit - capital) / capital) * 100;
  }

  return { raw, targetProfit, targetPct, capital, riskLevel };
}

export async function createPlan(goal: TradingGoal): Promise<BotPlan> {
  const warnings: string[] = [];

  // 1. Detect actual balance from Delta
  let balanceDetected = 0;
  try {
    const account = await getAccount();
    balanceDetected = parseFloat(account.cash);
  } catch {
    warnings.push("Could not fetch account balance — using zero");
  }

  const effectiveCapital = balanceDetected;
  if (goal.capital && Math.abs(goal.capital - balanceDetected) / Math.max(balanceDetected, 0.01) > 0.1) {
    warnings.push(`You mentioned $${goal.capital.toFixed(2)} but your actual balance is $${balanceDetected.toFixed(2)}. Using actual balance.`);
  }
  if (effectiveCapital <= 0) {
    warnings.push("No capital available — deposit funds to Delta Exchange India first");
  }

  // 2. Determine actual profit target
  let targetPct = goal.targetPct;
  if (goal.targetProfit && effectiveCapital > 0 && targetPct === undefined) {
    targetPct = ((goal.targetProfit - effectiveCapital) / effectiveCapital) * 100;
  }
  if (targetPct === undefined) targetPct = 20;

  // 3. Escalate risk if target is ambitious
  let riskLevel = goal.riskLevel;
  if (targetPct > 200) riskLevel = "ludicrous";
  else if (targetPct > 80) riskLevel = "aggressive";
  else if (targetPct > 30) riskLevel = "moderate";
  else riskLevel = "conservative";

  // 4. Build settings from risk profile
  const profile = RISK_PROFILES[riskLevel];

  // Scale maxOrderValue based on actual capital WITH leverage
  const leveragedCapital = effectiveCapital * profile.leverage;
  const scaledMaxOrder = Math.max(
    Math.min(profile.maxOrderValue, leveragedCapital * 0.8),
    Math.max(1, effectiveCapital * 0.5) // At least 50% of capital
  );

  // 5. Calculate how many trades needed
  const profitPerTradePct = profile.takeProfitPct;
  const tradesNeeded = targetPct > 0 ? Math.ceil(targetPct / profitPerTradePct) : 0;

  const settings: Record<string, any> = {
    enabled: true,
    killSwitch: false,
    maxOrderValue: scaledMaxOrder,
    maxPositionPct: profile.maxPositionPct,
    maxDailyLossPct: profile.maxDailyLossPct,
    maxOpenPositions: profile.maxOpenPositions,
    minConfidence: profile.minConfidence,
    autoBrackets: true,
    stopLossPct: profile.stopLossPct,
    takeProfitPct: profile.takeProfitPct,
    leverage: profile.leverage,
  };

  // 6. Generate trading rules based on risk
  const rules: BotPlan["rules"] = [];

  if (riskLevel === "conservative" || riskLevel === "moderate") {
    rules.push({
      name: "Buy Oversold Bounce",
      condition: { type: "indicator" as const, indicator: "rsi", indicatorBelow: 35 },
      action: { type: "buy_bracket" as const, side: "buy" as const, orderType: "market" as const, qtyPct: profile.maxPositionPct, stopLossPct: profile.stopLossPct, takeProfitPct: profile.takeProfitPct },
    });
    rules.push({
      name: "Buy Bullish Prediction",
      condition: { type: "prediction" as const, outlook: "bullish", minConfidence: profile.minConfidence },
      action: { type: "buy_bracket" as const, side: "buy" as const, orderType: "market" as const, qtyPct: profile.maxPositionPct, stopLossPct: profile.stopLossPct, takeProfitPct: profile.takeProfitPct },
    });
  }

  if (riskLevel === "aggressive" || riskLevel === "ludicrous") {
    rules.push({
      name: "Buy Oversold Bounce",
      condition: { type: "indicator" as const, indicator: "rsi", indicatorBelow: 40 },
      action: { type: "buy_bracket" as const, side: "buy" as const, orderType: "market" as const, qtyPct: profile.maxPositionPct, stopLossPct: profile.stopLossPct, takeProfitPct: profile.takeProfitPct },
    });
    rules.push({
      name: "Buy Bullish Prediction",
      condition: { type: "prediction" as const, outlook: "bullish", minConfidence: Math.max(profile.minConfidence, 2) },
      action: { type: "buy_bracket" as const, side: "buy" as const, orderType: "market" as const, qtyPct: profile.maxPositionPct, stopLossPct: profile.stopLossPct, takeProfitPct: profile.takeProfitPct },
    });
    rules.push({
      name: "Buy MACD Bullish",
      condition: { type: "indicator" as const, indicator: "macdHistogram", indicatorAbove: 0 },
      action: { type: "buy_bracket" as const, side: "buy" as const, orderType: "market" as const, qtyPct: Math.floor(profile.maxPositionPct * 0.7), stopLossPct: profile.stopLossPct, takeProfitPct: profile.takeProfitPct },
    });
    rules.push({
      name: "Sell Overbought",
      condition: { type: "indicator" as const, indicator: "rsi", indicatorAbove: 70 },
      action: { type: "sell" as const, side: "sell" as const, orderType: "market" as const, qtyPct: 100 },
    });
    rules.push({
      name: "Sell Bearish Prediction",
      condition: { type: "prediction" as const, outlook: "bearish", minConfidence: Math.max(profile.minConfidence, 3) },
      action: { type: "sell" as const, side: "sell" as const, orderType: "market" as const, qtyPct: 100 },
    });
  }

  // 7. Build summary
  let summary = "";
  if (targetPct && effectiveCapital > 0) {
    const targetAmt = effectiveCapital * (1 + targetPct / 100);
    const inrRate = 83;
    summary = `Goal: $${effectiveCapital.toFixed(2)} → $${targetAmt.toFixed(2)} (≈ ₹${Math.round(effectiveCapital * inrRate)} → ₹${Math.round(targetAmt * inrRate)}). `;
    summary += `${targetPct >= 0 ? "+" : ""}${targetPct.toFixed(0)}% needed. `;
    summary += `Risk: ${riskLevel}. `;
    summary += `~${tradesNeeded} winning trades at ${profitPerTradePct}% profit each. `;
    summary += `${profile.maxOpenPositions} max positions, ${profile.stopLossPct}% stop, ${profile.takeProfitPct}% target.`;
  } else {
    summary = `${riskLevel} risk profile. Stop: ${profile.stopLossPct}%, Target: ${profile.takeProfitPct}%.`;
  }

  return { goal, balanceDetected: effectiveCapital, settings, rules, summary, warnings };
}

export async function applyPlan(plan: BotPlan): Promise<{ applied: boolean; message: string }> {
  try {
    updateBotSettings(plan.settings);

    const existingRules = getEnabledRules();
    for (const r of existingRules) {
      try { deleteRule(r.id); } catch { }
    }

    for (const r of plan.rules) {
      createRule(r.name, r.condition, r.action);
    }

    return { applied: true, message: plan.summary };
  } catch (err: any) {
    return { applied: false, message: `Failed: ${err.message}` };
  }
}
