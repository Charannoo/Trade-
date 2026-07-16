import { DashboardContent } from "@/components/DashboardContent";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <MarketStatusPill />
      </div>
      <DashboardContent />
      <p className="text-[10px] text-zinc-600 mt-4">
        Prices are delayed for international tickers. Not financial advice.
      </p>
    </div>
  );
}

function MarketStatusPill() {
  // Server component — checks market hours
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  const hour = et.getHours();
  const minute = et.getMinutes();
  const timeNum = hour * 60 + minute;
  const isOpen = day >= 1 && day <= 5 && timeNum >= 570 && timeNum < 960; // 9:30-16:00

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
        isOpen
          ? "bg-green-500/10 text-green-400 border border-green-500/20"
          : "bg-zinc-800 text-zinc-500 border border-zinc-700"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-green-500 pulse-dot" : "bg-zinc-600"}`} />
      {isOpen ? "Market Open" : "Market Closed"}
    </span>
  );
}
