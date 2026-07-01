// server/websocket-handler.js
import { WebSocketServer } from 'ws';
import { parse } from 'url';
import { verifyToken } from './auth.js';

/**
 * Setup WebSocket server with authentication
 */
export function setupWebSocketServer(server) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient: (info, cb) => {
      const { req } = info;
      
      // Extract token from query params
      const { query } = parse(req.url, true);
      let token = query.token;
      
      // Fallback to Authorization header
      if (!token && req.headers.authorization) {
        const authHeader = req.headers.authorization;
        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7).trim();
        }
      }
      
      // Fallback: extract from URL if needed
      if (!token && req.url) {
        const match = req.url.match(/[?&]token=([^&]+)/);
        if (match) token = match[1];
      }
      
      console.log(`[WS] Verifying client, token present: ${!!token}`);
      
      if (!token) {
        console.log('[WS] Connection rejected: No token provided');
        cb(false, 401, 'No token provided');
        return;
      }
      
      const decoded = verifyToken(token);
      if (!decoded) {
        console.log('[WS] Connection rejected: Invalid token');
        cb(false, 401, 'Invalid token');
        return;
      }
      
      // Store user for later use
      req.user = decoded;
      console.log(`[WS] Connection verified for user: ${decoded.username || decoded.id || 'unknown'}`);
      cb(true);
    }
  });

  wss.on('connection', (ws, req) => {
    const user = req.user;
    console.log(`[WS] Connection established for user: ${user?.username || 'unknown'}`);
    
    ws.user = user;
    ws.isAlive = true;
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'WebSocket connection established',
      user: user?.username || 'anonymous'
    }));
    
    // Handle incoming messages
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
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
      console.log(`[WS] Connection closed for user: ${user?.username || 'unknown'}`);
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

/**
 * Handle WebSocket messages
 */
function handleWebSocketMessage(ws, data) {
  console.log(`[WS] Message from ${ws.user?.username || 'unknown'}:`, data.type);
  
  switch (data.type) {
    case 'ping':
      ws.send(JSON.stringify({ 
        type: 'pong', 
        timestamp: Date.now() 
      }));
      break;
      
    case 'subscribe':
      // Handle subscription logic
      handleSubscription(ws, data);
      break;
      
    case 'unsubscribe':
      // Handle unsubscription
      ws.send(JSON.stringify({ 
        type: 'unsubscribed', 
        channel: data.channel 
      }));
      break;
      
    case 'get_rentals':
      // Example: Get rentals data
      handleGetRentals(ws, data);
      break;
      
    default:
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: `Unknown message type: ${data.type}` 
      }));
  }
}

/**
 * Handle subscription requests
 */
function handleSubscription(ws, data) {
  const channel = data.channel;
  
  if (!channel) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Channel name required for subscription'
    }));
    return;
  }
  
  // Store subscription
  if (!ws.subscriptions) {
    ws.subscriptions = new Set();
  }
  ws.subscriptions.add(channel);
  
  ws.send(JSON.stringify({
    type: 'subscribed',
    channel: channel,
    message: `Subscribed to ${channel}`
  }));
  
  console.log(`[WS] User ${ws.user?.username} subscribed to ${channel}`);
}

/**
 * Handle get rentals request
 */
function handleGetRentals(ws, data) {
  // Example: Fetch rentals data
  ws.send(JSON.stringify({
    type: 'rentals_data',
    data: {
      rentals: [],
      timestamp: Date.now()
    }
  }));
}