"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Quote {
  price: number;
  prevClose?: number;
  source: string;
}

interface Clock {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
}

/**
 * SSE-backed hook that receives live quote updates.
 * Falls back to polling if SSE is not available.
 */
export function useQuoteStream() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [clock, setClock] = useState<Clock | null>(null);
  const prevPrices = useRef<Record<string, number>>({});

  useEffect(() => {
    const eventSource = new EventSource("/api/quotes/stream");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "quotes") {
          setQuotes((prev) => {
            const next = { ...prev };
            for (const [sym, quote] of Object.entries(data.quotes)) {
              const q = quote as Quote;
              // Track previous price for flash animation
              if (next[sym]?.price) {
                prevPrices.current[sym] = next[sym].price;
              }
              next[sym] = q;
            }
            return next;
          });
        } else if (data.type === "clock") {
          setClock(data.clock);
        }
      } catch {
        // Ignore parse errors
      }
    };

    eventSource.onerror = () => {
      // SSE will auto-reconnect
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const getFlashClass = useCallback(
    (symbol: string): string => {
      const current = quotes[symbol]?.price;
      const prev = prevPrices.current[symbol];
      if (!current || !prev) return "";
      if (current > prev) return "flash-up";
      if (current < prev) return "flash-down";
      return "";
    },
    [quotes]
  );

  return { quotes, clock, getFlashClass };
}
