// server/ws.js - SIMPLIFIED WORKING VERSION

import { WebSocketServer } from 'ws';
import { verifyToken } from './auth.js';
import { scrapeHeroMinersGlobal } from "./miners/heroMiners.js";
import { scrapeMiningDutchGlobal } from "./miners/miningDutch.js";
import { getBtcPrice } from "./utils/priceUtils.js";

export function setupWebSocket(server) {
  console.log('[WS] Setting up WebSocket server...');

  const wss = new WebSocketServer({
    server,
    path: '/api/v2/prices/ws',
  });

  wss.on('connection', (ws, req) => {
    console.log('[WS] Client connected');

    // ✅ Send initial connection message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'WebSocket connection established',
      timestamp: new Date().toISOString()
    }));

    // ✅ Handle messages
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        console.log('[WS] Received:', data.type || 'unknown');

        switch (data.type) {
          case 'ping':
            ws.send(JSON.stringify({ 
              type: 'pong', 
              timestamp: new Date().toISOString() 
            }));
            break;

          case 'get_prices':
            await sendPriceUpdate(ws);
            break;

          case 'subscribe':
            ws.send(JSON.stringify({
              type: 'subscribed',
              topics: data.topics || [],
              timestamp: new Date().toISOString()
            }));
            break;

          default:
            ws.send(JSON.stringify({
              type: 'error',
              message: `Unknown message type: ${data.type}`,
              timestamp: new Date().toISOString()
            }));
        }
      } catch (err) {
        console.error('[WS] Message error:', err.message);
        ws.send(JSON.stringify({
          type: 'error',
          message: err.message,
          timestamp: new Date().toISOString()
        }));
      }
    });

    ws.on('close', () => {
      console.log('[WS] Client disconnected');
    });

    ws.on('error', (err) => {
      console.error('[WS] Connection error:', err.message);
    });

    // ✅ Send initial price data
    sendPriceUpdate(ws);
  });

  console.log('[WS] WebSocket server initialized');
  return wss;
}

// Send price update to client
async function sendPriceUpdate(ws) {
  try {
    // Check if connection is still open
    if (ws.readyState !== 1) return;

    const [btcPrice, heroData, dutchData] = await Promise.all([
      getBtcPrice().catch(() => 65000),
      scrapeHeroMinersGlobal().catch(() => null),
      scrapeMiningDutchGlobal().catch(() => null)
    ]);

    ws.send(JSON.stringify({
      type: 'price_update',
      data: {
        BTC: btcPrice || 65000,
        timestamp: new Date().toISOString(),
        heroData: heroData || null,
        dutchData: dutchData || null
      },
      timestamp: new Date().toISOString()
    }));
  } catch (err) {
    console.error('[WS] Price update error:', err.message);
  }
}