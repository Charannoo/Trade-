/**
 * research/packet.ts — Build the research packet for the analyst.
 * Gathers bars, indicators, fundamentals, news, SEC filings, social sentiment,
 * market context, and renders a plain-English markdown packet.
 */
import { getDailyBars } from "@/lib/yahoo/poller";
import { computeSnapshot } from "./indicators";
import { getMarketContext } from "./market";
import type { MarketContext } from "./market";

export interface QuantSnapshot {
  indicators: Record<string, any>;
  patterns: string[];
}

export interface ResearchPacket {
  symbol: string;
  generatedAt: number;
  markdown: string;
  quantSnapshot: QuantSnapshot;
}

/**
 * Build a complete research packet for a symbol.
 * This is what the analyst LLM reads.
 */
export async function buildResearchPacket(
  symbol: string,
  fundamentals?: Record<string, any>,
  news?: { title: string; url: string; summary?: string }[],
  secFilings?: { type: string; title: string; url: string; date: string }[],
  insiderActivity?: { insider: string; transaction: string; shares: number; price: number; date: string }[],
  socialSentiment?: { source: string; sentiment: string; volume?: number }[],
  congressionalTrades?: { member: string; asset: string; transaction: string; amount: string; date: string }[]
): Promise<ResearchPacket> {
  // 1. Hard dependency: daily bars
  const bars = await getDailyBars(symbol, 260);
  if (bars.length < 20) {
    throw new Error(`Insufficient bar data for ${symbol} (${bars.length} bars, need 20+)`);
  }

  // 2. Compute indicators + patterns
  const quantSnapshot = computeSnapshot(bars);
  const { indicators: ind, patterns } = quantSnapshot;

  // 3. Get market context
  let marketCtx: MarketContext;
  try {
    marketCtx = await getMarketContext();
  } catch {
    marketCtx = {
      sp500Trend: "flat",
      vix: null,
      regime: "chop",
      description: "Market context unavailable.",
    };
  }

  // 4. Build the last bar data
  const lastBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2];
  const dayChange = lastBar.close - prevBar.close;
  const dayChangePct = (dayChange / prevBar.close) * 100;

  // 5. Render markdown packet
  const md: string[] = [];

  md.push(`# Research Packet: ${symbol}`);
  md.push(`Generated: ${new Date().toISOString()}`);
  md.push("");

  // Price section
  md.push("## Current Price");
  md.push(`- Last close: $${lastBar.close.toFixed(2)}`);
  md.push(`- Day change: ${dayChange >= 0 ? "+" : ""}${dayChange.toFixed(2)} (${dayChangePct >= 0 ? "+" : ""}${dayChangePct.toFixed(2)}%)`);
  md.push(`- Volume: ${lastBar.volume.toLocaleString()}`);
  md.push("");

  // Market regime
  md.push("## Market Regime");
  md.push(marketCtx.description);
  md.push("");

  // Quantitative signals
  md.push("## Quantitative Signals");

  if (ind.sma20 !== null) md.push(`- Price vs SMA20: $${lastBar.close.toFixed(2)} ${lastBar.close > ind.sma20 ? "ABOVE" : "BELOW"} $${ind.sma20.toFixed(2)}`);
  if (ind.sma50 !== null) md.push(`- Price vs SMA50: $${lastBar.close.toFixed(2)} ${lastBar.close > ind.sma50 ? "ABOVE" : "BELOW"} $${ind.sma50.toFixed(2)}`);
  if (ind.sma200 !== null) md.push(`- Price vs SMA200: $${lastBar.close.toFixed(2)} ${lastBar.close > ind.sma200 ? "ABOVE" : "BELOW"} $${ind.sma200.toFixed(2)}`);
  if (ind.rsi !== null) md.push(`- RSI (14): ${ind.rsi.toFixed(1)} ${ind.rsi > 70 ? "(overbought)" : ind.rsi < 30 ? "(oversold)" : "(neutral)"}`);
  if (ind.macdHistogram !== null) md.push(`- MACD Histogram: ${ind.macdHistogram.toFixed(4)} ${ind.macdHistogram > 0 ? "(bullish)" : "(bearish)"}`);
  if (ind.atrPct !== null) md.push(`- ATR%: ${ind.atrPct.toFixed(2)}% (volatility)`);
  if (ind.bbUpper !== null && ind.bbLower !== null) {
    const bbPosition = ((lastBar.close - ind.bbLower) / (ind.bbUpper - ind.bbLower)) * 100;
    md.push(`- Bollinger Band position: ${bbPosition.toFixed(0)}% (0=lower, 100=upper)`);
  }
  if (ind.obvTrend) md.push(`- OBV Trend: ${ind.obvTrend}`);
  if (ind.high52w !== null) md.push(`- 52-week high: $${ind.high52w.toFixed(2)}`);
  if (ind.low52w !== null) md.push(`- 52-week low: $${ind.low52w.toFixed(2)}`);
  if (ind.high52w && ind.low52w) {
    const position52 = ((lastBar.close - ind.low52w) / (ind.high52w - ind.low52w)) * 100;
    md.push(`- 52-week range position: ${position52.toFixed(0)}%`);
  }
  md.push("");

  // Detected patterns
  if (patterns.length > 0) {
    md.push("## Detected Patterns");
    for (const p of patterns) {
      md.push(`- ${p.replace(/-/g, " ")}`);
    }
    md.push("");
  }

  // Fundamentals (if available)
  if (fundamentals) {
    md.push("## Fundamentals");
    if (fundamentals.marketCap) md.push(`- Market Cap: $${formatLargeNumber(fundamentals.marketCap)}`);
    if (fundamentals.pe) md.push(`- P/E Ratio: ${fundamentals.pe}`);
    if (fundamentals.forwardPE) md.push(`- Forward P/E: ${fundamentals.forwardPE}`);
    if (fundamentals.eps) md.push(`- EPS: $${fundamentals.eps}`);
    if (fundamentals.dividendYield) md.push(`- Dividend Yield: ${fundamentals.dividendYield}%`);
    if (fundamentals.revenueGrowth) md.push(`- Revenue Growth: ${fundamentals.revenueGrowth}%`);
    if (fundamentals.profitMargin) md.push(`- Profit Margin: ${fundamentals.profitMargin}%`);
    if (fundamentals.debtToEquity) md.push(`- Debt/Equity: ${fundamentals.debtToEquity}`);
    md.push("");
  }

  // News (if available)
  if (news && news.length > 0) {
    md.push("## Recent News");
    for (const n of news.slice(0, 10)) {
      md.push(`- **${n.title}**`);
      if (n.summary) md.push(`  ${n.summary.slice(0, 200)}`);
      md.push(`  [Source](${n.url})`);
    }
    md.push("");
  }

  // SEC filings
  if (secFilings && secFilings.length > 0) {
    md.push("## Recent SEC Filings");
    for (const f of secFilings.slice(0, 5)) {
      md.push(`- ${f.type}: ${f.title} (${f.date}) [Link](${f.url})`);
    }
    md.push("");
  }

  // Insider activity
  if (insiderActivity && insiderActivity.length > 0) {
    md.push("## Insider Activity");
    for (const i of insiderActivity.slice(0, 10)) {
      md.push(`- ${i.insider}: ${i.transaction} ${i.shares} shares @ $${i.price.toFixed(2)} (${i.date})`);
    }
    md.push("");
  }

  // Social sentiment
  if (socialSentiment && socialSentiment.length > 0) {
    md.push("## Social Sentiment");
    for (const s of socialSentiment) {
      md.push(`- ${s.source}: ${s.sentiment}${s.volume ? ` (volume: ${s.volume})` : ""}`);
    }
    md.push("");
  }

  // Congressional trades
  if (congressionalTrades && congressionalTrades.length > 0) {
    md.push("## Congressional Trades");
    for (const t of congressionalTrades.slice(0, 5)) {
      md.push(`- ${t.member}: ${t.transaction} ${t.asset} (${t.amount}, ${t.date})`);
    }
    md.push("");
  }

  // Data gaps
  const gaps: string[] = [];
  if (!fundamentals) gaps.push("fundamentals");
  if (!news || news.length === 0) gaps.push("news");
  if (!secFilings || secFilings.length === 0) gaps.push("SEC filings");
  if (!insiderActivity || insiderActivity.length === 0) gaps.push("insider activity");
  if (!socialSentiment || socialSentiment.length === 0) gaps.push("social sentiment");
  if (gaps.length > 0) {
    md.push("## Data Gaps");
    md.push(`Missing: ${gaps.join(", ")}. Analyst should research these gaps using WebSearch/WebFetch.`);
    md.push("");
  }

  md.push("---");
  md.push("This is decision-support research, NOT financial advice.");

  return {
    symbol,
    generatedAt: Date.now(),
    markdown: md.join("\n"),
    quantSnapshot,
  };
}

function formatLargeNumber(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return n.toLocaleString();
}
