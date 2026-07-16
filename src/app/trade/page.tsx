/**
 * /trade — Paper trading page.
 * 
 * Shows account info, positions, order form, equity curve, and order history.
 */
"use client";

import { useState, useEffect } from "react";
import EquityCurve from "@/components/EquityCurve";

interface AccountInfo {
  equity: number;
  cash: number;
  buyingPower: number;
  portfolioValue: number;
  dayTradeCount: number;
  status: string;
}

interface PositionInfo {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  marketValue: number;
}

interface OrderEntry {
  id: number;
  alpacaOrderId: string;
  symbol: string;
  side: string;
  type: string;
  qty: number | null;
  notional: number | null;
  status: string;
  source: string;
  submittedAt: number;
}

interface EquityPoint {
  ts: number;
  equity: number;
}

export default function TradePage() {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<PositionInfo[]>([]);
  const [orders, setOrders] = useState<OrderEntry[]>([]);
  const [equity, setEquity] = useState<EquityPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Order form
  const [orderSymbol, setOrderSymbol] = useState("");
  const [orderSide, setOrderSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit" | "stop_limit">("market");
  const [orderQty, setOrderQty] = useState("");
  const [orderNotional, setOrderNotional] = useState("");
  const [orderLimitPrice, setOrderLimitPrice] = useState("");
  const [orderStopPrice, setOrderStopPrice] = useState("");
  const [orderSource, setOrderSource] = useState("manual");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [acctRes, ordersRes, equityRes] = await Promise.all([
        fetch("/api/trading/account").catch(() => null),
        fetch("/api/trading/orders?limit=30").catch(() => null),
        fetch("/api/trading/equity?limit=200").catch(() => null),
      ]);

      if (acctRes?.ok) {
        const data = await acctRes.json();
        setAccount(data.account);
        setPositions(data.positions);
      }

      if (ordersRes?.ok) {
        const data = await ordersRes.json();
        setOrders(data.orders);
      }

      if (equityRes?.ok) {
        const data = await equityRes.json();
        setEquity(data.curve);
      }
    } catch {
      // Swallow — Alpaca may not be configured
    } finally {
      setLoading(false);
    }
  }

  async function handlePlaceOrder() {
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const body: Record<string, any> = {
        symbol: orderSymbol.trim().toUpperCase(),
        side: orderSide,
        type: orderType,
        source: orderSource,
      };

      if (orderQty) body.qty = orderQty;
      if (orderNotional) body.notional = orderNotional;
      if (orderLimitPrice) body.limitPrice = orderLimitPrice;
      if (orderStopPrice) body.stopPrice = orderStopPrice;

      const res = await fetch("/api/trading/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuccess(`Order placed: ${data.side} ${data.symbol} (${data.status})`);
      setOrderSymbol("");
      setOrderQty("");
      setOrderNotional("");
      setOrderLimitPrice("");
      setOrderStopPrice("");

      // Refresh data
      await fetchAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelAll() {
    try {
      await fetch("/api/trading/order", { method: "DELETE" });
      setSuccess("All orders canceled");
      await fetchAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Paper Trading</h1>
          <p className="text-zinc-500 text-sm">
            Alpaca paper account. No real money at risk.
          </p>
        </div>
        <button
          onClick={handleCancelAll}
          className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 rounded text-sm"
        >
          Cancel All Orders
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded text-sm text-emerald-400">
          {success}
        </div>
      )}

      {/* Account Summary */}
      <div className="grid grid-cols-5 gap-4">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="text-xs text-gray-400">Equity</div>
          <div className="text-xl font-bold">
            ${account?.equity?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? "---"}
          </div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="text-xs text-gray-400">Cash</div>
          <div className="text-xl font-bold">
            ${account?.cash?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? "---"}
          </div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="text-xs text-gray-400">Buying Power</div>
          <div className="text-xl font-bold">
            ${account?.buyingPower?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? "---"}
          </div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="text-xs text-gray-400">Day Trades</div>
          <div className="text-xl font-bold">
            {account?.dayTradeCount ?? "---"}
          </div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="text-xs text-gray-400">Status</div>
          <div className="text-xl font-bold">
            {account?.status ?? "---"}
          </div>
        </div>
      </div>

      {/* Positions */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="text-sm font-medium mb-3">Open Positions</h3>
        {positions.length === 0 ? (
          <div className="text-sm text-gray-500">No open positions</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-800">
                  <th className="text-left py-2">Symbol</th>
                  <th className="text-right py-2">Qty</th>
                  <th className="text-right py-2">Avg Entry</th>
                  <th className="text-right py-2">Current</th>
                  <th className="text-right py-2">P/L</th>
                  <th className="text-right py-2">P/L %</th>
                  <th className="text-right py-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.symbol} className="border-b border-gray-800/50">
                    <td className="py-2 font-medium">{p.symbol}</td>
                    <td className="py-2 text-right">{p.qty}</td>
                    <td className="py-2 text-right">${p.avgEntryPrice.toFixed(2)}</td>
                    <td className="py-2 text-right">${p.currentPrice.toFixed(2)}</td>
                    <td className={`py-2 text-right ${p.unrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      ${p.unrealizedPnl.toFixed(2)}
                    </td>
                    <td className={`py-2 text-right ${p.unrealizedPnlPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {p.unrealizedPnlPct >= 0 ? "+" : ""}{p.unrealizedPnlPct.toFixed(2)}%
                    </td>
                    <td className="py-2 text-right">${p.marketValue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Form */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="text-sm font-medium mb-3">Place Order</h3>
        <div className="grid grid-cols-6 gap-3 items-end">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Symbol</label>
            <input
              type="text"
              value={orderSymbol}
              onChange={(e) => setOrderSymbol(e.target.value)}
              placeholder="AAPL"
              className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Side</label>
            <select
              value={orderSide}
              onChange={(e) => setOrderSide(e.target.value as any)}
              className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Type</label>
            <select
              value={orderType}
              onChange={(e) => setOrderType(e.target.value as any)}
              className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
            >
              <option value="market">Market</option>
              <option value="limit">Limit</option>
              <option value="stop_limit">Stop Limit</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Qty</label>
            <input
              type="number"
              value={orderQty}
              onChange={(e) => setOrderQty(e.target.value)}
              placeholder="10"
              className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
            />
          </div>
          {orderType !== "market" && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Limit Price</label>
              <input
                type="number"
                value={orderLimitPrice}
                onChange={(e) => setOrderLimitPrice(e.target.value)}
                placeholder="150.00"
                className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
              />
            </div>
          )}
          <div>
            <button
              onClick={handlePlaceOrder}
              disabled={submitting || !orderSymbol.trim() || (!orderQty && !orderNotional)}
              className={`w-full px-3 py-1.5 rounded text-sm font-medium ${
                orderSide === "buy"
                  ? "bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
                  : "bg-red-600 hover:bg-red-500 disabled:opacity-50"
              }`}
            >
              {submitting ? "Placing..." : orderSide === "buy" ? "Buy" : "Sell"}
            </button>
          </div>
        </div>
      </div>

      {/* Equity Curve */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <EquityCurve data={equity} />
      </div>

      {/* Order History */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="text-sm font-medium mb-3">Recent Orders</h3>
        {orders.length === 0 ? (
          <div className="text-sm text-gray-500">No orders yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-800">
                  <th className="text-left py-2">Time</th>
                  <th className="text-left py-2">Symbol</th>
                  <th className="text-left py-2">Side</th>
                  <th className="text-left py-2">Type</th>
                  <th className="text-right py-2">Qty</th>
                  <th className="text-right py-2">Price</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-gray-800/50">
                    <td className="py-2 text-gray-400">
                      {new Date(o.submittedAt).toLocaleString()}
                    </td>
                    <td className="py-2 font-medium">{o.symbol}</td>
                    <td className={`py-2 ${o.side === "buy" ? "text-emerald-400" : "text-red-400"}`}>
                      {o.side}
                    </td>
                    <td className="py-2">{o.type}</td>
                    <td className="py-2 text-right">{o.qty ?? "---"}</td>
                    <td className="py-2 text-right">
                      {o.notional ? `$${o.notional.toFixed(2)}` : "---"}
                    </td>
                    <td className="py-2">{o.status}</td>
                    <td className="py-2 text-gray-400">{o.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {loading && (
        <div className="text-center text-zinc-500 text-sm">Loading...</div>
      )}
    </div>
  );
}
