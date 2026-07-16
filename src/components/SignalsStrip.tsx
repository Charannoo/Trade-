"use client";

import { Indicators } from "@/lib/research/indicators";

export function SignalsStrip({
  indicators,
  patterns,
}: {
  indicators: Indicators;
  patterns: string[];
}) {
  if (!indicators) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
        Technical Signals
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        {/* RSI */}
        <div>
          <div className="text-zinc-500 text-xs">RSI (14)</div>
          <div
            className={`font-medium tabular-nums ${
              indicators.rsi !== null
                ? indicators.rsi > 70
                  ? "text-red-400"
                  : indicators.rsi < 30
                    ? "text-green-400"
                    : "text-zinc-200"
                : "text-zinc-600"
            }`}
          >
            {indicators.rsi !== null ? indicators.rsi.toFixed(1) : "—"}
          </div>
        </div>

        {/* MACD */}
        <div>
          <div className="text-zinc-500 text-xs">MACD Hist</div>
          <div
            className={`font-medium tabular-nums ${
              indicators.macdHistogram !== null
                ? indicators.macdHistogram > 0
                  ? "text-green-400"
                  : "text-red-400"
                : "text-zinc-600"
            }`}
          >
            {indicators.macdHistogram !== null
              ? indicators.macdHistogram.toFixed(4)
              : "—"}
          </div>
        </div>

        {/* ATR% */}
        <div>
          <div className="text-zinc-500 text-xs">ATR%</div>
          <div className="font-medium tabular-nums text-zinc-200">
            {indicators.atrPct !== null ? indicators.atrPct.toFixed(2) + "%" : "—"}
          </div>
        </div>

        {/* Price vs SMA20 */}
        <div>
          <div className="text-zinc-500 text-xs">vs SMA20</div>
          <div className="font-medium tabular-nums text-zinc-200">
            {indicators.sma20 !== null ? (
              <span className="flex items-center gap-1">
                <SmaArrow current={null} sma={indicators.sma20} />
              </span>
            ) : (
              "—"
            )}
          </div>
        </div>
      </div>

      {/* Patterns */}
      {patterns.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="text-xs text-zinc-500 mb-1">Detected Patterns</div>
          <div className="flex flex-wrap gap-1">
            {patterns.map((p) => (
              <span
                key={p}
                className="px-2 py-0.5 rounded-full text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
              >
                {formatPattern(p)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 52-week range */}
      {indicators.high52w && indicators.low52w && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="text-xs text-zinc-500 mb-1">52-Week Range</div>
          <div className="flex items-center gap-2 text-xs tabular-nums">
            <span className="text-red-400">${indicators.low52w.toFixed(2)}</span>
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-full"
                style={{ width: "100%" }}
              />
            </div>
            <span className="text-green-400">${indicators.high52w.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SmaArrow({ current, sma }: { current: number | null; sma: number }) {
  return <span className="text-zinc-400">SMA20: ${sma.toFixed(2)}</span>;
}

function formatPattern(p: string): string {
  return p
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
