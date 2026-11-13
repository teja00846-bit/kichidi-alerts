import { parseBars, signalFor } from "./strategy.js";

const CANDLES_URL =
  "https://biquote.io/api/XAUUSD/ohlc?interval=5m&limit=30";

const QUOTE_URL =
  "https://biquote.io/api/XAUUSD?allowStale=false";

export class KichidiEngine {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;

    if (path === "/start" && request.method === "POST") {
      await this.ctx.storage.put("running", true);
      await this.ctx.storage.setAlarm(Date.now() + 1000);
      return Response.json({ ok: true, running: true });
    }

    if (path === "/stop" && request.method === "POST") {
      await this.ctx.storage.put("running", false);
      await this.ctx.storage.deleteAlarm();
      return Response.json({ ok: true, running: false });
    }

    if (path === "/status") {
      return Response.json({
        running: Boolean(await this.ctx.storage.get("running")),
        lastCheck: await this.ctx.storage.get("lastCheck") ?? null,
        lastError: await this.ctx.storage.get("lastError") ?? null,
        lastSignal: await this.ctx.storage.get("lastSignal") ?? null
      });
    }

    return new Response("KICHIDI engine online");
  }

  async alarm() {
    if (!(await this.ctx.storage.get("running"))) return;

    try {
      await this.checkMarket();
      await this.ctx.storage.delete("lastError");
    } catch (error) {
      await this.ctx.storage.put(
        "lastError",
        String(error?.message ?? error)
      );
    }

    await this.ctx.storage.put(
      "lastCheck",
      new Date().toISOString()
    );

    if (await this.ctx.storage.get("running")) {
      await this.ctx.storage.setAlarm(Date.now() + 5000);
    }
  }

  async checkMarket() {
    const [candleResponse, quoteResponse] = await Promise.all([
      fetch(CANDLES_URL),
      fetch(QUOTE_URL)
    ]);

    if (!candleResponse.ok || !quoteResponse.ok) {
      throw new Error("BiQuote data request failed");
    }

    const bars = parseBars(await candleResponse.json());
    const quote = await quoteResponse.json();
    const signal = signalFor(bars, Date.now());

    if (!signal) {
      await this.ctx.storage.delete("candidate");
      return;
    }

    const key = signal.barTime + ":" + signal.side;
    const previous = await this.ctx.storage.get("candidate");

    const startedAt =
      previous?.key === key ? previous.startedAt : Date.now();

    await this.ctx.storage.put("candidate", {
      key,
      startedAt
    });

    if (Date.now() - startedAt < 5000) return;

    if (await this.ctx.storage.get("lastSentKey") === key) return;

    if (!this.env.TELEGRAM_BOT_TOKEN || !this.env.TELEGRAM_CHAT_ID) {
      throw new Error("Telegram credentials are missing");
    }

    const message = [
      "KICHIDI " + signal.side + " SIGNAL — XAUUSD",
      "Timeframe: 5 minutes",
      "Entry: " + signal.entry,
      "Stop Loss: " + signal.sl,
      "Take Profit: " + signal.tp,
      "Risk/Reward: 1:1.7",
      "Live mid: " + (quote.mid ?? "unavailable"),
      "Confirmation: 5 seconds"
    ].join("\n");

    const response = await fetch(
      "https://api.telegram.org/bot" +
        this.env.TELEGRAM_BOT_TOKEN +
        "/sendMessage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.env.TELEGRAM_CHAT_ID,
          text: message
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error("Telegram message delivery failed");
    }

    await this.ctx.storage.put("lastSentKey", key);
    await this.ctx.storage.put("lastSignal", {
      ...signal,
      sentAt: new Date().toISOString()
    });
  }
}
