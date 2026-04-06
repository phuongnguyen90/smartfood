/**
 * api/state.js  →  GET /api/state
 * Returns the current queue state as JSON (useful for initial hydration fallback).
 */

import { getState, clientCount } from "../lib/store.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(200).json({
    ...(await getState()),
    connectedClients: clientCount(),
  });
}
