import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TradeS — Stock Prediction & Paper Trading",
  description: "AI-powered stock prediction, paper trading, and self-improving strategy.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0e14] text-zinc-100 antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Top nav */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0e14]/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 pulse-dot" />
            <span className="font-semibold text-lg tracking-tight">TradeS</span>
          </div>

          {/* Nav links */}
          <div className="hidden sm:flex items-center gap-1 text-sm">
            <NavLink href="/">Dashboard</NavLink>
            <NavLink href="/predictions">Predictions</NavLink>
            <NavLink href="/discoveries">Discoveries</NavLink>
            <NavLink href="/trade">Trade</NavLink>
            <NavLink href="/bot">Bot</NavLink>
            <NavLink href="/command">Command</NavLink>
            <NavLink href="/strategy">Strategy</NavLink>
            <NavLink href="/howto">How-to</NavLink>
          </div>

          {/* Disclaimer */}
          <span className="text-[10px] text-zinc-600 hidden md:block">
            Not financial advice
          </span>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {children}
      </main>

      {/* Footer disclaimer */}
      <footer className="border-t border-white/5 py-3 text-center text-xs text-zinc-600">
        TradeS is decision-support research, not financial advice. Past performance does not guarantee future results.
      </footer>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="px-3 py-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-colors"
    >
      {children}
    </a>
  );
}
