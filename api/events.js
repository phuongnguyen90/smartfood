/**
 * api/events.js  →  GET /api/events
 *
 * Keeps the HTTP response open and pushes SSE frames whenever
 * the queue state changes (triggered by broadcast() in store.js).
 *
 * Vercel config: maxDuration extends the function beyond the default 10 s.
 * Free Hobby plan caps at 60 s; Pro plan allows up to 800 s.
 * Clients auto-reconnect via EventSource on timeout — that's fine.
 */

import {
  getState,
  registerClient,
  unregisterClient,
  clientCount,
} from "../lib/store.js";

export const config = {
  maxDuration: 60, // seconds — raise on Pro plan if needed
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── SSE headers ─────────────────────────────────────────────────────────
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering on Vercel
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders(); // flush immediately so browser starts reading

  // ── Send current state to this client right away ─────────────────────────
  const state = await getState();
  res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);

  // ── Keep-alive ping every 20 s (prevents proxy/browser timeout) ──────────
  const ping = setInterval(() => {
    try {
      res.write(`:ping\n\n`); // SSE comment — browsers ignore it
    } catch {
      clearInterval(ping);
    }
  }, 20_000);

  // ── Register & clean up on disconnect ────────────────────────────────────
  const clientId = registerClient(res);

  req.on("close", () => {
    clearInterval(ping);
    unregisterClient(clientId);
    console.log(
      `[SSE] Client ${clientId} disconnected | remaining: ${clientCount()}`,
    );
  });

  console.log(`[SSE] Client ${clientId} connected | total: ${clientCount()}`);
}
