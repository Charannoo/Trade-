/**
 * paper/service.ts — Paper trading service layer.
 * 
 * Wraps Delta Exchange India REST calls, logs orders to orders_log,
 * captures account snapshots, tracks equity curve.
 */
import { db } from "@/lib/db";
import { ordersLog, accountSnapshots, botActivity } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  getAccount,
  getPositions,
  getPosition,
  createOrder,
  cancelOrder,
  cancelAllOrders,
  getOrders,
  appToDeltaSymbol,
  deltaToAppSymbol,
  type DeltaAccount,
  type DeltaPosition,
  type DeltaOrder,
} from "@/lib/delta/rest";

// --- Order placement with logging ---

export interface PlaceOrderParams {
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  qty?: string;
  notional?: string;
  limitPrice?: string;
  stopPrice?: string;
  takeProfitPrice?: string;
  stopLossPrice?: string;
  source?: string;
  timeInForce?: string;
}

export interface PlaceOrderResult {
  orderId: string;
  status: string;
  symbol: string;
  side: string;
  qty: string | null;
  notional: string | null;
  limitPrice: string | null;
}

/**
 * Place an order via Alpaca and log it to orders_log.
 */
export async function placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
  const alpacaSymbol = appToDeltaSymbol(params.symbol.toUpperCase());
  const now = Date.now();

  // Build Alpaca order params
  const orderParams: Parameters<typeof createOrder>[0] = {
    symbol: alpacaSymbol,
    side: params.side,
    type: params.type,
    time_in_force: params.timeInForce ?? "day",
  };

  if (params.qty) orderParams.qty = params.qty;
  if (params.notional) orderParams.notional = params.notional;
  if (params.limitPrice) orderParams.limit_price = params.limitPrice;
  if (params.stopPrice) orderParams.stop_price = params.stopPrice;

  // Bracket order support
  if (params.takeProfitPrice || params.stopLossPrice) {
    orderParams.order_class = "bracket";
    if (params.takeProfitPrice) {
      orderParams.take_profit = { limit_price: params.takeProfitPrice };
    }
    if (params.stopLossPrice) {
      orderParams.stop_loss = { stop_price: params.stopLossPrice };
    }
  }

  // Place order via Alpaca
  const alpacaOrder = await createOrder(orderParams);

  // Log to orders_log
  db.insert(ordersLog)
    .values({
      alpacaOrderId: alpacaOrder.id,
      symbol: params.symbol.toUpperCase(),
      side: params.side,
      type: params.type,
      qty: params.qty ? parseFloat(params.qty) : null,
      notional: params.notional ? parseFloat(params.notional) : null,
      limitPrice: params.limitPrice ? parseFloat(params.limitPrice) : null,
      status: alpacaOrder.status,
      source: params.source ?? "manual",
      submittedAt: now,
    })
    .run();

  return {
    orderId: alpacaOrder.id,
    status: alpacaOrder.status,
    symbol: params.symbol.toUpperCase(),
    side: params.side,
    qty: alpacaOrder.qty,
    notional: alpacaOrder.notional,
    limitPrice: alpacaOrder.limit_price,
  };
}

/**
 * Cancel an order and update the log.
 */
export async function cancelOrderLogged(orderId: string): Promise<void> {
  await cancelOrder(orderId);

  const now = Date.now();
  // Update the order log status
  db.update(ordersLog)
    .set({ status: "canceled" })
    .where(eq(ordersLog.alpacaOrderId, orderId))
    .run();
}

/**
 * Cancel all open orders.
 */
export async function cancelAllOrdersLogged(): Promise<void> {
  await cancelAllOrders();

  const now = Date.now();
  // Mark all open orders as canceled
  const openOrders = db
    .select()
    .from(ordersLog)
    .all()
    .filter((o) => o.status === "new" || o.status === "accepted" || o.status === "pending_new");

  for (const order of openOrders) {
    db.update(ordersLog)
      .set({ status: "canceled" })
      .where(eq(ordersLog.alpacaOrderId, order.alpacaOrderId))
      .run();
  }
}

// --- Account & Positions ---

export interface AccountInfo {
  equity: number;
  cash: number;
  buyingPower: number;
  portfolioValue: number;
  dayTradeCount: number;
  status: string;
  isOpen: boolean;
}

export interface PositionInfo {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  marketValue: number;
}

/**
 * Get account info from Alpaca.
 */
export async function getAccountInfo(): Promise<AccountInfo> {
  const account = await getAccount();
  return {
    equity: parseFloat(account.equity),
    cash: parseFloat(account.cash),
    buyingPower: parseFloat(account.buying_power),
    portfolioValue: parseFloat(account.portfolio_value),
    dayTradeCount: account.daytrade_count,
    status: account.status,
    isOpen: false, // Will be set by clock check
  };
}

/**
 * Get all current positions from Alpaca.
 */
export async function getPositionsInfo(): Promise<PositionInfo[]> {
  const positions = await getPositions();
  return positions.map((p) => ({
    symbol: deltaToAppSymbol(p.symbol),
    qty: parseFloat(p.qty),
    avgEntryPrice: parseFloat(p.avg_entry_price),
    currentPrice: parseFloat(p.current_price),
    unrealizedPnl: parseFloat(p.unrealized_pl),
    unrealizedPnlPct: parseFloat(p.unrealized_plpc) * 100,
    marketValue: parseFloat(p.market_value),
  }));
}

// --- Account Snapshots ---

/**
 * Capture an account snapshot (equity curve data point).
 * Called periodically by the worker.
 */
export async function captureAccountSnapshot(): Promise<void> {
  try {
    const account = await getAccount();
    const now = Date.now();

    db.insert(accountSnapshots)
      .values({
        ts: now,
        equity: parseFloat(account.equity),
        cash: parseFloat(account.cash),
        buyingPower: parseFloat(account.buying_power),
      })
      .run();
  } catch (err: any) {
    console.error("[paper] Failed to capture account snapshot:", err.message);
  }
}

/**
 * Get recent account snapshots for equity curve chart.
 */
export function getEquityCurve(limit: number = 100) {
  return db
    .select()
    .from(accountSnapshots)
    .orderBy(desc(accountSnapshots.ts))
    .limit(limit)
    .all()
    .reverse(); // Chronological order
}

/**
 * Get all orders, optionally filtered.
 */
export function getOrdersLog(params?: { limit?: number; source?: string }) {
  const limit = params?.limit ?? 50;
  let query = db.select().from(ordersLog);

  const rows = query.orderBy(desc(ordersLog.submittedAt)).limit(limit).all();

  if (params?.source) {
    return rows.filter((r) => r.source === params.source);
  }

  return rows;
}
