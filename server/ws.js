// server/ws.js - FIXED

import { WebSocketServer as WSS } from "ws";
import { verifyToken } from "./auth.js";
import { scrapeHeroMinersGlobal } from "./miners/heroMiners.js";
import { scrapeMiningDutchGlobal } from "./miners/miningDutch.js";
import { getBtcPrice } from "./utils/priceUtils.js";

const ACTION_HANDLERS = {
  herominers: handleHeroMiners,
  miningDutch: handleMiningDutch,
  all: handleAll,
  ping: handlePing,
  get_prices: handleGetPrices, // ✅ Add get_prices handler
};

// ✅ Handle ping messages
async function handlePing(options) {
  return {
    pong: {
      timestamp: new Date().toISOString(),
      message: 'pong'
    }
  };
}

// ✅ Handle get_prices
async function handleGetPrices(options) {
  const btcPrice = await getBtcPrice().catch(() => 65000);
  return {
    prices: {
      BTC: btcPrice || 65000,
      timestamp: new Date().toISOString()
    }
  };
}

export function setupWebSocket(server) {
  console.log('[WS] Setting up WebSocket server...');

  const wss = new WSS({ 
    server, 
    path: "/api/v2/prices/ws",
    verifyClient: (info, cb) => {
      try {
        const url = new URL(info.req.url, `http://${info.req.headers.host}`);
        const token = url.searchParams.get('token');
        
        console.log('[WS] Verifying client, token present:', !!token);
        
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
    try {
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'WebSocket connection established',
        timestamp: new Date().toISOString()
      }));
    } catch (err) {
      console.error('[WS] Failed to send connection confirmation:', err.message);
    }

    ws.on("message", async (raw) => {
      try {
        // ✅ Skip empty messages
        if (!raw || raw.length === 0) {
          console.log('[WS] Empty message received, ignoring');
          return;
        }

        // ✅ Parse the message
        let msg;
        try {
          const rawStr = raw.toString();
          msg = JSON.parse(rawStr);
        } catch (parseErr) {
          console.error('[WS] Invalid JSON:', raw.toString().substring(0, 100));
          return;
        }

        // ✅ Check if message has action or type
        const action = msg.action || msg.type;
        if (!action) {
          console.log('[WS] Message without action/type:', msg);
          return;
        }

        const { requestId, client, rigid, coin, force } = msg;
        console.log(`[WS] Received action: ${action}`, { requestId, client });

        const handler = ACTION_HANDLERS[action];
        if (!handler) {
          console.warn(`[WS] Unknown action: ${action}`);
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              requestId: requestId || Date.now().toString(),
              success: false,
              error: `Unknown action: ${action}`,
              timestamp: new Date().toISOString()
            }));
          }
          return;
        }

        const data = await handler({ client, rigid, coin, force });
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ 
            requestId: requestId || Date.now().toString(),
            success: true, 
            action, 
            data,
            timestamp: new Date().toISOString()
          }));
        }
      } catch (err) {
        console.error('[WS] Message error:', err.message);
        try {
          const msg = JSON.parse(raw.toString());
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              requestId: msg.requestId || Date.now().toString(),
              success: false,
              action: msg.action || msg.type,
              error: err.message,
              timestamp: new Date().toISOString()
            }));
          }
        } catch {
          // Ignore - can't parse the message
        }
      }
    });

    ws.on("close", (code, reason) => {
      console.log(`[WS] Client disconnected: ${code}`);
    });

    ws.on("error", (err) => {
      console.error("[WS] Client error:", err.message);
    });

    // ✅ Send initial price data
    sendPriceUpdate(ws);
  });

  // ✅ Heartbeat ping every 30 seconds
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === 1) {
        try {
          ws.ping();
        } catch (err) {
          console.error('[WS] Ping error:', err.message);
        }
      }
    });
  }, 30000);

  // ✅ Clean up on server close
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  console.log("[WS] WebSocket server initialized at /api/v2/prices/ws");
  return wss;
}

// ✅ Handler functions
async function handleHeroMiners(options) {
  try {
    const force = options?.force || false;
    const btcPrice = await getBtcPrice().catch(() => 65000);
    const result = await scrapeHeroMinersGlobal(btcPrice);
    
    return {
      herominers: {
        success: result.success !== false,
        coinStats: result.coinStats || [],
        miners: result.miners || 0,
        fetchedAt: new Date().toISOString(),
        error: result.error || null,
      },
    };
  } catch (err) {
    console.error("[WS:hero] Error:", err.message);
    return {
      herominers: {
        success: false,
        coinStats: [],
        miners: 0,
        fetchedAt: new Date().toISOString(),
        error: err.message,
      },
    };
  }
}

async function handleMiningDutch(options) {
  try {
    const force = options?.force || false;
    const btcPrice = await getBtcPrice().catch(() => 65000);
    const result = await scrapeMiningDutchGlobal(btcPrice, force);
    
    return {
      miningdutch: {
        success: result.success !== false,
        coinStats: result.coinStats || [],
        fetchedAt: new Date().toISOString(),
        error: result.error || null,
      },
    };
  } catch (err) {
    console.error("[WS:dutch] Error:", err.message);
    return {
      miningdutch: {
        success: false,
        coinStats: [],
        fetchedAt: new Date().toISOString(),
        error: err.message,
      },
    };
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

async function sendPriceUpdate(ws) {
  try {
    if (ws.readyState !== 1) return;
    
    const btcPrice = await getBtcPrice().catch(() => 65000);
    
    const message = JSON.stringify({
      type: 'price_update',
      data: {
        BTC: btcPrice || 65000,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
    
    ws.send(message);
  } catch (err) {
    console.error('[WS] Price update error:', err.message);
  }
}

export const handlers = {
  handleHeroMiners,
  handleMiningDutch,
  handleAll,
  handlePing,
  handleGetPrices,
};