import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const WebSocketContext = createContext(null);

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

export function WebSocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState('disconnected');
  const listeners = useRef(new Map());

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = localStorage.getItem('token');
    const wsUrl = `${protocol}//${window.location.host}/api/v2/prices/ws${token ? `?token=${token}` : ''}`;

    const ws = new WebSocket(wsUrl);
    setStatus('connecting');

    ws.onopen = () => {
      console.log('[WS Provider] Connected');
      setStatus('connected');
      setSocket(ws);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        // Notify all listeners
        listeners.current.forEach(callback => callback(message));
      } catch (err) {
        console.error('[WS Provider] Failed to parse message:', err);
      }
    };

    ws.onclose = () => {
      console.log('[WS Provider] Disconnected');
      setStatus('disconnected');
      setSocket(null);
      // Simple reconnect logic
      setTimeout(connect, 5000);
    };

    ws.onerror = (err) => {
      console.error('[WS Provider] Error:', err);
      setStatus('error');
      ws.close(); // This will trigger onclose and the reconnect logic
    };

    return ws;
  }, []);

  useEffect(() => {
    const ws = connect();
    return () => {
      ws.close();
    };
  }, [connect]);

  const subscribe = useCallback((id, callback) => {
    listeners.current.set(id, callback);
  }, []);

  const unsubscribe = useCallback((id) => {
    listeners.current.delete(id);
  }, []);

  const sendMessage = useCallback((message) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      console.warn('[WS Provider] Cannot send message, socket not open.');
    }
  }, [socket]);

  const value = {
    status,
    subscribe,
    unsubscribe,
    sendMessage,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}