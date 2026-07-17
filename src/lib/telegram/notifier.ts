import { env } from "@/lib/env";
import { getBotSettings, setBotSetting } from "@/lib/bot/config";

const TG_API = "https://api.telegram.org/bot";

function getChatId(): number | null {
  try {
    const raw = getBotSettings() as any;
    return raw.telegramChatId ?? null;
  } catch { return null; }
}

export function setChatId(chatId: number) {
  setBotSetting("telegramChatId" as any, chatId);
}

export function clearChatId() {
  setBotSetting("telegramChatId" as any, null);
}

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

export async function notifyTrade(params: {
  symbol: string;
  side: string;
  qty?: string;
  status: string;
  reason?: string;
  balance?: number;
  pnl?: number;
}) {
  const chatId = getChatId();
  if (!chatId) return;

  const emoji = params.side === "buy" ? "🟢" : "🔴";
  let msg = `${emoji} *Trade Alert*\n`;
  msg += `${params.side.toUpperCase()} ${params.qty ?? ""} ${params.symbol} → ${params.status}\n`;
  if (params.reason) msg += `Reason: ${params.reason}\n`;
  if (params.balance !== undefined) {
    msg += `Balance: *$${params.balance.toFixed(2)}*\n`;
  }
  if (params.pnl !== undefined) {
    const pct = params.pnl > 0 ? "+" : "";
    msg += `P&L: ${pct}$${params.pnl.toFixed(2)}\n`;
  }

  await tg("sendMessage", { chat_id: chatId, text: msg, parse_mode: "Markdown" });
}

export async function notifySignal(params: {
  symbol: string;
  action: string;
  confidence: number;
  reason: string;
  indicators?: string;
}) {
  const chatId = getChatId();
  if (!chatId) return;

  const emoji = params.action === "buy" ? "📈" : params.action === "sell" ? "📉" : "⚡";
  let msg = `${emoji} *Signal: ${params.symbol}*\n`;
  msg += `${params.action.toUpperCase()} (conf: ${params.confidence}/10)\n`;
  msg += `Reason: ${params.reason}\n`;
  if (params.indicators) msg += `Indicators: ${params.indicators}`;

  await tg("sendMessage", { chat_id: chatId, text: msg, parse_mode: "Markdown" });
}

export async function notifyUpdate(params: {
  balance: number;
  startCapital: number;
  ordersToday: number;
  positions: number;
}) {
  const chatId = getChatId();
  if (!chatId) return;

  const pnl = params.balance - params.startCapital;
  const pnlPct = params.startCapital > 0 ? (pnl / params.startCapital) * 100 : 0;
  const emoji = pnl >= 0 ? "🟢" : "🔴";

  let msg = `⏱ *Periodic Update*\n\n`;
  msg += `${emoji} *Balance:* $${params.balance.toFixed(2)}\n`;
  msg += `   Start: $${params.startCapital.toFixed(2)}\n`;
  msg += `   P&L: ${pnlPct >= 0 ? "+" : ""}$${pnl.toFixed(2)} (${pnlPct.toFixed(1)}%)\n`;
  msg += `*Orders today:* ${params.ordersToday}\n`;
  msg += `*Positions:* ${params.positions}`;

  await tg("sendMessage", { chat_id: chatId, text: msg, parse_mode: "Markdown" });
}

export async function notifyAlert(title: string, message: string) {
  const chatId = getChatId();
  if (!chatId) return;
  await tg("sendMessage", {
    chat_id: chatId,
    text: `🔔 *${title}*\n\n${message}`,
    parse_mode: "Markdown",
  });
}

export async function notifyGoalReached(params: {
  startCapital: number;
  balance: number;
  targetCapital: number;
}) {
  const chatId = getChatId();
  if (!chatId) return;

  const pnl = params.balance - params.startCapital;
  const pnlPct = params.startCapital > 0 ? (pnl / params.startCapital) * 100 : 0;

  let msg = `🎉 *GOAL ACHIEVED!*\n\n`;
  msg += `Target: *$${params.targetCapital.toFixed(2)}*\n`;
  msg += `Balance: *$${params.balance.toFixed(2)}*\n`;
  msg += `P&L: +$${pnl.toFixed(2)} (+${pnlPct.toFixed(1)}%)\n\n`;
  msg += `Bot will continue monitoring or type /stop to halt.`;

  await tg("sendMessage", { chat_id: chatId, text: msg, parse_mode: "Markdown" });
}
