"use client";

import { useEffect, useState } from "react";
import { useQuoteStream } from "@/hooks/useQuoteStream";
import { CandlestickChart } from "@/components/CandlestickChart";
import { SignalsStrip } from "@/components/SignalsStrip";

interface StockData {
  symbol: string;
  price: number | null;
  prevClose: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
  source: string;
  delayed: boolean;
  currency: string;
}

export function StockPageContent({ symbol }: { symbol: string }) {
  const [data, setData] = useState<StockData | null>(null);
  const [bars, setBars] = useState<any[]>([]);
  const [signals, setSignals] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<"3M" | "1Y" | "3Y" | "5Y">("1Y");
  const { quotes } = useQuoteStream();

  // Get live price from stream
  const liveQuote = quotes[symbol];

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [quoteRes, barsRes, signalsRes] = await Promise.allSettled([
          fetch(`/api/quotes/${symbol}`),
          fetch(`/api/bars/${symbol}?timeframe=${timeframe}`),
          fetch(`/api/signals/${symbol}`),
        ]);

        if (quoteRes.status === "fulfilled") {
          const q = await quoteRes.value.json();
          setData(q);
        }
        if (barsRes.status === "fulfilled") {
          const b = await barsRes.value.json();
          setBars(b.bars || []);
        }
        if (signalsRes.status === "fulfilled") {
          const s = await signalsRes.value.json();
          setSignals(s);
        }
      } catch (err) {
        console.error("Failed to fetch stock data:", err);
      }
      setLoading(false);
    }
    fetchData();
  }, [symbol, timeframe]);

  // Use live price if available, else API price
  const currentPrice = liveQuote?.price ?? data?.price ?? 0;
  const prevClose = data?.prevClose ?? 0;
  const dayChange = currentPrice && prevClose ? currentPrice - prevClose : 0;
  const dayChangePct = prevClose ? (dayChange / prevClose) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{symbol}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-3xl font-semibold tabular-nums">
              ${currentPrice.toFixed(2)}
            </span>
            <span
              className={`text-lg font-medium tabular-nums ${
                dayChange >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {dayChange >= 0 ? "+" : ""}
              {dayChange.toFixed(2)} ({dayChangePct >= 0 ? "+" : ""}
              {dayChangePct.toFixed(2)}%)
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
            {data?.delayed && (
              <span className="bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20">
                Delayed
              </span>
            )}
            <span>Source: {data?.source ?? "unknown"}</span>
            {data?.currency !== "USD" && <span>{data?.currency}</span>}
          </div>
        </div>
      </div>

      {/* Timeframe selector */}
      <div className="flex gap-1">
        {(["3M", "1Y", "3Y", "5Y"] as const).map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              timeframe === tf
                ? "bg-white/10 text-white"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Chart */}
      {loading ? (
        <div className="h-[400px] rounded-lg border border-white/10 bg-white/[0.02] flex items-center justify-center text-zinc-600">
          Loading chart...
        </div>
      ) : (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
          <CandlestickChart bars={bars} />
        </div>
      )}

      {/* Signals strip */}
      {signals && (
        <SignalsStrip indicators={signals.indicators} patterns={signals.patterns} />
      )}

      <p className="text-[10px] text-zinc-600">
        Prices may be delayed. This is research, not financial advice.
      </p>
    </div>
  );
}
