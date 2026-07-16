/**
 * /bot — Bot control page.
 * 
 * Shows bot status, kill switch, settings, rules, and activity log.
 */
"use client";

import { useState, useEffect } from "react";

interface BotSettings {
  enabled: boolean;
  killSwitch: boolean;
  maxPositionPct: number;
  maxDailyLossPct: number;
  maxOpenPositions: number;
  minConfidence: number;
  maxOrderValue: number;
  autoBrackets: boolean;
  stopLossPct: number;
  takeProfitPct: number;
}

interface BotRule {
  id: number;
  name: string;
  enabled: boolean;
  condition: any;
  action: any;
  version: number;
}

interface BotActivity {
  id: number;
  ts: number;
  ruleId: number | null;
  symbol: string | null;
  decision: string;
  reason: string;
}

export default function BotPage() {
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [rules, setRules] = useState<BotRule[]>([]);
  const [activity, setActivity] = useState<BotActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New rule form
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleType, setNewRuleType] = useState("signal");
  const [newRuleAction, setNewRuleAction] = useState("buy");
  const [showNewRule, setShowNewRule] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [settingsRes, rulesRes, activityRes] = await Promise.all([
        fetch("/api/bot"),
        fetch("/api/bot/rules"),
        fetch("/api/signals/AAPL"), // Placeholder — in production would be bot activity
      ]);

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setSettings(data.settings);
      }

      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setRules(data.rules);
      }

      // Bot activity comes from the same audit log
      setActivity([]);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleBot() {
    if (!settings) return;
    const newEnabled = !settings.enabled;
    try {
      await fetch("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      setSettings({ ...settings, enabled: newEnabled });
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleKillSwitch() {
    if (!settings) return;
    try {
      const action = settings.killSwitch ? "disengage" : "engage";
      await fetch("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ killSwitch: action === "engage" }),
      });
      setSettings({ ...settings, killSwitch: !settings.killSwitch, enabled: false });
      setSuccess(action === "engage" ? "Kill switch ENGAGED" : "Kill switch disengaged");
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleUpdateSetting(key: string, value: any) {
    if (!settings) return;
    try {
      await fetch("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      setSettings({ ...settings, [key]: value });
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleToggleRule(ruleId: number) {
    try {
      await fetch(`/api/bot/rules/${ruleId}/toggle`, { method: "POST" });
      await fetchAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDeleteRule(ruleId: number) {
    try {
      await fetch(`/api/bot/rules/${ruleId}`, { method: "DELETE" });
      await fetchAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleCreateRule() {
    if (!newRuleName.trim()) return;
    try {
      await fetch("/api/bot/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRuleName.trim(),
          condition: { type: newRuleType },
          action: { type: newRuleAction },
        }),
      });
      setNewRuleName("");
      setShowNewRule(false);
      await fetchAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (loading) {
    return <div className="text-zinc-500 text-sm">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bot Control</h1>
          <p className="text-zinc-500 text-sm">
            Automated trading rules with safeguards.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleToggleBot}
            className={`px-4 py-2 rounded text-sm font-medium ${
              settings?.enabled
                ? "bg-emerald-600 hover:bg-emerald-500"
                : "bg-zinc-700 hover:bg-zinc-600"
            }`}
          >
            {settings?.enabled ? "Bot ON" : "Bot OFF"}
          </button>
          <button
            onClick={handleKillSwitch}
            className={`px-4 py-2 rounded text-sm font-medium ${
              settings?.killSwitch
                ? "bg-yellow-600 hover:bg-yellow-500"
                : "bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30"
            }`}
          >
            {settings?.killSwitch ? "DISENGAGE KILL" : "KILL SWITCH"}
          </button>
        </div>
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

      {/* Status Banner */}
      <div className={`p-4 rounded-lg border ${
        settings?.killSwitch
          ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-400"
          : settings?.enabled
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
          : "border-gray-700 bg-gray-900 text-gray-400"
      }`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            settings?.killSwitch ? "bg-yellow-400" : settings?.enabled ? "bg-emerald-400" : "bg-gray-500"
          }`} />
          <span className="font-medium">
            {settings?.killSwitch
              ? "KILL SWITCH ENGAGED — All trading halted"
              : settings?.enabled
              ? "Bot is active and monitoring"
              : "Bot is offline"}
          </span>
        </div>
      </div>

      {/* Settings Grid */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="text-sm font-medium mb-3">Safeguards</h3>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Max Position %</label>
            <input
              type="number"
              value={settings?.maxPositionPct ?? 10}
              onChange={(e) => handleUpdateSetting("maxPositionPct", parseFloat(e.target.value))}
              className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Max Daily Loss %</label>
            <input
              type="number"
              value={settings?.maxDailyLossPct ?? 3}
              onChange={(e) => handleUpdateSetting("maxDailyLossPct", parseFloat(e.target.value))}
              className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Max Positions</label>
            <input
              type="number"
              value={settings?.maxOpenPositions ?? 5}
              onChange={(e) => handleUpdateSetting("maxOpenPositions", parseInt(e.target.value))}
              className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Min Confidence</label>
            <input
              type="number"
              value={settings?.minConfidence ?? 6}
              onChange={(e) => handleUpdateSetting("minConfidence", parseInt(e.target.value))}
              className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Max Order Value $</label>
            <input
              type="number"
              value={settings?.maxOrderValue ?? 5000}
              onChange={(e) => handleUpdateSetting("maxOrderValue", parseFloat(e.target.value))}
              className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Stop Loss %</label>
            <input
              type="number"
              value={settings?.stopLossPct ?? 5}
              onChange={(e) => handleUpdateSetting("stopLossPct", parseFloat(e.target.value))}
              className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Take Profit %</label>
            <input
              type="number"
              value={settings?.takeProfitPct ?? 10}
              onChange={(e) => handleUpdateSetting("takeProfitPct", parseFloat(e.target.value))}
              className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings?.autoBrackets ?? true}
                onChange={(e) => handleUpdateSetting("autoBrackets", e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Auto Brackets</span>
            </label>
          </div>
        </div>
      </div>

      {/* Rules */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Trading Rules</h3>
          <button
            onClick={() => setShowNewRule(!showNewRule)}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
          >
            {showNewRule ? "Cancel" : "Add Rule"}
          </button>
        </div>

        {showNewRule && (
          <div className="mb-3 p-3 bg-zinc-800 rounded grid grid-cols-3 gap-2">
            <input
              type="text"
              value={newRuleName}
              onChange={(e) => setNewRuleName(e.target.value)}
              placeholder="Rule name"
              className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
            />
            <select
              value={newRuleType}
              onChange={(e) => setNewRuleType(e.target.value)}
              className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
            >
              <option value="signal">Signal</option>
              <option value="price">Price</option>
              <option value="indicator">Indicator</option>
              <option value="prediction">Prediction</option>
              <option value="portfolio">Portfolio</option>
            </select>
            <div className="flex gap-2">
              <select
                value={newRuleAction}
                onChange={(e) => setNewRuleAction(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
                <option value="buy_bracket">Buy + Bracket</option>
                <option value="skip">Skip</option>
              </select>
              <button
                onClick={handleCreateRule}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-sm"
              >
                Create
              </button>
            </div>
          </div>
        )}

        {rules.length === 0 ? (
          <div className="text-sm text-gray-500">No rules configured. Add one above.</div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`flex items-center justify-between p-3 rounded border ${
                  rule.enabled ? "border-gray-700 bg-gray-800" : "border-gray-800 bg-gray-900 opacity-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleToggleRule(rule.id)}
                    className={`w-2 h-2 rounded-full ${
                      rule.enabled ? "bg-emerald-400" : "bg-gray-500"
                    }`}
                  />
                  <div>
                    <div className="text-sm font-medium">{rule.name}</div>
                    <div className="text-xs text-gray-400">
                      {rule.condition.type} → {rule.action.type} (v{rule.version})
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteRule(rule.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity Log */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="text-sm font-medium mb-3">Recent Activity</h3>
        {activity.length === 0 ? (
          <div className="text-sm text-gray-500">No activity yet. Bot will log decisions here.</div>
        ) : (
          <div className="space-y-1">
            {activity.slice(0, 20).map((a) => (
              <div key={a.id} className="flex items-center gap-3 text-xs py-1">
                <span className="text-gray-500">{new Date(a.ts).toLocaleString()}</span>
                <span className={`font-medium ${
                  a.decision === "buy" ? "text-emerald-400" :
                  a.decision === "sell" ? "text-red-400" :
                  a.decision === "halt" ? "text-yellow-400" :
                  "text-gray-400"
                }`}>
                  {a.decision.toUpperCase()}
                </span>
                {a.symbol && <span className="font-medium">{a.symbol}</span>}
                <span className="text-gray-400 truncate">{a.reason}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
