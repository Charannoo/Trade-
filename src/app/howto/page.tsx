export default function HowToPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">How to use TradeS</h1>
      <div className="prose prose-invert prose-zinc text-sm space-y-6">
        <Section id="getting-started" title="Getting Started">
          <p>
            TradeS is a personal stock prediction and paper-trading tool. It uses AI
            to research stocks and generate predictions, then paper-trades them
            through an Alpaca paper account with fake money.
          </p>
          <p className="text-amber-400">
            This is decision-support research, NOT financial advice.
          </p>
        </Section>

        <Section id="accounts" title="0. Accounts (currently off)">
          <p>
            Login is off by default. Set <code>AUTH_ENABLED=true</code> in your
            <code>.env.local</code> to enable it. The first account becomes the
            owner; later accounts are read-only guests.
          </p>
        </Section>

        <Section id="dashboard" title="1. Dashboard">
          <p>
            Add stocks you own (holdings) or want to track (watchlist). Live US
            prices stream in real-time. International tickers show delayed quotes.
          </p>
        </Section>

        <Section id="predictions" title="2. Predictions">
          <p>
            The system generates quantitative signals (RSI, MACD, SMA crossovers,
            breakout detection) and Claude research verdicts with confidence scores.
            Every prediction is graded against what actually happened.
          </p>
        </Section>

        <Section id="trade" title="3. Paper Trading">
          <p>
            Place orders into an Alpaca paper account. No real money is at risk.
            Positions, orders, and equity curves are tracked.
          </p>
        </Section>

        <Section id="bot" title="4. Bot">
          <p>
            Set rules like &quot;Claude bullish ≥7/10 + breakout → buy $500 with 5%
            stop-loss.&quot; The bot executes automatically during market hours in the
            paper account.
          </p>
        </Section>

        <Section id="self-improve" title="5. Self-Improvement">
          <p>
            The system studies its own mistakes, proposes bounded strategy changes,
            tests them against history, and promotes only provably better versions.
          </p>
        </Section>

        <Section id="discoveries" title="6. Discoveries">
          <p>
            A weekly scan finds under-the-radar US stocks tied to fresh news and
            events. Review picks in the inbox and approve or dismiss them.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id}>
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      {children}
    </div>
  );
}
