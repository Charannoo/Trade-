/**
 * delta/trade-stream.ts — Delta Exchange India order update stream.
 * Separate connection from data-stream — worker-only.
 */
import WebSocket from "ws";
import { createHmac } from "crypto";
import { env } from "@/lib/env";

type OnTradeUpdate = (update: Record<string, unknown>) => void;

export class DeltaTradeStream {
  private ws: WebSocket | null = null;
  private _onUpdate: OnTradeUpdate;
  private _reconnectDelay = 1000;
  private _running = false;

  constructor(onUpdate: OnTradeUpdate) {
    this._onUpdate = onUpdate;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._connect();
  }

  stop() {
    this._running = false;
    if (this.ws) this.ws.close();
  }

  private _connect() {
    if (!this._running) return;

    this.ws = new WebSocket("wss://socket.india.delta.exchange");

    this.ws.on("open", () => {
      this._reconnectDelay = 1000;
      this._authenticate();
    });

    this.ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "orders" || msg.type === "order_update") {
          this._onUpdate(msg.payload ?? msg);
        }
      } catch {
        // Ignore
      }
    });

    this.ws.on("close", () => {
      if (this._running) this._reconnect();
    });

    this.ws.on("error", (err) => {
      console.error("[delta-trade-stream] Error:", err.message);
    });
  }

  private _reconnect() {
    if (!this._running) return;
    setTimeout(() => {
      this._connect();
      this._reconnectDelay = Math.min(this._reconnectDelay * 2, 60000);
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
}
