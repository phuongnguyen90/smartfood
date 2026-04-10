/**
 * api/queue.js  →  POST /api/queue
 *
 * Body: { action: "register" | "next" | "reset", name?, dish?, qty? }
 *
 * Fixes:
 *  1. register: removed auto-serving (prev.serving===0 ? counter : prev.serving)
 *     → serving stays 0 until staff explicitly clicks "Gọi số tiếp theo"
 *  2. register: await setState before getState to avoid race condition
 *  3. register: don't append x${qty} to dish (frontend already embeds qty)
 *  4. next: when no more items, still advance serving so last item = "Hoàn tất"
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

  let toastNum = "";
  let toastMsg = "";

  switch (action) {
    case "register": {
      if (!name || !dish) {
        return res.status(400).json({ error: "name and dish are required" });
      }

      // FIX 1 & 2 & 3: await setState, don't auto-serve, don't append x${qty}
      await setState((prev) => {
        const counter = prev.counter + 1;
        const entry = {
          num: counter,
          name: name.trim(),
          dish: dish, // frontend already embeds qty in dish string
          timestamp: new Date().toISOString(),
        };
        return {
          ...prev,
          counter,
          queue: [...prev.queue, entry],
          // serving stays unchanged — staff controls when to call numbers
          serving: prev.serving,
        };
      });

      // Now getState() returns the updated state reliably
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
        // FIX 4: advance serving past last item so it shows "Hoàn tất"
        if (current.serving > 0) {
          await setState((prev) => ({ ...prev, serving: prev.serving + 1 }));
        }
        toastNum = "✓";
        toastMsg = "Đã phục vụ hết tất cả đơn!";
        console.log("[NEXT] Queue exhausted");
        break;
      }

      await setState((prev) => ({ ...prev, serving: nextItem.num }));
      toastNum = `#${String(nextItem.num).padStart(3, "0")}`;
      toastMsg = `Mời khách: ${nextItem.name}!`;
      console.log(`[NEXT] Serving ${toastNum}`);
      break;
    }

    case "reset": {
      await setState(() => ({ queue: [], counter: 0, serving: 0 }));
      toastNum = "↺";
      toastMsg = "Hàng chờ đã được đặt lại.";
      console.log("[RESET]");
      break;
    }

    default:
      return res.status(400).json({ error: `Unknown action: ${action}` });
  }

  broadcast("toast", { num: toastNum, msg: toastMsg });
  console.log(`[BROADCAST] action=${action} | clients=${clientCount()}`);

  return res.status(200).json({
    ok: true,
    state: await getState(),
    toast: { num: toastNum, msg: toastMsg },
  });
}
