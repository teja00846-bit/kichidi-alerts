import { KichidiEngine } from "./engine.js";

export { KichidiEngine };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("KICHIDI ALERTS WORKER ONLINE");
    }

    if (url.pathname === "/test") {
      const response = await fetch(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: env.TELEGRAM_CHAT_ID,
            text: "KICHIDI Telegram connection successful!"
          })
        }
      );

      return new Response(await response.text(), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const id = env.KICHIDI_ENGINE.idFromName("xauusd-m5");
    const engine = env.KICHIDI_ENGINE.get(id);

    if (url.pathname === "/start" && request.method === "POST") {
      return engine.fetch("https://engine/start", { method: "POST" });
    }

    if (url.pathname === "/stop" && request.method === "POST") {
      return engine.fetch("https://engine/stop", { method: "POST" });
    }

    if (url.pathname === "/status") {
      return engine.fetch("https://engine/status");
    }

    return new Response("Not found", { status: 404 });
  }
};
