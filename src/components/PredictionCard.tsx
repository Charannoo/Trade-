/**
 * components/PredictionCard.tsx — Renders a single prediction.
 * Uses actual DB schema field names.
 */
"use client";

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

interface PredictionCardProps {
  prediction: Prediction;
  outcome?: Outcome | null;
  compact?: boolean;
}

export default function PredictionCard({ prediction, outcome, compact }: PredictionCardProps) {
  const outlookColors = {
    bullish: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    neutral: "text-gray-400 bg-gray-500/10 border-gray-500/30",
    bearish: "text-red-400 bg-red-500/10 border-red-500/30",
  };

  const outlookIcons = {
    bullish: "↑",
    neutral: "→",
    bearish: "↓",
  };

  const horizonMs = prediction.horizonDays * 24 * 60 * 60 * 1000;
  const expiresAt = prediction.createdAt + horizonMs;
  const isExpired = Date.now() > expiresAt;
  const expiresIn = expiresAt - Date.now();
  const expiresInDays = Math.max(0, Math.ceil(expiresIn / (24 * 60 * 60 * 1000)));

  if (compact) {
    return (
      <div className={`rounded-lg border p-3 ${outlookColors[prediction.outlook]}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{prediction.symbol}</span>
            <span className="text-sm">
              {outlookIcons[prediction.outlook]} {prediction.outlook}
            </span>
          </div>
          <div className="text-sm">
            {prediction.confidence}/10
          </div>
        </div>
        {outcome && (
          <div className={`mt-2 text-xs ${outcome.directionCorrect ? "text-emerald-400" : "text-red-400"}`}>
            {outcome.directionCorrect ? "CORRECT" : "WRONG"}: {outcome.returnPct >= 0 ? "+" : ""}{outcome.returnPct.toFixed(1)}%
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold">{prediction.symbol}</span>
          <span className={`px-2 py-0.5 rounded text-sm font-medium ${outlookColors[prediction.outlook]}`}>
            {outlookIcons[prediction.outlook]} {prediction.outlook}
          </span>
          <span className="text-sm text-gray-400">
            {prediction.confidence}/10 confidence
          </span>
        </div>
        <div className="text-sm text-gray-400">
          {prediction.horizonDays}d horizon
        </div>
      </div>

      {/* Thesis */}
      <div className="mb-3 text-sm text-gray-300">
        {prediction.thesis}
      </div>

      {/* Risks & Catalysts */}
      <div className="grid grid-cols-2 gap-4 mb-3">
        {prediction.risks.length > 0 && (
          <div>
            <div className="text-xs font-medium text-red-400 mb-1">Risks</div>
            <ul className="text-xs text-gray-400 space-y-0.5">
              {prediction.risks.map((r, i) => (
                <li key={i}>• {r}</li>
              ))}
            </ul>
          </div>
        )}
        {prediction.catalysts.length > 0 && (
          <div>
            <div className="text-xs font-medium text-emerald-400 mb-1">Catalysts</div>
            <ul className="text-xs text-gray-400 space-y-0.5">
              {prediction.catalysts.map((c, i) => (
                <li key={i}>• {c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Sources */}
      {prediction.sources.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-medium text-gray-400 mb-1">Sources</div>
          <div className="flex flex-wrap gap-1">
            {prediction.sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline"
              >
                {s.title.slice(0, 30)}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-800 pt-2">
        <div>
          Generated: {new Date(prediction.createdAt).toLocaleDateString()}
          {prediction.algoVersion && ` • v${prediction.algoVersion}`}
        </div>
        <div>
          {isExpired ? (
            <span className="text-gray-400">Expired</span>
          ) : (
            <span>{expiresInDays}d remaining</span>
          )}
        </div>
      </div>

      {/* Outcome */}
      {outcome && (
        <div className={`mt-3 p-2 rounded text-xs ${outcome.directionCorrect ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"}`}>
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {outcome.directionCorrect ? "✓ CORRECT" : "✗ WRONG"}
            </span>
            <span>
              Actual: {outcome.returnPct >= 0 ? "+" : ""}{outcome.returnPct.toFixed(1)}%
            </span>
          </div>
          {outcome.neutralBandPct !== null && (
            <div className="mt-1">Within neutral band</div>
          )}
        </div>
      )}
    </div>
  );
}
