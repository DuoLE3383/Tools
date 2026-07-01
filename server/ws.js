// server/ws.js
import { WebSocketServer } from 'ws';
import { parse } from 'url';
import { verifyToken } from './auth.js';

export function setupWebSocket(server) {
  const wss = new WebSocketServer({
    server,
    path: '/api/v2/prices/ws',
    verifyClient: (info, cb) => {
      const { query } = parse(info.req.url, true);
      let token = query.token;

      // Fallback to Authorization header for non-browser clients
      if (!token && info.req.headers.authorization) {
        const authHeader = info.req.headers.authorization;
        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7).trim();
        }
      }

      if (!token) {
        console.log('[WS] Connection rejected: No token provided.');
        cb(false, 401, 'Unauthorized');
        return;
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        console.log('[WS] Connection rejected: Invalid token');
        cb(false, 401, 'Invalid token');
        return;
      }
      info.req.user = decoded;
      console.log(`[WS] Connection verified for user: ${decoded.username || decoded.id || 'unknown'}`);
      cb(true);
    }
  });

  wss.on('connection', (ws, req) => {
    // The user object is attached during verifyClient
    const sessionId = req.user?.username || req.user?.id || 'unknown-session';
    const user = req.user;
    const clientId = user?.username || sessionId || 'unknown';
    console.log(`[WS] Connection established for client: ${clientId}`);
    
    ws.sessionId = sessionId;
    ws.user = user;
    ws.isAlive = true;
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'WebSocket connection established',
      client: clientId
    }));
    
    // Handle messages
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        console.log(`[WS] Message from session ${sessionId}:`, data.type);
        handleWebSocketMessage(ws, data);
      } catch (error) {
        console.error('[WS] Error processing message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });
    
    // Handle pong for keep-alive
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    
    // Handle close
    ws.on('close', () => {
      console.log(`[WS] Connection closed for session: ${sessionId}`);
    });
    
    // Handle errors
    ws.on('error', (error) => {
      console.error('[WS] Connection error:', error);
    });
  });

  // Ping/pong to keep connections alive
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log('[WS] Terminating inactive connection');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  return wss;
}

function handleWebSocketMessage(ws, data) {
  switch (data.type) {
    case 'ping':
      ws.send(JSON.stringify({ 
        type: 'pong', 
        timestamp: Date.now() 
      }));
      break;
      
    case 'subscribe':
      // Handle subscription logic
      if (!ws.subscriptions) {
        ws.subscriptions = new Set();
      }
      ws.subscriptions.add(data.channel);
      ws.send(JSON.stringify({
        type: 'subscribed',
        channel: data.channel
      }));
      break;
      
    default:
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${data.type}`
      }));
  }
}