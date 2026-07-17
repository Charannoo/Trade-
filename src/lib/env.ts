/**
 * env.ts — Single source of truth for all environment config.
 * Validates with Zod, derives Delta Exchange India URLs, exports typed config.
 */
import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

// Load .env.local before validating
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const envSchema = z.object({
  DELTA_API_KEY: z.string().default(""),
  DELTA_API_SECRET: z.string().default(""),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  SEC_EDGAR_USER_AGENT: z.string().default("TradeS personal project"),
  DATABASE_PATH: z.string().default("./data/trades.db"),
  AUTH_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  AUTH_SECRET: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

// Delta Exchange India URLs
const tradingBaseUrl = "https://api.india.delta.exchange";
const dataBaseUrl = "https://api.india.delta.exchange";
const dataStreamUrl = "wss://socket.india.delta.exchange";
const tradeStreamUrl = "wss://socket.india.delta.exchange";

const hasDeltaKeys = Boolean(env.DELTA_API_KEY && env.DELTA_API_SECRET);
const hasTelegramToken = Boolean(env.TELEGRAM_BOT_TOKEN);

/**
 * Export Anthropic API key for child process spawning.
 * The key lives in ~/.claude/.env but child processes may not inherit it.
 */
export function guardAnthropicKey(): void {
  // Read from ~/.claude/.env if not already in process.env
  if (!process.env.ANTHROPIC_API_KEY) {
    try {
      const fs = require("fs");
      const path = require("path");
      const claudeEnvPath = path.join(
        process.env.USERPROFILE || process.env.HOME || "",
        ".claude", ".env"
      );
      if (fs.existsSync(claudeEnvPath)) {
        const content = fs.readFileSync(claudeEnvPath, "utf-8");
        const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
        if (match) {
          process.env.ANTHROPIC_API_KEY = match[1].trim();
          console.log("[env] Loaded ANTHROPIC_API_KEY from ~/.claude/.env");
        }
      }
    } catch {
      // Ignore — key may not exist
    }
  }
}

export {
  env,
  tradingBaseUrl,
  dataBaseUrl,
  dataStreamUrl,
  tradeStreamUrl,
  hasDeltaKeys,
  hasTelegramToken,
};
