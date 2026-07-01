// client.js
class SessionManager {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.sessions = new Map();
    this.wsConnections = new Map();
  }

  async createSession(clientId) {
    const response = await fetch(`${this.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        action: 'create',
        clientId: clientId
      })
    });
    
    const data = await response.json();
    if (data.success) {
      this.sessions.set(data.sessionId, { active: true, clientId });
      return data.sessionId;
    }
    throw new Error(data.error);
  }

  async disableSession(sessionId) {
    const response = await fetch(`${this.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'disable',
        sessionId: sessionId
      })
    });
    
    const data = await response.json();
    if (data.success) {
      this.sessions.set(sessionId, { ...this.sessions.get(sessionId), active: false });
      return true;
    }
    throw new Error(data.error);
  }

  async enableSession(sessionId) {
    const response = await fetch(`${this.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'enable',
        sessionId: sessionId
      })
    });
    
    const data = await response.json();
    if (data.success) {
      this.sessions.set(sessionId, { ...this.sessions.get(sessionId), active: true });
      return true;
    }
    throw new Error(data.error);
  }

  async listSessions(clientId) {
    const response = await fetch(`${this.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'list',
        clientId: clientId
      })
    });
    
    const data = await response.json();
    if (data.success) {
      return data.sessions;
    }
    throw new Error(data.error);
  }

  // ✅ Fixed WebSocket connection - uses query params instead of headers
  createWebSocket(sessionId) {
    // Check if session exists and is active
    const session = this.sessions.get(sessionId);
    if (!session || !session.active) {
      throw new Error(`Session ${sessionId} is not active`);
    }
    
    // ✅ Use query parameter instead of headers
    const wsUrl = new URL(`${this.baseUrl.replace('http://', 'ws://').replace('https://', 'wss://')}/ws`);
    wsUrl.searchParams.set('sessionId', sessionId);
    
    console.log(`[WS] Connecting to: ${wsUrl.toString()}`);
    
    const ws = new WebSocket(wsUrl.toString());
    
    ws.onopen = () => {
      console.log(`[WS] Session ${sessionId} connected`);
      this.wsConnections.set(sessionId, ws);
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`[WS] Session ${sessionId} received:`, data.type);
        this.handleWebSocketMessage(sessionId, data);
      } catch (error) {
        console.error('[WS] Error parsing message:', error);
      }
    };
    
    ws.onclose = (event) => {
      console.log(`[WS] Session ${sessionId} disconnected: ${event.code} - ${event.reason}`);
      this.wsConnections.delete(sessionId);
      
      // Auto-reconnect if not intentionally closed
      if (event.code !== 1000) {
        setTimeout(() => {
          if (this.sessions.get(sessionId)?.active) {
            console.log(`[WS] Reconnecting session ${sessionId}...`);
            this.createWebSocket(sessionId);
          }
        }, 3000);
      }
    };
    
    ws.onerror = (error) => {
      console.error(`[WS] Session ${sessionId} error:`, error);
    };
    
    return ws;
  }

  handleWebSocketMessage(sessionId, data) {
    switch (data.type) {
      case 'connected':
        console.log(`[WS] Session ${sessionId} connected to server`);
        break;
      case 'subscribed':
        console.log(`[WS] Session ${sessionId} subscribed to: ${data.channel}`);
        break;
      case 'error':
        console.error(`[WS] Session ${sessionId} error:`, data.message);
        break;
      default:
        // Handle other message types
        break;
    }
  }

  // ✅ Send message through WebSocket
  sendMessage(sessionId, type, data = {}) {
    const ws = this.wsConnections.get(sessionId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn(`[WS] Cannot send message: Session ${sessionId} is not connected`);
      return false;
    }
    
    ws.send(JSON.stringify({ type, ...data }));
    return true;
  }

  // ✅ Close WebSocket connection
  closeWebSocket(sessionId) {
    const ws = this.wsConnections.get(sessionId);
    if (ws) {
      ws.close(1000, 'Client disconnected');
      this.wsConnections.delete(sessionId);
    }
  }

  // ✅ Disconnect all WebSocket connections
  disconnectAll() {
    this.wsConnections.forEach((ws, sessionId) => {
      ws.close(1000, 'Client disconnected');
    });
    this.wsConnections.clear();
  }
}

// Usage example
async function exampleUsage() {
  const manager = new SessionManager('http://localhost:3003');
  
  try {
    // Create 3 sessions for a client
    const clientId = 'client-123';
    const sessionIds = await Promise.all([
      manager.createSession(clientId),
      manager.createSession(clientId),
      manager.createSession(clientId)
    ]);

    console.log('Sessions created:', sessionIds);

    // Create WebSocket connections for each session
    sessionIds.forEach(sessionId => {
      manager.createWebSocket(sessionId);
    });

    // Disable only session 2
    await manager.disableSession(sessionIds[1]);
    console.log('Session 2 disabled, but sessions 1 and 3 remain active');

    // List active sessions
    const sessions = await manager.listSessions(clientId);
    console.log('All sessions:', sessions);

    // Send a message through session 1
    manager.sendMessage(sessionIds[0], 'subscribe', { channel: 'rentals' });

    // Wait a bit then disconnect
    await new Promise(resolve => setTimeout(resolve, 5000));
    manager.disconnectAll();

  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the example
exampleUsage();

export { SessionManager };