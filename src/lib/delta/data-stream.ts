/**
 * delta/data-stream.ts — Delta Exchange India market-data websocket.
 * Worker OWNS this single connection.
 * 
 * Delta WebSocket: wss://socket.india.delta.exchange
 * Auth: {"type": "auth", "payload": {"api-key": "...", "signature": "...", "timestamp": "..."}}
 * Subscribe: {"type": "subscribe", "payload": {"channels": [{"name": "l2_orderbook", "symbols": ["BTCUSDT"]}]}}
 */
import WebSocket from "ws";
import { createHmac } from "crypto";
import { env } from "@/lib/env";

type OnTrade = (symbol: string, trade: { price: number; size: number; timestamp: string }) => void;
type OnQuote = (symbol: string, quote: { bid: number; ask: number; timestamp: string }) => void;
type OnStatus = (status: "connected" | "disconnected" | "error") => void;

export class DeltaDataStream {
  private ws: WebSocket | null = null;
  private _symbols: Set<string> = new Set();
  private _onTrade: OnTrade;
  private _onQuote: OnQuote;
  private _onStatus: OnStatus;
  private _reconnectDelay = 1000;
  private _maxReconnectDelay = 60000;
  private _running = false;
  private _heartbeatTimeout: NodeJS.Timeout | null = null;
  private _resubscribeInterval: NodeJS.Timeout | null = null;

  constructor(opts: { onTrade: OnTrade; onQuote: OnQuote; onStatus: OnStatus }) {
    this._onTrade = opts.onTrade;
    this._onQuote = opts.onQuote;
    this._onStatus = opts.onStatus;
  }

  setSymbols(symbols: string[]) {
    this._symbols = new Set(symbols.map((s) => s.toUpperCase()));
    this._resubscribe();
  }

  addSymbol(symbol: string) {
    this._symbols.add(symbol.toUpperCase());
    this._resubscribe();
  }

  removeSymbol(symbol: string) {
    this._symbols.delete(symbol.toUpperCase());
    this._resubscribe();
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._connect();
    this._resubscribeInterval = setInterval(() => this._resubscribe(), 30000);
  }

  stop() {
    this._running = false;
    if (this.ws) this.ws.close();
    if (this._heartbeatTimeout) clearTimeout(this._heartbeatTimeout);
    if (this._resubscribeInterval) clearInterval(this._resubscribeInterval);
  }

  private _connect() {
    if (!this._running) return;

    this.ws = new WebSocket("wss://socket.india.delta.exchange");

    this.ws.on("open", () => {
      this._reconnectDelay = 1000;
      this._onStatus("connected");
      this._authenticate();
      this._resetHeartbeat();
    });

    this.ws.on("message", (raw: Buffer) => {
      this._resetHeartbeat();
      try {
        const msg = JSON.parse(raw.toString());
        this._handleMessage(msg);
      } catch {
        // Ignore
      }
    });

    this.ws.on("close", () => {
      this._onStatus("disconnected");
      if (this._running) this._reconnect();
    });

    this.ws.on("error", (err) => {
      this._onStatus("error");
      console.error("[delta-data-stream] Error:", err.message);
    });
  }

  private _reconnect() {
    if (!this._running) return;
    console.log(`[delta-data-stream] Reconnecting in ${this._reconnectDelay}ms...`);
    setTimeout(() => {
      this._connect();
      this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._maxReconnectDelay);
    }, this._reconnectDelay);
  }

  private _authenticate() {
    if (!this.ws) return;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", env.DELTA_API_SECRET)
      .update("GET" + timestamp + "/live")
      .digest("hex");

    this.ws.send(
      JSON.stringify({
        type: "auth",
        payload: {
          "api-key": env.DELTA_API_KEY,
          signature,
          timestamp,
        },
      })
    );
  }

  private _resubscribe() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const symbols = Array.from(this._symbols);
    if (symbols.length === 0) return;

    // Subscribe to l2_orderbook for bid/ask
    this.ws.send(
      JSON.stringify({
        type: "subscribe",
        payload: {
          channels: [
            {
              name: "l2_orderbook",
              symbols,
            },
          ],
        },
      })
    );

    // Subscribe to ticker for trades
    this.ws.send(
      JSON.stringify({
        type: "subscribe",
        payload: {
          channels: [
            {
              name: "ticker",
              symbols,
            },
          ],
        },
      })
    );
  }

  private _resetHeartbeat() {
    if (this._heartbeatTimeout) clearTimeout(this._heartbeatTimeout);
    this._heartbeatTimeout = setTimeout(() => {
      console.warn("[delta-data-stream] Heartbeat timeout — reconnecting");
      this.ws?.close();
    }, 90000);
  }

  private _handleMessage(msg: Record<string, any>) {
    const type = msg.type as string;

    if (type === "l2_orderbook") {
      const data = msg.payload;
      const symbol = data?.symbol ?? "";
      const buyBook = data?.buy ?? [];
      const sellBook = data?.sell ?? [];
      const bid = buyBook.length > 0 ? buyBook[0].limit_price : 0;
      const ask = sellBook.length > 0 ? sellBook[0].limit_price : 0;

      if (symbol && bid && ask) {
        this._onQuote(symbol, {
          bid: parseFloat(bid),
          ask: parseFloat(ask),
          timestamp: new Date().toISOString(),
        });
      }
    } else if (type === "ticker") {
      const data = msg.payload;
      const symbol = data?.symbol ?? "";
      const price = parseFloat(data?.mark_price ?? data?.close ?? "0");
      const size = parseFloat(data?.volume ?? "0");

      if (symbol && price > 0) {
        this._onTrade(symbol, {
          price,
          size,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }
}
