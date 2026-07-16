/**
 * delta/symbols.ts — Delta Exchange ↔ Yahoo Finance symbol mapping.
 *
 * Delta Exchange India uses symbols like BTCUSD, ETHUSD, SOLUSD.
 * Yahoo Finance uses BTC-USD, ETH-USD, etc.
 */

const DELTA_TO_YAHOO: Record<string, string> = {
  BTCUSD: "BTC-USD",
  ETHUSD: "ETH-USD",
  SOLUSD: "SOL-USD",
  ADAUSD: "ADA-USD",
  DOGEUSD: "DOGE-USD",
  XRPUSD: "XRP-USD",
  DOTUSD: "DOT-USD",
  AVAXUSD: "AVAX-USD",
  LINKUSD: "LINK-USD",
  BNBUSD: "BNB-USD",
  LTCUSD: "LTC-USD",
  TRXUSD: "TRX-USD",
  MATICUSD: "MATIC-USD",
  FILUSD: "FIL-USD",
  NEARUSD: "NEAR-USD",
  APTUSD: "APT-USD",
  SUIUSD: "SUI-USD",
  ARBUSD: "ARB-USD",
  OPUSD: "OP-USD",
  // Legacy format (backward compat)
  BTCUSDT: "BTC-USD",
  ETHUSDT: "ETH-USD",
  SOLUSDT: "SOL-USD",
  ADAUSDT: "ADA-USD",
  DOGEUSDT: "DOGE-USD",
  XRPUSDT: "XRP-USD",
  DOTUSDT: "DOT-USD",
  AVAXUSDT: "AVAX-USD",
  LINKUSDT: "LINK-USD",
};

const YAHOO_TO_DELTA: Record<string, string> = Object.fromEntries(
  Object.entries(DELTA_TO_YAHOO).map(([k, v]) => [v, k])
);

export function deltaToYahoo(symbol: string): string {
  return DELTA_TO_YAHOO[symbol.toUpperCase()] ?? symbol;
}

export function yahooToDelta(symbol: string): string {
  return YAHOO_TO_DELTA[symbol] ?? symbol;
}

export function isDeltaSymbol(symbol: string): boolean {
  return symbol.toUpperCase() in DELTA_TO_YAHOO;
}
