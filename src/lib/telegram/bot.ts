import { env } from "@/lib/env";
import { parseGoal, createPlan, applyPlan, type TradingGoal } from "@/lib/command/interpreter";
import { getAccount } from "@/lib/delta/rest";
import { getBotSettings, updateBotSettings, engageKillSwitch, isBotEnabled } from "@/lib/bot/config";
import { db } from "@/lib/db";
import { botActivity, accountSnapshots, ordersLog, latestPrices } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { setChatId, clearChatId } from "./notifier";

const TG_API = "https://api.telegram.org/bot";
let lastUpdateId = 0;
const sessions = new Map<number, ChatSession>();

interface ChatSession {
  chatId: number;
  step: "idle" | "awaiting_goal" | "awaiting_capital" | "awaiting_risk" | "awaiting_confirm" | "trading" | "stopped";
  goal?: TradingGoal;
  plan?: any;
  startCapital?: number;
  lossLimit?: number;
  monitorInterval?: ReturnType<typeof setInterval>;
  lastTradeAlert?: number;
}

async function tg(method: string, body?: any): Promise<any> {
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  try {
    const res = await fetch(`${TG_API}${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[telegram] API ${res.status}: ${err.slice(0, 200)}`);
    }
    return res.json();
  } catch (err: any) {
    console.error(`[telegram] Network error: ${err.message}`);
    return null;
  }
}

function sendMsg(chatId: number, text: string, extra?: any) {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "Markdown", ...extra });
}

function editMsg(chatId: number, msgId: number, text: string) {
  return tg("editMessageText", { chat_id: chatId, message_id: msgId, text, parse_mode: "Markdown" });
}

function sendMenu(chatId: number, text: string, buttons: string[][]) {
  const keyboard = buttons.map(row => row.map(b => ({ text: b })));
  return sendMsg(chatId, text, {
    reply_markup: { keyboard, resize_keyboard: true, one_time_keyboard: false },
  });
}

function removeMenu(chatId: number, text: string) {
  return sendMsg(chatId, text, { reply_markup: { remove_keyboard: true } });
}

function fmt(n: number): string { return n.toFixed(2); }

function pct(n: number): string { return (n >= 0 ? "+" : "") + n.toFixed(1) + "%"; }

async function getSession(chatId: number): Promise<ChatSession> {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { chatId, step: "idle" });
  }
  return sessions.get(chatId)!;
}

async function getBalance(): Promise<number> {
  try { const a = await getAccount(); return parseFloat(a.cash); } catch { return 0; }
}

async function getRecentOrders(limit = 5) {
  return db.select().from(ordersLog).orderBy(desc(ordersLog.submittedAt)).limit(limit).all();
}

async function getBotActivity(limit = 10) {
  return db.select().from(botActivity).orderBy(desc(botActivity.id)).limit(limit).all();
}

async function getPrices() {
  return db.select().from(latestPrices).all();
}

// ===== COMMAND HANDLERS =====

async function cmdStart(chatId: number) {
  setChatId(chatId);
  const balance = await getBalance();
  const session = await getSession(chatId);
  session.step = "idle";

  await sendMenu(chatId,
    `🤖 *TradeS Trading Bot* — Delta Exchange India\n\n`
    + `Balance: *$${fmt(balance)} USD*\n\n`
    + `*How it works:*\n`
    + `1. Tell me your goal (profit target)\n`
    + `2. I configure the bot automatically\n`
    + `3. Bot trades 24/7 until target or stop-loss\n`
    + `4. I'll notify you on every trade\n\n`
    + `*Examples:*\n`
    + `• "Make ₹200 profit from ₹59"\n`
    + `• "Turn $0.69 into $2"\n`
    + `• "20% profit"\n`
    + `• "Double my money"\n\n`
    + `Use the buttons below or just type your goal.`,
    [["🎯 Set Profit Goal"], ["📊 Status", "💰 P&L"], ["🛑 Stop Bot"]]
  );
  session.step = "awaiting_goal";
  saveSession(chatId, session);
}

async function cmdGoal(chatId: number, text: string) {
  const session = await getSession(chatId);
  session.step = "awaiting_goal";

  // If they typed a full goal, parse it directly
  if (text !== "🎯 Set Profit Goal") {
    await processGoal(chatId, text);
    return;
  }

  // Ask for the goal
  await sendMsg(chatId,
    "🎯 *What's your trading goal?*\n\n"
    + "Examples:\n"
    + `• "I want ₹200 profit from ₹59"\n`
    + `• "Make 20% on my balance"\n`
    + `• "Turn $0.69 into $2"\n`
    + `• "Double my money"\n\n`
    + `Or type /cancel to go back.`
  );
}

async function processGoal(chatId: number, text: string) {
  const session = await getSession(chatId);

  await sendMsg(chatId, "⏳ *Analysing your goal...*");

  try {
    const goal = parseGoal(text);
    const balance = await getBalance();
    const plan = await createPlan(goal);

    session.goal = goal;
    session.plan = plan;
    session.startCapital = plan.balanceDetected;

    // Build plan message
    let msg = `📋 *Trading Plan*\n\n`;
    msg += `*Target:* $${fmt(plan.balanceDetected)} → $${fmt(plan.balanceDetected * (1 + (parseGoal(text).targetPct ?? 20) / 100))}\n`;
    msg += `*Balance:* $${fmt(balance)}\n`;
    msg += `*Risk:* ${plan.settings.leverage}x leverage, ${plan.settings.stopLossPct}% stop, ${plan.settings.takeProfitPct}% target\n`;
    msg += `*Max positions:* ${plan.settings.maxOpenPositions}\n`;
    msg += `*Auto stop-loss:* $${fmt(plan.balanceDetected * 0.5)} (50% loss limit)\n\n`;

    if (plan.warnings.length > 0) {
      msg += `⚠️ *Warnings:*\n`;
      for (const w of plan.warnings) msg += `• ${w}\n`;
      msg += `\n`;
    }

    msg += `*Rules:* ${plan.rules.length} active trading rules\n`;
    for (const r of plan.rules) {
      msg += `• ${r.name}\n`;
    }

    await sendMsg(chatId, msg);

    // Apply and start
    const result = await applyPlan(plan);
    if (!result.applied) {
      await sendMsg(chatId, `❌ *Failed:* ${result.message}`);
      return;
    }

    session.lossLimit = plan.balanceDetected * 0.5;
    session.step = "trading";

    await sendMsg(chatId,
      `✅ *Bot activated!*\n\n`
      + `Market analysis: ${plan.rules.length} strategies deployed\n`
      + `Trading ${plan.settings.maxOpenPositions} pairs simultaneously\n`
      + `50x leverage with ${plan.settings.stopLossPct}% hard stop\n\n`
      + `I'll notify you on each trade. Use buttons to check status.`,
      { reply_markup: { keyboard: [["📊 Status", "💰 P&L"], ["📈 Recent Trades"], ["🛑 Stop Bot"]], resize_keyboard: true } }
    );

    startMonitor(chatId);

  } catch (err: any) {
    await sendMsg(chatId, `❌ *Error:* ${err.message}\n\nTry again or use /start`);
  }
}

async function cmdStatus(chatId: number) {
  const balance = await getBalance();
  const settings = getBotSettings();
  const running = isBotEnabled();
  const orders = await getRecentOrders(5);
  const prices = await getPrices();
  const activity = await getBotActivity(3);
  const session = await getSession(chatId);

  let msg = `📊 *Bot Status*\n\n`;
  msg += `*Active:* ${running ? "✅ Yes" : "❌ Stopped"}\n`;
  msg += `*Balance:* $${fmt(balance)}\n`;
  msg += `*Leverage:* ${settings.leverage}x\n`;
  msg += `*Stop-loss:* ${settings.stopLossPct}% | *Target:* ${settings.takeProfitPct}%\n`;
  msg += `*Positions:* ${settings.maxOpenPositions} max\n`;
  msg += `*Loss limit:* ${session.lossLimit !== undefined ? "$" + fmt(session.lossLimit!) : "Not set"}\n\n`;

  if (session.startCapital && session.startCapital > 0) {
    const pnl = balance - session.startCapital;
    const pnlPct = (pnl / session.startCapital) * 100;
    const emoji = pnl >= 0 ? "🟢" : "🔴";
    msg += `${emoji} *P&L since start:* $${fmt(pnl)} (${pct(pnlPct)})\n`;
    msg += `   Start: $${fmt(session.startCapital)} → Now: $${fmt(balance)}\n\n`;
  }

  if (prices.length > 0) {
    msg += `*Markets:*\n`;
    for (const p of prices.slice(0, 5)) {
      msg += `• ${p.symbol}: $${fmt(p.price)}\n`;
    }
    msg += `\n`;
  }

  if (orders.length > 0) {
    msg += `*Recent orders:*\n`;
    for (const o of orders.slice(0, 3)) {
      const ts = new Date(o.submittedAt).toLocaleTimeString();
      msg += `• ${ts} ${o.side.toUpperCase()} ${o.qty ?? ""} ${o.symbol} → ${o.status}\n`;
    }
    msg += `\n`;
  }

  if (activity.length > 0) {
    const last = activity[0];
    const ts = new Date(last.ts).toLocaleTimeString();
    if (last.decision === "buy" || last.decision === "sell") {
      msg += `🔄 *Last signal:* ${ts} — ${last.decision.toUpperCase()} ${last.symbol || ""}\n`;
    }
  }

  await sendMsg(chatId, msg);
}

async function cmdPnL(chatId: number) {
  const balance = await getBalance();
  const session = await getSession(chatId);
  const orders = await getRecentOrders(20);

  let msg = `💰 *Profit & Loss*\n\n`;

  if (session.startCapital && session.startCapital > 0) {
    const pnl = balance - session.startCapital;
    const pnlPct = (pnl / session.startCapital) * 100;
    const emoji = pnl >= 0 ? "🟢" : "🔴";
    msg += `${emoji} *Overall:* $${fmt(pnl)} (${pct(pnlPct)})\n`;
    msg += `   Start: $${fmt(session.startCapital)} → Now: $${fmt(balance)}\n\n`;
  }

  const filled = orders.filter(o => o.status === "filled");
  if (filled.length > 0) {
    const buys = filled.filter(o => o.side === "buy");
    const sells = filled.filter(o => o.side === "sell");
    msg += `*Trades:* ${filled.length} filled (${buys.length} buys, ${sells.length} sells)\n`;
  }

  if (orders.length === 0) {
    msg += `No trades yet. Bot is waiting for signals.\n`;
  }

  const prices = await getPrices();
  if (prices.length > 0) {
    msg += `\n*Watchlist:*\n`;
    for (const p of prices) {
      msg += `• ${p.symbol}: *$${fmt(p.price)}*\n`;
    }
  }

  await sendMsg(chatId, msg);
}

async function cmdRecentTrades(chatId: number) {
  const orders = await getRecentOrders(10);

  if (orders.length === 0) {
    await sendMsg(chatId, "📈 *No trades yet.* Bot is scanning for signals every 5 minutes.");
    return;
  }

  let msg = `📈 *Recent Trades*\n\n`;
  for (const o of orders) {
    const ts = new Date(o.submittedAt).toLocaleString();
    const emoji = o.side === "buy" ? "🟢" : "🔴";
    msg += `${emoji} *${o.side.toUpperCase()}* ${o.symbol}\n`;
    msg += `   Qty: ${o.qty ?? "—"} | Price: $${o.notional ? fmt(o.notional) : "—"}\n`;
    msg += `   Status: ${o.status} | ${ts}\n\n`;
  }

  await sendMsg(chatId, msg);
}

async function cmdStop(chatId: number) {
  engageKillSwitch();
  const session = await getSession(chatId);
  if (session.monitorInterval) {
    clearInterval(session.monitorInterval);
    session.monitorInterval = undefined;
  }
  session.step = "stopped";

  await sendMsg(chatId,
    "🛑 *Bot stopped.*\n\n"
    + "Kill switch engaged — all trading halted.\n"
    + "Use /start to resume.",
    { reply_markup: { remove_keyboard: true } }
  );
}

async function cmdCancel(chatId: number) {
  const session = await getSession(chatId);
  session.step = "idle";
  await sendMsg(chatId, "Cancelled. Use /start for main menu.");
}

function saveSession(chatId: number, session: ChatSession) {
  sessions.set(chatId, session);
}

function startMonitor(chatId: number) {
  const session = sessions.get(chatId);
  if (!session || !session.startCapital) return;
  if (session.monitorInterval) clearInterval(session.monitorInterval);

  session.monitorInterval = setInterval(async () => {
    try {
      const settings = getBotSettings();
      if (!settings.enabled || settings.killSwitch) {
        if (session.monitorInterval) clearInterval(session.monitorInterval);
        session.monitorInterval = undefined;
        session.step = "stopped";
        return;
      }

      const balance = await getBalance();
      const lossPct = session.startCapital! > 0
        ? ((session.startCapital! - balance) / session.startCapital!) * 100
        : 0;

      // Stop if loss limit hit
      if (session.lossLimit && balance < session.lossLimit) {
        engageKillSwitch();
        if (session.monitorInterval) clearInterval(session.monitorInterval);
        session.monitorInterval = undefined;
        session.step = "stopped";
        await sendMsg(chatId,
          `🛑 *Loss limit triggered!*\n\n`
          + `Capital dropped from *$${fmt(session.startCapital!)}* to *$${fmt(balance)}*\n`
          + `Loss: ${pct(lossPct)} — auto-stop engaged.`
        );
        return;
      }

      // Check for new orders in last 60s and alert
      const recentOrders = await getRecentOrders(3);
      const now = Date.now();
      for (const o of recentOrders) {
        const elapsed = now - o.submittedAt;
        if (elapsed < 120_000 && elapsed > 5_000 && (!session.lastTradeAlert || o.submittedAt > session.lastTradeAlert)) {
          session.lastTradeAlert = o.submittedAt;
          const emoji = o.side === "buy" ? "🟢" : "🔴";
          let alert = `${emoji} *Trade executed!*\n`;
          alert += `${o.side.toUpperCase()} ${o.qty ?? ""} ${o.symbol} → ${o.status}\n`;
          if (o.notional) alert += `Value: $${fmt(o.notional)}\n`;
          alert += `Balance: $${fmt(balance)} (${pct(-lossPct)} from start)`;
          await sendMsg(chatId, alert);
          break;
        }
      }
    } catch {}
  }, 30_000);
}

// ===== MESSAGE ROUTER =====

async function handleMessage(chatId: number, text: string) {
  const lower = text.trim();
  const session = await getSession(chatId);

  // Global commands that work from any state
  if (lower === "/start") return cmdStart(chatId);
  if (lower === "/cancel") return cmdCancel(chatId);
  if (lower === "/stop" || lower === "🛑 Stop Bot") return cmdStop(chatId);
  if (lower === "/status" || lower === "📊 Status") return cmdStatus(chatId);
  if (lower === "/profit" || lower === "💰 P&L" || lower === "/pnl") return cmdPnL(chatId);
  if (lower === "/trades" || lower === "📈 Recent Trades") return cmdRecentTrades(chatId);

  // Route based on session state
  if (session.step === "awaiting_goal" || session.step === "idle") {
    if (lower === "🎯 Set Profit Goal") {
      session.step = "awaiting_goal";
      saveSession(chatId, session);
      await sendMsg(chatId,
        "🎯 *What's your trading goal?*\n\n"
        + "Examples:\n"
        + `• "I want ₹200 profit from ₹59"\n`
        + `• "Make 20% on my balance"\n`
        + `• "Turn $0.69 into $2"\n`
        + `• "Double my money"\n`
        + `• "Aggressive trading"\n\n`
        + `Or type /cancel to go back.`
      );
      return;
    }
    await processGoal(chatId, text);
    return;
  }

  if (session.step === "trading") {
    // If they type a new goal while trading, process it
    await processGoal(chatId, text);
    return;
  }

  // Default: treat as goal
  await processGoal(chatId, text);
}

// ===== POLLING =====

export async function pollTelegram() {
  if (!env.TELEGRAM_BOT_TOKEN) return;

  try {
    const res = await fetch(
      `${TG_API}${env.TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`
    );
    if (!res.ok) return;

    const data = await res.json();
    if (!data.result?.length) return;

    for (const update of data.result) {
      lastUpdateId = update.update_id;
      const msg = update.message || update.channel_post || update.callback_query?.message;
      if (!msg) continue;

      const chatId = msg.chat?.id || msg.from?.id;
      if (!chatId) continue;

      // Handle callback queries (button presses)
      if (update.callback_query) {
        const data = update.callback_query.data;
        await handleMessage(chatId, data);
        continue;
      }

      if (!msg.text) continue;
      await handleMessage(chatId, msg.text);
    }
  } catch {}
}

export function startTelegramBot() {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.log("[telegram] No TELEGRAM_BOT_TOKEN — skipping");
    return;
  }
  console.log("[telegram] Bot polling started");
  setInterval(pollTelegram, 2_000);
  setTimeout(pollTelegram, 500);
}
