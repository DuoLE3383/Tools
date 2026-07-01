// server/ws.js
import { WebSocketServer } from 'ws';
import { parse } from 'url';
import { verifyToken } from './auth.js';

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ 
    server,
    path: /\/(ws|api\/v2\/prices\/ws)$/,
    verifyClient: (info, cb) => {
      const { req } = info;
      console.log('[WS] Handshake URL:', req.url);
      const { query } = parse(req.url, true);
      let token = query.token;
      const sessionId = query.sessionId;

      // Fallback to Authorization header
      if (!token && req.headers.authorization) {
        const authHeader = req.headers.authorization;
        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7).trim();
        }
      }

      if (token) {
        const decoded = verifyToken(token);
        console.log(`[WS] Verifying client, token present: ${!!decoded}`);
        if (!decoded) {
          console.log('[WS] Connection rejected: Invalid token');
          cb(false, 401, 'Invalid token');
          return;
        }
        req.user = decoded;
        console.log(`[WS] Connection verified for user: ${decoded.username || decoded.id || 'unknown'}`);
        cb(true);
        return;
      }

      if (!sessionId) {
        console.log('[WS] Connection rejected: No token or sessionId provided');
        cb(false, 401, 'No token or sessionId provided');
        return;
      }

      console.log(`[WS] Verifying client, sessionId present: ${!!sessionId}`);
      req.sessionId = sessionId;
      console.log(`[WS] Connection verified for session: ${sessionId}`);
      cb(true);
    }
  });

  wss.on('connection', (ws, req) => {
    const sessionId = req.sessionId;
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