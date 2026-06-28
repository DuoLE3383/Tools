// client.js

class SessionManager {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.sessions = new Map();
  }

  async createSession(clientId) {
    const response = await fetch(`${this.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        clientId: clientId
      })
    });
    
    const data = await response.json();
    if (data.success) {
      this.sessions.set(data.sessionId, { active: true });
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
      this.sessions.set(sessionId, { active: false });
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
      this.sessions.set(sessionId, { active: true });
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

  createWebSocket(sessionId) {
    const ws = new WebSocket(`${this.baseUrl}/ws`, {
      headers: {
        'X-Session-Id': sessionId
      }
    });
    
    ws.onopen = () => {
      console.log(`WebSocket session ${sessionId} connected`);
    };
    
    ws.onclose = () => {
      console.log(`WebSocket session ${sessionId} disconnected`);
    };
    
    return ws;
  }
}

// Usage example
const manager = new SessionManager('https://bonus-drawn-venues-garage.trycloudflare.com');

// Create 3 sessions for a client
const clientId = 'client-123';
const sessionIds = await Promise.all([
  manager.createSession(clientId),
  manager.createSession(clientId),
  manager.createSession(clientId)
]);

console.log('Sessions created:', sessionIds);

// Disable only session 2
await manager.disableSession(sessionIds[1]);
console.log('Session 2 disabled, but sessions 1 and 3 remain active');

// List active sessions
const sessions = await manager.listSessions(clientId);
console.log('All sessions:', sessions);