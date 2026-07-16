/**
 * /predictions — Full predictions page.
 * 
 * Shows accuracy panel, active predictions, and recent grades.
 * Client component that fetches data from /api/predictions.
 */
"use client";

import { useState, useEffect } from "react";
import PredictionCard from "@/components/PredictionCard";
import AccuracyPanel from "@/components/AccuracyPanel";

interface Prediction {
  id: number;
  symbol: string;
  outlook: "bullish" | "neutral" | "bearish";
  confidence: number;
  horizonDays: number;
  thesis: string;
  risks: string[];
  catalysts: string[];
  sources: { title: string; url: string }[];
  algoVersion: number | null;
  createdAt: number;
  status: string;
}

interface Outcome {
  priceAtPrediction: number;
  priceAtHorizon: number;
  returnPct: number;
  directionCorrect: boolean;
  neutralBandPct: number | null;
}

interface StrategyStats {
  version: number;
  status: string;
  changeSummary: string;
  stats: {
    total: number;
    graded: number;
    correct: number;
    accuracy: number;
    avgConfidence: number;
    calibrationError: number;
  };
  calibration: {
    overall: { accuracy: number; count: number };
    byConfidence: Record<number, { accuracy: number; count: number }>;
    calibrationError: number;
  };
}

export default function PredictionsPage() {
  const [predictions, setPredictions] = useState<(Prediction & { outcome?: Outcome | null })[]>([]);
  const [strategies, setStrategies] = useState<StrategyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "graded">("all");
  const [runSymbol, setRunSymbol] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetchData();
  }, [filter]);

  async function fetchData() {
    setLoading(true);
    setError(null);

    try {
      // Fetch predictions
      const predParams = new URLSearchParams();
      if (filter === "active") predParams.set("graded", "false");
      if (filter === "graded") predParams.set("graded", "true");
      predParams.set("limit", "100");

      const [predRes, accRes] = await Promise.all([
        fetch(`/api/predictions?${predParams}`),
        fetch("/api/predictions/accuracy"),
      ]);

      if (!predRes.ok) throw new Error("Failed to fetch predictions");
      if (!accRes.ok) throw new Error("Failed to fetch accuracy");

      const predData = await predRes.json();
      const accData = await accRes.json();

      setPredictions(predData.predictions || []);
      setStrategies(accData.strategies || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRunResearch() {
    if (!runSymbol.trim()) return;
    setRunning(true);

    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: runSymbol.trim().toUpperCase(),
          horizonDays: 60,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Research failed");
      }

      // Refresh data
      await fetchData();
      setRunSymbol("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  const activePreds = predictions.filter((p) => !p.outcome);
  const gradedPreds = predictions.filter((p) => p.outcome);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Predictions</h1>
          <p className="text-zinc-500 text-sm">
            AI-powered stock predictions with accuracy tracking.
          </p>
        </div>

        {/* Run Research */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={runSymbol}
            onChange={(e) => setRunSymbol(e.target.value)}
            placeholder="AAPL"
            className="w-24 px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleRunResearch()}
          />
          <button
            onClick={handleRunResearch}
            disabled={running || !runSymbol.trim()}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-sm"
          >
            {running ? "Running..." : "Run Research"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Accuracy Panel */}
      <AccuracyPanel strategies={strategies} />

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "active", "graded"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded text-sm ${
              filter === f
                ? "bg-zinc-700 text-white"
                : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "active" && activePreds.length > 0 && (
              <span className="ml-1 text-xs">({activePreds.length})</span>
            )}
            {f === "graded" && gradedPreds.length > 0 && (
              <span className="ml-1 text-xs">({gradedPreds.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Predictions List */}
      {loading ? (
        <div className="text-center text-zinc-500 py-8">Loading...</div>
      ) : predictions.length === 0 ? (
        <div className="text-center text-zinc-500 py-8">
          No predictions yet. Run research on a symbol above.
        </div>
      ) : (
        <div className="space-y-3">
          {predictions.map((pred) => (
            <PredictionCard
              key={pred.id}
              prediction={pred}
              outcome={pred.outcome}
            />
          ))}
        </div>
      )}
    </div>
  );
}
