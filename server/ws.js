// server/ws.js - Fixed and Complete Version
import { WebSocketServer } from 'ws';
import url from 'url';
import { scrapeHeroMinersGlobal } from './miners/heroMiners.js';
import { scrapeMiningDutchGlobal } from './miners/miningDutch.js';
import { verifyToken } from './auth.js';
import { getBtcPrice } from './utils/priceUtils.js';
import { WS_PATH } from './constants.js';

// ============================================
// STATE
// ============================================
let wss = null;

// ============================================
// ACTION HANDLERS
// ============================================
const ACTION_HANDLERS = {
  herominers: handleHeroMiners,
  miningDutch: handleMiningDutch,
  all: handleAll,
};

// ============================================
// SETUP WEBSOCKET SERVER
// ============================================
export function setupWebSocket(server) {
  if (!server) {
    throw new Error('[WS] Server instance required');
  }

  wss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests
  server.on('upgrade', async (request, socket, head) => {
    const { pathname, query } = url.parse(request.url, true);

    if (pathname !== WS_PATH) {
      socket.destroy();
      return;
    }

    try {
      const token = query.token ||
                    request.headers.authorization?.replace('Bearer ', '') ||
                    (request.url.includes('?token=') ? new URLSearchParams(request.url.split('?')[1]).get('token') : null);

      if (!token) throw new Error('No token provided');

      const user = await verifyToken(token);
      if (!user) throw new Error('Invalid or expired token');

      // Attach user to the request for use in the connection handler
      request.user = user;

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch (err) {
      console.error(`[WS] Auth failed: ${err.message}`);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  // Handle WebSocket connections
  wss.on('connection', (ws, request) => {
    const user = request?.user;
    console.log(`[WS] Client connected${user ? ` (${user.username || user.id})` : ''}`);

    // Initialize keep-alive state
    ws.isAlive = true;

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'WebSocket connection established',
      timestamp: new Date().toISOString(),
      user: user?.username || 'anonymous',
    }));

    // Handle messages
    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const { requestId, action, client, rigid, coin, force } = msg;

        const handler = ACTION_HANDLERS[action];
        if (!handler) {
          ws.send(JSON.stringify({
            requestId,
            success: false,
            error: `Unknown action: ${action}`,
            availableActions: Object.keys(ACTION_HANDLERS),
          }));
          return;
        }

        // Execute handler with timeout
        const timeoutMs = 30000; // 30 seconds
        const data = await Promise.race([
          handler({ client, rigid, coin, force }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
          ),
        ]);

        ws.send(JSON.stringify({
          requestId,
          success: true,
          action,
          data,
          timestamp: new Date().toISOString(),
        }));
      } catch (err) {
        try {
          const msg = JSON.parse(raw.toString());
          ws.send(JSON.stringify({
            requestId: msg.requestId,
            success: false,
            action: msg.action,
            error: err.message,
            timestamp: new Date().toISOString(),
          }));
        } catch (parseError) {
          ws.send(JSON.stringify({
            success: false,
            error: 'Invalid request format',
            timestamp: new Date().toISOString(),
          }));
        }
      }
    });

    // Handle pong for keep-alive
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle close
    ws.on('close', (code, reason) => {
      console.log(`[WS] Client disconnected (code: ${code}, reason: ${reason || 'none'})`);
    });

    // Handle errors
    ws.on('error', (err) => {
      console.error('[WS] Client error:', err.message);
    });
  });

  // Ping/pong keep-alive
  const pingInterval = setInterval(() => {
    if (!wss) return;
    
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log('[WS] Terminating inactive connection');
        return ws.terminate();
      }
      
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  // Clean up interval on server close
  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  console.log(`[WS] WebSocket server initialized at ${WS_PATH}`);
  return wss;
}

// ============================================
// HERO MINERS HANDLER
// ============================================
async function handleHeroMiners(options) {
  try {
    const force = options?.force || false;
    const btcPrice = await getBtcPrice();
    const result = await scrapeHeroMinersGlobal(btcPrice);
    
    return {
      success: result.success || false,
      coinStats: result.coinStats || [],
      miners: result.miners || 0,
      fetchedAt: new Date().toISOString(),
      error: result.error || null,
    };
  } catch (err) {
    console.error('[WS:hero] Error:', err.message);
    throw new Error(`Failed to fetch HeroMiners data: ${err.message}`);
  }
}

// ============================================
// MINING DUTCH HANDLER
// ============================================
async function handleMiningDutch(options) {
  try {
    const force = options?.force || false;
    const btcPrice = await getBtcPrice();
    const result = await scrapeMiningDutchGlobal(btcPrice, force);
    
    return {
      success: result.success || false,
      coinStats: result.coinStats || [],
      fetchedAt: new Date().toISOString(),
      error: result.error || null,
    };
  } catch (err) {
    console.error('[WS:dutch] Error:', err.message);
    throw new Error(`Failed to fetch Mining-Dutch data: ${err.message}`);
  }
}

// ============================================
// ALL HANDLER
// ============================================
async function handleAll(options) {
  try {
    const [hero, dutch] = await Promise.allSettled([
      handleHeroMiners(options),
      handleMiningDutch(options),
    ]);

    const results = {
      herominers: hero.status === 'fulfilled' ? hero.value : null,
      miningDutch: dutch.status === 'fulfilled' ? dutch.value : null,
    };

    // Add error information if any failed
    if (hero.status === 'rejected') {
      results.herominers = { 
        error: hero.reason?.message || 'Failed to fetch HeroMiners',
        fetchedAt: new Date().toISOString(),
      };
    }
    if (dutch.status === 'rejected') {
      results.miningDutch = {
        error: dutch.reason?.message || 'Failed to fetch Mining-Dutch',
        fetchedAt: new Date().toISOString(),
      };
    }

    return results;
  } catch (err) {
    console.error('[WS:all] Error:', err.message);
    throw new Error(`Failed to fetch all data: ${err.message}`);
  }
}

// ============================================
// BROADCAST UTILITY
// ============================================
export function broadcast(data) {
  if (!wss) {
    console.warn('[WS] Broadcast called but WebSocket server not initialized');
    return;
  }

  const payload = JSON.stringify({
    ...data,
    timestamp: new Date().toISOString(),
  });

  let sentCount = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      try {
        client.send(payload);
        sentCount++;
      } catch (err) {
        console.error(`[WS] Broadcast failed for one client: ${err.message}`);
      }
    }
  });

  console.log(`[WS] Broadcast sent to ${sentCount} clients`);
}

// ============================================
// UTILITY TO GET CONNECTION COUNT
// ============================================
export function getConnectionCount() {
  if (!wss) return 0;
  return wss.clients.size;
}

// ============================================
// UTILITY TO CLOSE ALL CONNECTIONS
// ============================================
export function closeAllConnections(code = 1000, reason = 'Server shutdown') {
  if (!wss) return;
  
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.close(code, reason);
    }
  });
}

// ============================================
// EXPORT HANDLERS FOR TESTING
// ============================================
export const handlers = {
  handleHeroMiners,
  handleMiningDutch,
  handleAll,
};