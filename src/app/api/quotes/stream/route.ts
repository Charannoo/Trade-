/**
 * API: GET /api/quotes/stream — SSE stream of live quotes.
 * Polls latest_prices every ~1s, sends clock every ~30s.
 */
import { db } from "@/lib/db";
import { latestPrices } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let lastClock = 0;

      // Send quotes every ~1s
      const quoteInterval = setInterval(() => {
        try {
          const rows = db.select().from(latestPrices).all();
          const quotes: Record<string, any> = {};
          for (const row of rows) {
            quotes[row.symbol] = {
              price: row.price,
              prevClose: row.prevClose,
              source: row.source,
              delayed: row.delayed,
            };
          }
          const data = JSON.stringify({ type: "quotes", quotes });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // DB might not be ready yet
        }
      }, 1000);

      // Send clock every ~30s
      const clockInterval = setInterval(() => {
        const now = Date.now();
        if (now - lastClock > 25000) {
          lastClock = now;
          const et = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
          const etDate = new Date(et);
          const day = etDate.getDay();
          const hour = etDate.getHours();
          const min = etDate.getMinutes();
          const timeNum = hour * 60 + min;
          const isOpen = day >= 1 && day <= 5 && timeNum >= 570 && timeNum < 960;

          const clockData = JSON.stringify({
            type: "clock",
            clock: {
              timestamp: new Date().toISOString(),
              is_open: isOpen,
            },
          });
          controller.enqueue(encoder.encode(`data: ${clockData}\n\n`));
        }
      }, 1000);

      // Heartbeat every 15s
      const heartbeatInterval = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, 15000);

      // Cleanup on close
      const originalCancel = controller.close.bind(controller);
      const cleanup = () => {
        clearInterval(quoteInterval);
        clearInterval(clockInterval);
        clearInterval(heartbeatInterval);
      };

      // Override close to cleanup
      const origClose = controller.close;
      (controller as any).close = () => {
        cleanup();
        return origClose.call(controller);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
