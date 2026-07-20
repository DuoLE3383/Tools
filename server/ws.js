// server/ws.js
import { WebSocketServer } from 'ws';
import { parse } from 'url';
import { verifyToken } from './auth.js';

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (request, socket, head) => {
    const { pathname, query } = parse(request.url, true);

    if (!pathname.match(/^\/ws$/) && !pathname.match(/^\/api\/v2\/prices\/ws$/)) {
      socket.destroy();
      return;
    }

    let token = query.token;
    if (!token && request.headers.authorization) {
      const authHeader = request.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }
    }

    if (token) {
      try {
        const user = await verifyToken(token);
        if (user) {
          request.user = user;
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
          });
          return;
        }
      } catch (err) {
        console.error('[WS] Token verification failed during upgrade:', err);
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    const sessionId = query.sessionId;
    if (sessionId) {
      request.sessionId = sessionId;
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
      return;
    }

    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
  });

  wss.on('connection', (ws, req) => {
    const sessionId = req.sessionId;
    const user = req.user;
    ws.clientId = user?.username || sessionId || 'unknown';
    console.log(`[WS] Connection established for client: ${ws.clientId}`);
    
    ws.sessionId = sessionId; // Keep for compatibility if something uses it
    ws.user = user;
    ws.isAlive = true;
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'WebSocket connection established',
      client: ws.clientId
    }));
    
    // Handle messages
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        console.log(`[WS] Message from client ${ws.clientId}:`, data.type);
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
      console.log(`[WS] Connection closed for client: ${ws.clientId}`);
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