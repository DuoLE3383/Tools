// server/ws.js – FIXED with authentication

import { WebSocketServer as WSS } from "ws";
import { verifyToken } from "./auth.js";
import { scrapeHeroMinersGlobal } from "./miners/heroMiners.js";
import { scrapeMiningDutchGlobal } from "./miners/miningDutch.js";
import { getBtcPrice } from "./utils/priceUtils.js";

const ACTION_HANDLERS = {
  herominers: handleHeroMiners,
  miningDutch: handleMiningDutch,
  all: handleAll,
};

export function setupWebSocket(server) {
  const wss = new WSS({ 
    server, 
    path: "/api/v2/prices/ws",
    // ✅ Add authentication verification
    verifyClient: (info, cb) => {
      try {
        const url = new URL(info.req.url, `http://${info.req.headers.host}`);
        const token = url.searchParams.get('token');
        
        if (!token) {
          console.log('[WS] Connection rejected: No token provided');
          cb(false, 401, 'Unauthorized');
          return;
        }
        
        const decoded = verifyToken(token);
        if (!decoded) {
          console.log('[WS] Connection rejected: Invalid token');
          cb(false, 401, 'Unauthorized');
          return;
        }
        
        info.req.user = decoded;
        console.log(`[WS] Connection accepted for user: ${decoded.username}`);
        cb(true);
      } catch (err) {
        console.error('[WS] Verification error:', err.message);
        cb(false, 500, 'Internal Server Error');
      }
    }
  });

  wss.on("connection", (ws, req) => {
    console.log("[WS] Client connected");

    // ✅ Send initial connection confirmation
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'WebSocket connection established',
      timestamp: new Date().toISOString()
    }));

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const { requestId, action, client, rigid, coin, force } = msg;

        const handler = ACTION_HANDLERS[action];
        if (!handler) {
          ws.send(JSON.stringify({
            requestId,
            success: false,
            error: `Unknown action: ${action}`,
          }));
          return;
        }

        const data = await handler({ client, rigid, coin, force });
        ws.send(JSON.stringify({ requestId, success: true, action, data }));
      } catch (err) {
        try {
          const msg = JSON.parse(raw.toString());
          ws.send(JSON.stringify({
            requestId: msg.requestId,
            success: false,
            action: msg.action,
            error: err.message,
          }));
        } catch {
          ws.send(JSON.stringify({
            success: false,
            error: "Invalid request format",
          }));
        }
      }
    });

    ws.on("close", () => {
      console.log("[WS] Client disconnected");
    });

    ws.on("error", (err) => {
      console.error("[WS] Client error:", err.message);
    });

    // ✅ Send initial price data
    sendPriceUpdate(ws);
  });

  console.log("[WS] WebSocket server initialized at /api/v2/prices/ws");
  return wss;
}

async function handleHeroMiners(options) {
  try {
    const force = options?.force || false;
    const btcPrice = await getBtcPrice();
    const result = await scrapeHeroMinersGlobal(btcPrice);
    return {
      herominers: {
        success: result.success,
        coinStats: result.coinStats || [],
        miners: result.miners || 0,
        fetchedAt: new Date().toISOString(),
        error: result.error || null,
      },
    };
  } catch (err) {
    console.error("[WS:hero] Error:", err.message);
    throw err;
  }
}

async function handleMiningDutch(options) {
  try {
    const force = options?.force || false;
    const btcPrice = await getBtcPrice();
    const result = await scrapeMiningDutchGlobal(btcPrice, force);
    return {
      miningdutch: {
        success: result.success,
        coinStats: result.coinStats || [],
        fetchedAt: new Date().toISOString(),
        error: result.error || null,
      },
    };
  } catch (err) {
    console.error("[WS:dutch] Error:", err.message);
    throw err;
  }
}

async function handleAll(options) {
  try {
    const [hero, dutch] = await Promise.allSettled([
      handleHeroMiners(options),
      handleMiningDutch(options),
    ]);
    return {
      herominers: hero.status === "fulfilled" ? hero.value : null,
      miningDutch: dutch.status === "fulfilled" ? dutch.value : null,
    };
  } catch (err) {
    console.error("[WS:all] Error:", err.message);
    throw err;
  }
}

// ✅ Send price update to client
async function sendPriceUpdate(ws) {
  try {
    if (ws.readyState !== 1) return;
    
    const btcPrice = await getBtcPrice().catch(() => 65000);
    ws.send(JSON.stringify({
      type: 'price_update',
      data: {
        BTC: btcPrice || 65000,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    }));
  } catch (err) {
    console.error('[WS] Price update error:', err.message);
  }
}

export const handlers = {
  handleHeroMiners,
  handleMiningDutch,
  handleAll,
};