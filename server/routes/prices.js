// server/routes/prices.js — WebSocket endpoint for real-time price updates
import { WebSocketServer as WSS } from 'ws';

export function setupPriceWebSocket(server) {
  const wss = new WSS({ server, path: '/api/v2/prices/ws' });

  wss.on('connection', (ws) => {
    console.log('[WS:prices] Client connected');

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'subscribe') {
          ws.send(JSON.stringify({ type: 'subscribed', symbols: msg.symbols }));
        }
      } catch {
        // ignore invalid messages
      }
    });

    ws.on('close', () => {
      console.log('[WS:prices] Client disconnected');
    });

    ws.on('error', (err) => {
      console.error('[WS:prices] Error:', err.message);
    });

    // Send initial acknowledgment
    ws.send(JSON.stringify({ type: 'connected', message: 'Price WebSocket ready' }));
  });

  console.log('[WS:prices] WebSocket initialized at /api/v2/prices/ws');
  return wss;
}
