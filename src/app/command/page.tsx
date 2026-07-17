"use client";

import { useState, useEffect, useRef } from "react";

interface Message {
  role: "user" | "bot";
  text: string;
  raw?: any;
}

export default function CommandPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "bot", text: "Tell me your trading goal. Examples:\n- \"I want ₹200 profit from ₹59\"\n- \"Make 20% on my balance\"\n- \"Double ₹59 to ₹100\"\n- \"Aggressive trading to make ₹500\"" },
  ]);
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/command")
      .then((r) => r.json())
      .then((d) => {
        if (d.balance !== undefined) setBalance(d.balance);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: userMsg }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [...prev, { role: "bot", text: `Error: ${data.error}` }]);
        return;
      }

      const plan = data.plan;
      const lines: string[] = [];

      if (plan.balanceDetected > 0) {
        lines.push(`Balance detected: ₹${plan.balanceDetected}`);
      }

      lines.push(plan.summary);

      if (plan.warnings.length > 0) {
        lines.push(""); lines.push("⚠ Warnings:");
        for (const w of plan.warnings) lines.push(`  • ${w}`);
      }

      if (data.applied?.applied) {
        lines.push(""); lines.push("✅ Bot configured and enabled. Worker will execute trades automatically.");
      } else if (data.applied) {
        lines.push(""); lines.push(`❌ ${data.applied.message}`);
      }

      setMessages((prev) => [...prev, { role: "bot", text: lines.join("\n"), raw: data }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: "bot", text: `Connection error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Command</h1>
          <p className="text-zinc-500 text-sm">Tell the bot what you want in plain English</p>
        </div>
        {balance !== null && (
          <span className="text-sm text-zinc-400">
            Balance: <span className="font-mono font-bold text-emerald-400">₹{balance}</span>
          </span>
        )}
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 h-[500px] overflow-y-auto space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-emerald-600/20 text-emerald-300 border border-emerald-600/30"
                  : "bg-zinc-800/50 text-zinc-200 border border-zinc-700/50"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-zinc-800/50 rounded-xl px-4 py-2.5 text-sm text-zinc-400 border border-zinc-700/50">
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='e.g. "I want ₹200 profit from ₹59"'
          className="flex-1 px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-600"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium"
        >
          Send
        </button>
      </form>
    </div>
  );
}
