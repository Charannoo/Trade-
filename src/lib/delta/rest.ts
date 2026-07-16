/**
 * delta/rest.ts — Delta Exchange India REST client.
 * 
 * Hand-rolled, no SDK. HMAC-SHA256 signed requests.
 * Same interface as the old Alpaca client so the rest of the app works unchanged.
 * 
 * Delta Exchange India API:
 * - Base: https://api.india.delta.exchange
 * - Products: /v2/products (list all)
 * - Orders: /v2/orders (CRUD)
 * - Positions: /v2/positions
 * - Wallet: /v2/wallet/balances
 */
import { env } from "@/lib/env";
import { createHmac } from "crypto";

// Types — same shape as the old Alpaca types so callers don't change

export interface DeltaAccount {
  id: string;
  status: string;
  currency: string;
  cash: string;
  equity: string;
  buying_power: string;
  daytrade_count: number;
  portfolio_value: string;
}

export interface DeltaPosition {
  asset_id: string;
  symbol: string;
  side: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  market_value: string;
}

export interface DeltaOrder {
  id: string;
  client_order_id: string;
  symbol: string;
  side: string;
  type: string;
  qty: string | null;
  notional: string | null;
  limit_price: string | null;
  status: string;
  filled_avg_price: string | null;
  filled_qty: string;
  created_at: string;
  filled_at: string | null;
  order_class: string;
  parent_order_id: string | null;
  legs?: DeltaOrder[];
}

export interface DeltaClock {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
}

export interface DeltaBar {
  T: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw: number;
  n: number;
}

// Product cache — symbol → product_id mapping
let productCache: Map<string, { id: number; symbol: string; description: string; product_type: string; settlement_time?: string }> | null = null;
let productCacheExpiry = 0;

// --- HMAC-SHA256 signing ---

function sign(method: string, path: string, body?: string): {
  signature: string;
  timestamp: string;
} {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const prehash = method + timestamp + path + (body || "");
  const signature = createHmac("sha256", env.DELTA_API_SECRET)
    .update(prehash)
    .digest("hex");
  return { signature, timestamp };
}

// --- REST helpers ---

async function deltaFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? String(options.body) : "";
  const { signature, timestamp } = sign(method, path, body);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "api-key": env.DELTA_API_KEY,
    timestamp,
    signature,
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`https://api.india.delta.exchange${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Delta API ${res.status}: ${errBody}`);
  }

  if (res.status === 204) return {} as T;

  return res.json() as Promise<T>;
}

// --- Product cache ---

interface DeltaProduct {
  id: number;
  symbol: string;
  description: string;
  product_type: string;
  settlement_time?: string;
  underlying_asset?: { symbol: string };
}

async function loadProductCache(): Promise<void> {
  if (productCache && Date.now() < productCacheExpiry) return;

  try {
    const res = await deltaFetch<{ result: DeltaProduct[] }>("/v2/products");
    productCache = new Map();
    for (const p of res.result) {
      productCache.set(p.symbol.toUpperCase(), p);
      // Also map "BTCUSDT" style symbols
      if (p.underlying_asset?.symbol) {
        productCache.set(p.underlying_asset.symbol.toUpperCase(), p);
      }
    }
    productCacheExpiry = Date.now() + 3600_000; // 1 hour cache
  } catch (err: any) {
    console.error("[delta] Failed to load product cache:", err.message);
    if (!productCache) productCache = new Map();
  }
}

async function getProductId(symbol: string): Promise<number | null> {
  await loadProductCache();
  const upper = symbol.toUpperCase();
  const product = productCache?.get(upper);
  if (product) return product.id;

  // Try common mappings for Indian markets
  const mappings: Record<string, string> = {
    "NIFTY": "NIFTY",
    "BANKNIFTY": "BANKNIFTY",
    "SENSEX": "SENSEX",
  };

  const mapped = mappings[upper];
  if (mapped) {
    const mappedProduct = productCache?.get(mapped);
    if (mappedProduct) return mappedProduct.id;
  }

  return null;
}

// --- Public API (same interface as old Alpaca client) ---

export async function getAccount(): Promise<DeltaAccount> {
  try {
    const res = await deltaFetch<{ result: any[] }>("/v2/wallet/balances");
    const wallet = res.result?.[0] ?? {};

    return {
      id: "delta-india",
      status: "active",
      currency: "INR",
      cash: wallet.balance ?? "0",
      equity: wallet.balance ?? "0",
      buying_power: wallet.balance ?? "0",
      daytrade_count: 0,
      portfolio_value: wallet.balance ?? "0",
    };
  } catch {
    // Fallback if wallet endpoint fails
    return {
      id: "delta-india",
      status: "active",
      currency: "INR",
      cash: "0",
      equity: "0",
      buying_power: "0",
      daytrade_count: 0,
      portfolio_value: "0",
    };
  }
}

export async function getPositions(): Promise<DeltaPosition[]> {
  try {
    const res = await deltaFetch<{ result: any[] }>("/v2/positions");
    return (res.result ?? []).map((p) => ({
      asset_id: String(p.product_id ?? ""),
      symbol: p.symbol ?? "",
      side: p.side ?? "long",
      qty: String(Math.abs(p.size ?? 0)),
      avg_entry_price: String(p.entry_price ?? 0),
      current_price: String(p.mark_price ?? p.entry_price ?? 0),
      unrealized_pl: String(p.unrealized_pnl ?? 0),
      unrealized_plpc: String(
        p.entry_price && p.entry_price !== 0
          ? ((p.mark_price - p.entry_price) / p.entry_price) * (p.side === "long" ? 1 : -1)
          : 0
      ),
      market_value: String(
        Math.abs(p.size ?? 0) * (p.mark_price ?? p.entry_price ?? 0)
      ),
    }));
  } catch {
    return [];
  }
}

export async function getPosition(symbol: string): Promise<DeltaPosition> {
  const positions = await getPositions();
  const pos = positions.find((p) => p.symbol.toUpperCase() === symbol.toUpperCase());
  if (!pos) throw new Error(`No position for ${symbol}`);
  return pos;
}

export async function getClock(): Promise<DeltaClock> {
  // Delta India trades 9:30 AM - 3:30 PM IST (approx)
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const hours = istNow.getHours();
  const minutes = istNow.getMinutes();
  const day = istNow.getDay();

  const isWeekday = day >= 1 && day <= 5;
  const isMarketHours = isWeekday && hours >= 9 && hours < 15;
  const isNearOpen = isWeekday && hours === 9 && minutes >= 15;
  const isNearClose = isWeekday && hours === 15 && minutes <= 30;

  return {
    timestamp: now.toISOString(),
    is_open: isMarketHours || (isNearOpen && minutes < 30) || (isNearClose),
    next_open: getNextMarketOpen(istNow).toISOString(),
    next_close: getNextMarketClose(istNow).toISOString(),
  };
}

function getNextMarketOpen(istNow: Date): Date {
  const d = new Date(istNow);
  // If before 9:15 AM, market opens today at 9:15
  if (d.getHours() < 9 || (d.getHours() === 9 && d.getMinutes() < 15)) {
    d.setHours(9, 15, 0, 0);
    return new Date(d.getTime() - istOffset);
  }
  // Otherwise next weekday at 9:15
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  d.setHours(9, 15, 0, 0);
  return new Date(d.getTime() - istOffset);
}

function getNextMarketClose(istNow: Date): Date {
  const d = new Date(istNow);
  if (d.getHours() < 15 || (d.getHours() === 15 && d.getMinutes() < 30)) {
    d.setHours(15, 30, 0, 0);
    return new Date(d.getTime() - istOffset);
  }
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  d.setHours(15, 30, 0, 0);
  return new Date(d.getTime() - istOffset);
}

const istOffset = 5.5 * 60 * 60 * 1000;

export async function getOrder(orderId: string): Promise<DeltaOrder> {
  const res = await deltaFetch<{ result: any }>(`/v2/orders/${orderId}`);
  return mapDeltaOrder(res.result);
}

export async function getOrders(params?: {
  status?: string;
  limit?: number;
}): Promise<DeltaOrder[]> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("page_size", String(params.limit));
  const query = qs.toString() ? `?${qs}` : "";
  const res = await deltaFetch<{ result: any[] }>(`/v2/orders${query}`);
  return (res.result ?? []).map(mapDeltaOrder);
}

export async function createOrder(params: {
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  qty?: string;
  notional?: string;
  limit_price?: string;
  stop_price?: string;
  time_in_force?: string;
  order_class?: "bracket" | "oto" | "simple";
  take_profit?: { limit_price: string };
  stop_loss?: { stop_price: string };
}): Promise<DeltaOrder> {
  const productId = await getProductId(params.symbol);
  if (!productId) {
    throw new Error(`Unknown symbol: ${params.symbol}. Load products first.`);
  }

  // Map Alpaca-style order type to Delta order type
  const orderType = params.type === "stop_limit"
    ? "limit_order"
    : params.type === "stop"
    ? "market_order" // Delta doesn't have stop orders directly, use limit
    : params.type === "limit"
    ? "limit_order"
    : "market_order";

  const size = params.qty ? Math.abs(parseInt(params.qty)) : 1;

  const body: Record<string, any> = {
    product_id: productId,
    size: params.side === "sell" ? -size : size,
    order_type: orderType,
  };

  if (params.limit_price) {
    body.limit_price = params.limit_price;
  }

  // Delta doesn't have bracket orders natively — we'll handle stop-loss/take-profit
  // in the bot runner by placing separate orders after fill
  const res = await deltaFetch<{ result: any }>("/v2/orders", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return mapDeltaOrder(res.result);
}

export async function cancelOrder(orderId: string): Promise<void> {
  await deltaFetch(`/v2/orders/${orderId}`, { method: "DELETE" });
}

export async function cancelAllOrders(): Promise<void> {
  const orders = await getOrders({ status: "open" });
  for (const order of orders) {
    try {
      await cancelOrder(order.id);
    } catch {
      // Ignore individual cancel failures
    }
  }
}

// --- Data API (bars, snapshots) ---

export async function getBars(
  symbol: string,
  timeframe: string = "1d",
  limit?: number,
  start?: string,
  end?: string
): Promise<{ bars: Record<string, DeltaBar[]> }> {
  const productId = await getProductId(symbol);
  if (!productId) {
    return { bars: { [symbol]: [] } };
  }

  const qs = new URLSearchParams({
    resolution: timeframe === "1Day" || timeframe === "1d" ? "1d" : timeframe,
    product_id: String(productId),
  });
  if (limit) qs.set("limit", String(limit));
  if (start) qs.set("start", start);
  if (end) qs.set("end", end);

  try {
    const res = await deltaFetch<{ result: any }>(`/v2/history/candles?${qs}`);
    const bars = (res.result ?? []).map((b: any) => ({
      T: new Date(b.time * 1000).toISOString(),
      o: b.open,
      h: b.high,
      l: b.low,
      c: b.close,
      v: b.volume,
      vw: b.close, // Delta doesn't provide VWAP in candles
      n: 0,
    }));
    return { bars: { [symbol]: bars } };
  } catch {
    return { bars: { [symbol]: [] } };
  }
}

export async function getSnapshot(
  symbol: string
): Promise<Record<string, unknown>> {
  const productId = await getProductId(symbol);
  if (!productId) return {};

  try {
    const res = await deltaFetch<any>(`/v2/l2orderbook/${productId}`);
    return res.result ?? {};
  } catch {
    return {};
  }
}

// --- Utility ---

function mapDeltaOrder(raw: any): DeltaOrder {
  return {
    id: String(raw.id ?? ""),
    client_order_id: String(raw.client_order_id ?? raw.id ?? ""),
    symbol: raw.symbol ?? "",
    side: (raw.size ?? 0) >= 0 ? "buy" : "sell",
    type: raw.order_type ?? "market",
    qty: raw.size ? String(Math.abs(raw.size)) : null,
    notional: null,
    limit_price: raw.limit_price ? String(raw.limit_price) : null,
    status: mapDeltaOrderStatus(raw.state),
    filled_avg_price: raw.average_fill_price ? String(raw.average_fill_price) : null,
    filled_qty: raw.filled_size ? String(Math.abs(raw.filled_size)) : "0",
    created_at: raw.created_at ?? new Date().toISOString(),
    filled_at: raw.updated_at ?? null,
    order_class: "simple",
    parent_order_id: null,
  };
}

function mapDeltaOrderStatus(state: string): string {
  const map: Record<string, string> = {
    open: "new",
    pending: "pending_new",
    filled: "filled",
    canceled: "canceled",
    closed: "filled",
    expired: "expired",
  };
  return map[state] ?? state ?? "unknown";
}

/** Map Delta notation (NIFTY) to app notation (NIFTY) */
export function deltaToAppSymbol(symbol: string): string {
  return symbol.replace(/\./g, "-").toUpperCase();
}

/** Map app notation (NIFTY) to Delta notation (NIFTY) */
export function appToDeltaSymbol(symbol: string): string {
  return symbol.replace(/-/g, ".").toUpperCase();
}

export { productCache, loadProductCache, getProductId };
