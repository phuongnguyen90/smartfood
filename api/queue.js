/**
 * api/queue.js  →  POST /api/queue
 *
 * Body: { action: "register" | "next" | "reset", name?, dish?, qty? }
 *
 * After mutating state, broadcasts two SSE events to every client:
 *   • "state"  — full queue state (clients re-render their UI)
 *   • "toast"  — short notification message
 */

import { getState, setState, broadcast, clientCount } from "../lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const { action, name, dish, qty = 1 } = req.body ?? {};

  if (!action) {
    return res.status(400).json({ error: "Missing action" });
  }

  // ── Handle each action ───────────────────────────────────────────────────
  let toastNum = "";
  let toastMsg = "";

  switch (action) {
    case "register": {
      if (!name || !dish) {
        return res.status(400).json({ error: "name and dish are required" });
      }

      setState((prev) => {
        const counter = prev.counter + 1;
        const entry = {
          num: counter,
          name: name.trim(),
          dish: `${dish} x${qty}`,
          timestamp: new Date().toISOString(),
        };
        return {
          ...prev,
          counter,
          queue: [...prev.queue, entry],
          serving: prev.serving === 0 ? counter : prev.serving,
        };
      });

      const state = await getState();
      const { counter } = state;
      toastNum = `#${String(counter).padStart(3, "0")}`;
      toastMsg = `${name.trim()} – Đã lấy số thứ tự!`;
      console.log(`[REGISTER] ${toastNum} – ${dish}`);
      break;
    }

    case "next": {
      const current = await getState();
      const nextItem = current.queue.find((q) => q.num > current.serving);

      if (!nextItem) {
        return res.status(200).json({
          ok: true,
          toast: { num: "✓", msg: "Đã phục vụ hết tất cả đơn!" },
        });
      }

      setState((prev) => ({ ...prev, serving: nextItem.num }));
      toastNum = `#${String(nextItem.num).padStart(3, "0")}`;
      toastMsg = `Mời khách: ${nextItem.name}!`;
      console.log(`[NEXT] Serving ${toastNum}`);
      break;
    }

    case "reset": {
      setState(() => ({ queue: [], counter: 0, serving: 0 }));
      toastNum = "↺";
      toastMsg = "Hàng chờ đã được đặt lại.";
      console.log("[RESET]");
      break;
    }

    default:
      return res.status(400).json({ error: `Unknown action: ${action}` });
  }

  // ── Broadcast to all SSE clients ─────────────────────────────────────────
  broadcast("toast", { num: toastNum, msg: toastMsg });

  console.log(`[BROADCAST] action=${action} | clients=${clientCount()}`);

  return res.status(200).json({
    ok: true,
    state: await getState(),
    toast: { num: toastNum, msg: toastMsg },
  });
}
