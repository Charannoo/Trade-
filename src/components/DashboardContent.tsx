"use client";

import { useQuoteStream } from "@/hooks/useQuoteStream";

interface Holding {
  symbol: string;
  shares: number;
  costBasis: number;
}

interface WatchlistItem {
  symbol: string;
  addedAt: number;
}

export function DashboardContent() {
  // In a real app, fetch from API. For now, show placeholder.
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Holdings
        </h2>
        <div className="rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-zinc-500 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-2">Symbol</th>
                <th className="text-right px-4 py-2">Shares</th>
                <th className="text-right px-4 py-2">Cost Basis</th>
                <th className="text-right px-4 py-2">Price</th>
                <th className="text-right px-4 py-2">P/L</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/5">
                <td className="px-4 py-3 text-zinc-500" colSpan={5}>
                  No holdings yet. Add stocks to get started.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Watchlist
        </h2>
        <div className="rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-zinc-500 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-2">Symbol</th>
                <th className="text-right px-4 py-2">Price</th>
                <th className="text-right px-4 py-2">Change</th>
                <th className="text-left px-4 py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/5">
                <td className="px-4 py-3 text-zinc-500" colSpan={4}>
                  Watchlist is empty. Add tickers to start tracking.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
