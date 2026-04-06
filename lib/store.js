import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://default:guMy1YAlLLBgztELGS9ehf7RaEJAguAp@redis-11202.c1.us-central1-2.gce.cloud.redislabs.com:11202";

// Redis connection for data operations (get, set, publish)
const redis = new Redis(redisUrl);

// Separate Redis connection for subscribing
const subRedis = new Redis(redisUrl);

// Client management for SSE
const clients = new Map();

export function registerClient(res) {
  const clientId = Date.now() + Math.random();
  clients.set(clientId, res);
  return clientId;
}

export function unregisterClient(clientId) {
  clients.delete(clientId);
}

export function clientCount() {
  return clients.size;
}

export async function getState() {
  const s = await redis.get("smartfood:state");
  return JSON.parse(s) || { queue: [], counter: 0, serving: 0 };
}

export async function setState(updater) {
  const prev = await getState();
  const next = updater(prev);
  await redis.set("smartfood:state", JSON.stringify(next));
  await redis.publish(
    "smartfood:updates",
    JSON.stringify({ type: "state", data: next }),
  );
}

// Broadcast dùng Pub/Sub
export function broadcast(event, data) {
  // Send to Redis for all instances
  redis.publish("smartfood:updates", JSON.stringify({ type: event, data }));
}

// Subscribe to updates and broadcast to local clients
subRedis.subscribe("smartfood:updates", (err, count) => {
  if (err) console.error("Redis subscribe error:", err);
});

subRedis.on("message", (channel, message) => {
  if (channel === "smartfood:updates") {
    try {
      const { type, data } = JSON.parse(message);
      // Send to local SSE clients
      for (const res of clients.values()) {
        try {
          res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch (e) {
          // Client might be disconnected, will be cleaned up on close
        }
      }
    } catch (e) {
      console.error("Error parsing message:", e);
    }
  }
});
