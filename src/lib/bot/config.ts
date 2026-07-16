/**
 * bot/config.ts — Bot configuration manager.
 * 
 * Uses botConfig table for persistent settings.
 * Includes safeguards: max position size, max daily loss, kill switch.
 */
import { db } from "@/lib/db";
import { botConfig, botActivity } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface BotSettings {
  enabled: boolean;
  killSwitch: boolean;
  maxPositionPct: number;      // Max % of equity per position
  maxDailyLossPct: number;     // Max daily loss before halt
  maxOpenPositions: number;     // Max concurrent positions
  minConfidence: number;        // Minimum prediction confidence to trade
  maxOrderValue: number;        // Max dollar value per order
  autoBrackets: boolean;        // Auto-attach stop-loss/take-profit
  stopLossPct: number;          // Default stop-loss %
  takeProfitPct: number;        // Default take-profit %
}

const DEFAULT_SETTINGS: BotSettings = {
  enabled: false,
  killSwitch: false,
  maxPositionPct: 10,       // 10% of equity per position
  maxDailyLossPct: 3,       // 3% daily loss limit
  maxOpenPositions: 5,
  minConfidence: 6,         // Only trade predictions with confidence >= 6
  maxOrderValue: 5000,
  autoBrackets: true,
  stopLossPct: 5,
  takeProfitPct: 10,
};

/**
 * Get current bot settings.
 */
export function getBotSettings(): BotSettings {
  const rows = db.select().from(botConfig).all();
  const settings = { ...DEFAULT_SETTINGS };

  for (const row of rows) {
    const key = row.key as keyof BotSettings;
    if (key in settings) {
      (settings as any)[key] = row.value;
    }
  }

  return settings;
}

/**
 * Update a single bot setting.
 */
export function setBotSetting(key: keyof BotSettings, value: any): void {
  db.insert(botConfig)
    .values({ key, value })
    .onConflictDoUpdate({
      target: botConfig.key,
      set: { value },
    })
    .run();
}

/**
 * Update multiple settings at once.
 */
export function updateBotSettings(updates: Partial<BotSettings>): void {
  for (const [key, value] of Object.entries(updates)) {
    setBotSetting(key as keyof BotSettings, value);
  }
}

/**
 * Check if the bot should be running.
 */
export function isBotEnabled(): boolean {
  const settings = getBotSettings();
  return settings.enabled && !settings.killSwitch;
}

/**
 * Emergency kill switch — immediately halts all trading.
 */
export function engageKillSwitch(): void {
  setBotSetting("killSwitch", true);
  setBotSetting("enabled", false);

  db.insert(botActivity)
    .values({
      ts: Date.now(),
      symbol: "SYSTEM",
      decision: "halt",
      reason: "KILL SWITCH ENGAGED — all trading halted",
    })
    .run();
}

/**
 * Disengage kill switch (requires manual confirmation).
 */
export function disengageKillSwitch(): void {
  setBotSetting("killSwitch", false);

  db.insert(botActivity)
    .values({
      ts: Date.now(),
      symbol: "SYSTEM",
      decision: "skip",
      reason: "Kill switch disengaged — bot may resume if enabled",
    })
    .run();
}

/**
 * Check if daily loss limit has been hit.
 */
export function checkDailyLossLimit(currentEquity: number, startOfDayEquity: number): boolean {
  const settings = getBotSettings();
  const dailyLossPct = ((startOfDayEquity - currentEquity) / startOfDayEquity) * 100;

  if (dailyLossPct >= settings.maxDailyLossPct) {
    db.insert(botActivity)
      .values({
        ts: Date.now(),
        symbol: "SYSTEM",
        decision: "halt",
        reason: `Daily loss limit hit: ${dailyLossPct.toFixed(2)}% (limit: ${settings.maxDailyLossPct}%)`,
      })
      .run();

    return true; // Limit hit
  }

  return false;
}
