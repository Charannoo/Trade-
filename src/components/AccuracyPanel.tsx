/**
 * components/AccuracyPanel.tsx — Shows prediction accuracy stats.
 */
"use client";

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

interface AccuracyPanelProps {
  strategies: StrategyStats[];
  historicalBaseline?: {
    trendFollowAccuracy: number;
    randomAccuracy: number;
  };
}

export default function AccuracyPanel({
  strategies,
  historicalBaseline = { trendFollowAccuracy: 0.55, randomAccuracy: 0.5 },
}: AccuracyPanelProps) {
  const active = strategies.find((s) => s.status === "active");
  const testing = strategies.find((s) => s.status === "testing");

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h3 className="text-lg font-bold mb-4">Prediction Accuracy</h3>

      {active && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium">Active Strategy (v{active.version})</span>
            <span className="text-xs text-gray-400">{active.changeSummary}</span>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <div className="text-2xl font-bold">
                {(active.stats.accuracy * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-gray-400">Accuracy</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {active.stats.graded}/{active.stats.total}
              </div>
              <div className="text-xs text-gray-400">Graded/Total</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {active.stats.avgConfidence.toFixed(1)}
              </div>
              <div className="text-xs text-gray-400">Avg Confidence</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {active.calibration.calibrationError.toFixed(3)}
              </div>
              <div className="text-xs text-gray-400">Calibration Error</div>
            </div>
          </div>

          <div className="text-xs text-gray-400 mb-4">
            Baselines: trend-follow {historicalBaseline.trendFollowAccuracy * 100}% / random {historicalBaseline.randomAccuracy * 100}%
          </div>

          {Object.keys(active.calibration.byConfidence).length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-400 mb-2">Confidence Calibration</div>
              <div className="space-y-1">
                {Object.entries(active.calibration.byConfidence)
                  .sort(([a], [b]) => parseInt(a) - parseInt(b))
                  .map(([conf, data]) => (
                    <div key={conf} className="flex items-center gap-2 text-xs">
                      <span className="w-8 text-gray-400">{conf}/10</span>
                      <div className="flex-1 h-2 bg-gray-800 rounded">
                        <div
                          className="h-2 bg-blue-500 rounded"
                          style={{ width: `${data.accuracy * 100}%` }}
                        />
                      </div>
                      <span className="w-12 text-gray-400">
                        {(data.accuracy * 100).toFixed(0)}%
                      </span>
                      <span className="w-12 text-gray-500">
                        (n={data.count})
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {testing && (
        <div className="border-t border-gray-800 pt-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-yellow-400">
              Testing Strategy (v{testing.version})
            </span>
            <span className="text-xs text-gray-400">{testing.changeSummary}</span>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-lg font-bold">
                {(testing.stats.accuracy * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-gray-400">Accuracy</div>
            </div>
            <div>
              <div className="text-lg font-bold">
                {testing.stats.graded}/{testing.stats.total}
              </div>
              <div className="text-xs text-gray-400">Graded/Total</div>
            </div>
            <div>
              <div className="text-lg font-bold">
                {testing.stats.avgConfidence.toFixed(1)}
              </div>
              <div className="text-xs text-gray-400">Avg Confidence</div>
            </div>
          </div>

          {testing.stats.graded < 20 && (
            <div className="mt-2 text-xs text-gray-500">
              Need {20 - testing.stats.graded} more graded predictions for comparison
            </div>
          )}

          {active && testing.stats.graded >= 20 && (
            <div className="mt-2 text-xs">
              {testing.stats.accuracy > active.stats.accuracy ? (
                <span className="text-emerald-400">
                  Outperforming active by +{((testing.stats.accuracy - active.stats.accuracy) * 100).toFixed(1)}%
                </span>
              ) : (
                <span className="text-red-400">
                  Underperforming active by {((testing.stats.accuracy - active.stats.accuracy) * 100).toFixed(1)}%
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {strategies.length === 0 && (
        <div className="text-center text-gray-400 py-8">
          No prediction data yet. Run some research first.
        </div>
      )}
    </div>
  );
}
