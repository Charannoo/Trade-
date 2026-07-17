import { env } from "@/lib/env";
import { parseGoal, createPlan, applyPlan } from "@/lib/command/interpreter";
import { getAccount } from "@/lib/delta/rest";
import { getBotSettings, updateBotSettings, engageKillSwitch, isBotEnabled } from "@/lib/bot/config";
import { db } from "@/lib/db";
import { botActivity, accountSnapshots, ordersLog } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

const TG_API = "https://api.telegram.org/bot";
let lastUpdateId = 0;
let monitorInterval: ReturnType<typeof setInterval> | null = null;
let activeChatId: number | null = null;
let lossLimit: number | null = null;

async function tg(method: string, body?: any) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`${TG_API}${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {}
}

async function sendMessage(chatId: number, text: string) {
  await tg("sendMessage", { chat_id: chatId, text, parse_mode: "Markdown" });
}

function fmt(n: number): string {
  return n.toFixed(2);
}

async function getBalance(): Promise<number> {
  try {
    const acct = await getAccount();
    return parseFloat(acct.cash);
  } catch {
    return 0;
  }
}

async function getPortfolioValue(): Promise<number> {
  try {
    const acct = await getAccount();
    const snaps = db.select().from(accountSnapshots).orderBy(desc(accountSnapshots.ts)).limit(1).all();
    const lastEquity = snaps[0]?.equity ?? parseFloat(acct.cash);
    return parseFloat(acct.cash) + Math.abs(lastEquity - parseFloat(acct.cash));
  } catch {
    return 0;
  }
}

async function handleMessage(chatId: number, text: string) {
  const lower = text.trim().toLowerCase();

  // /start
  if (lower === "/start") {
    const balance = await getBalance();
    await sendMessage(chatId,
      `🤖 *TradeS Trading Bot*\n\n`
      + `Your Delta balance: *$${fmt(balance)}*\n\n`
      + `Send me your trading goal. Examples:\n`
      + `• "I want ₹200 profit from ₹59"\n`
      + `• "Make 20% profit"\n`
      + `• "Double my money"\n`
      + `• "I have $0.69 make it $2"\n\n`
      + `Commands:\n`
      + `/status — check bot status\n`
      + `/stop — emergency stop\n`
      + `/profit — current P&L`
    );
    return;
  }

  // /status
  if (lower === "/status") {
    const balance = await getBalance();
    const settings = getBotSettings();
    const running = isBotEnabled();

    const recentOrders = db.select().from(ordersLog).orderBy(desc(ordersLog.submittedAt)).limit(5).all();
    const wins = recentOrders.filter(o => o.status === "filled" && o.filledAvgPrice && parseFloat(String(o.filledAvgPrice)) > 0).length;

    await sendMessage(chatId,
      `📊 *Bot Status*\n`
      + `Enabled: ${running ? "✅" : "❌"}\n`
      + `Balance: *$${fmt(balance)}*\n`
      + `Risk: ${settings.leverage}x leverage\n`
      + `Stop-loss: ${settings.stopLossPct}% | Target: ${settings.takeProfitPct}%\n`
      + `Recent orders: ${recentOrders.length}\n`
      + `Loss limit: ${lossLimit !== null ? `$${fmt(lossLimit)}` : "Not set"}`
    );
    return;
  }

  // /stop
  if (lower === "/stop") {
    engageKillSwitch();
    if (monitorInterval) {
      clearInterval(monitorInterval);
      monitorInterval = null;
    }
    lossLimit = null;
    await sendMessage(chatId, "🛑 *Bot stopped.* Kill switch engaged. All trading halted.");
    return;
  }

  // /profit
  if (lower === "/profit") {
    const balance = await getBalance();
    const snaps = db.select().from(accountSnapshots).orderBy(desc(accountSnapshots.ts)).limit(2).all();
    if (snaps.length < 2) {
      await sendMessage(chatId, `Current balance: *$${fmt(balance)}*`);
      return;
    }
    const startEq = snaps[snaps.length - 1].equity;
    const currentEq = snaps[0].equity;
    const change = currentEq - startEq;
    const changePct = startEq > 0 ? (change / startEq) * 100 : 0;
    const emoji = change >= 0 ? "🟢" : "🔴";
    await sendMessage(chatId,
      `${emoji} *P&L:* $${fmt(change)} (${changePct >= 0 ? "+" : ""}${fmt(changePct)}%)\n`
      + `Balance: $${fmt(currentEq)}`
    );
    return;
  }

  // Parse as trading goal
  try {
    await sendMessage(chatId, "📝 Parsing your goal...");

    const goal = parseGoal(text);
    const plan = await createPlan(goal);

    let msg = `📋 *Plan*\n`;
    msg += `Balance: *$${fmt(plan.balanceDetected)}*\n`;
    msg += `${plan.summary}\n`;

    if (plan.warnings.length > 0) {
      msg += `\n⚠️ ${plan.warnings.join("\n")}`;
    }

    await sendMessage(chatId, msg);

    // Apply the plan
    const result = await applyPlan(plan);
    if (!result.applied) {
      await sendMessage(chatId, `❌ *Failed:* ${result.message}`);
      return;
    }

    // Set loss limit = 50% of capital
    lossLimit = plan.balanceDetected * 0.5;
    activeChatId = chatId;

    await sendMessage(chatId,
      `✅ *Configured!*\n`
      + `Auto loss-limit: *$${fmt(lossLimit)}* (50% of capital)\n`
      + `Bot will stop if balance drops below this.\n`
      + `Use /status to check, /stop to halt.`
    );

    // Start monitoring
    startMonitoring(chatId, plan.balanceDetected);

  } catch (err: any) {
    await sendMessage(chatId, `❌ *Error:* ${err.message}`);
  }
}

function startMonitoring(chatId: number, startCapital: number) {
  if (monitorInterval) clearInterval(monitorInterval);

  // Check every 60 seconds
  monitorInterval = setInterval(async () => {
    try {
      const settings = getBotSettings();
      if (!settings.enabled || settings.killSwitch) {
        await sendMessage(chatId, "⏹ Bot is no longer active. Monitoring stopped.");
        if (monitorInterval) clearInterval(monitorInterval);
        monitorInterval = null;
        return;
      }

      const balance = await getBalance();
      const lossPct = ((startCapital - balance) / startCapital) * 100;

      // Check loss limit
      if (lossLimit !== null && balance < lossLimit) {
        engageKillSwitch();
        await sendMessage(chatId,
          `🛑 *Loss limit hit!*\n`
          + `Capital dropped from *$${fmt(startCapital)}* to *$${fmt(balance)}*\n`
          + `Loss: ${fmt(lossPct)}%. Bot stopped.`
        );
        if (monitorInterval) clearInterval(monitorInterval);
        monitorInterval = null;
        return;
      }

      // Send periodic update every 5 min
      const now = Date.now();
      const recentActivity = db.select().from(botActivity)
        .where(eq(botActivity.symbol, "SYSTEM"))
        .orderBy(desc(botActivity.ts))
        .limit(1).all();
      const lastOrderTime = recentActivity[0]?.ts ?? 0;
      const elapsed = now - lastOrderTime;

      if (elapsed >= 300_000 && elapsed < 360_000) {
        const orders = db.select().from(ordersLog)
          .orderBy(desc(ordersLog.submittedAt))
          .limit(3).all();
        const orderInfo = orders.map(o => `${o.side} ${o.qty ?? ""} ${o.symbol} → ${o.status}`).join("\n") || "None";
        await sendMessage(chatId,
          `⏱ *Update*\n`
          + `Balance: *$${fmt(balance)}*\n`
          + `P&L: ${fmt(lossPct)}%\n`
          + `Recent:\n${orderInfo}`
        );
      }
    } catch {}
  }, 60_000);
}

export async function pollTelegram() {
  if (!env.TELEGRAM_BOT_TOKEN) return;

  try {
    const url = `${TG_API}${env.TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`;
    const res = await fetch(url);
    if (!res.ok) return;

    const data = await res.json();
    if (!data.result || data.result.length === 0) return;

    for (const update of data.result) {
      lastUpdateId = update.update_id;
      const msg = update.message || update.channel_post;
      if (!msg || !msg.text) continue;
      const chatId = msg.chat.id;
      handleMessage(chatId, msg.text);
    }
  } catch {}
}

export function startTelegramBot() {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.log("[telegram] No TELEGRAM_BOT_TOKEN — skipping");
    return;
  }

  console.log("[telegram] Bot polling started");
  // Poll every 3 seconds
  setInterval(pollTelegram, 3_000);
  // Also poll immediately
  setTimeout(pollTelegram, 500);
}
