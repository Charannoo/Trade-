/**
 * components/EquityCurve.tsx — Equity curve chart using lightweight-charts.
 */
"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, AreaSeries, type IChartApi } from "lightweight-charts";

interface EquityCurveProps {
  data: { ts: number; equity: number }[];
}

export default function EquityCurve({ data }: EquityCurveProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "#1f2937" },
        horzLines: { color: "#1f2937" },
      },
      rightPriceScale: {
        borderColor: "#374151",
      },
      timeScale: {
        borderColor: "#374151",
        timeVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: 300,
    });

    const series = chart.addSeries(AreaSeries, {
      topColor: "rgba(59, 130, 246, 0.3)",
      bottomColor: "rgba(59, 130, 246, 0.0)",
      lineColor: "#3b82f6",
      lineWidth: 2,
    });

    const chartData = data.map((d) => ({
      time: Math.floor(d.ts / 1000) as any,
      value: d.equity,
    }));

    series.setData(chartData);
    chart.timeScale().fitContent();

    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-gray-500">
        No equity data yet. Account snapshots will appear as the bot trades.
      </div>
    );
  }

  const latestEquity = data[data.length - 1].equity;
  const firstEquity = data[0].equity;
  const totalReturn = ((latestEquity - firstEquity) / firstEquity) * 100;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-sm text-gray-400">Equity Curve</span>
          <span className="ml-2 text-lg font-bold">${latestEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className={`text-sm ${totalReturn >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {totalReturn >= 0 ? "+" : ""}{totalReturn.toFixed(2)}% total
        </div>
      </div>
      <div ref={chartContainerRef} className="rounded-lg border border-gray-800" />
    </div>
  );
}
