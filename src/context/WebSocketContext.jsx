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
  const connectTimerRef = useRef(null);
  const wsRef = useRef(null);
  const connectInProgressRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const connect = useCallback(() => {
    // Guard against parallel connect calls
    if (connectInProgressRef.current) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    connectInProgressRef.current = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = localStorage.getItem('token');
    const wsUrl = `${protocol}//${window.location.host}/api/v2/prices/ws${token ? `?token=${token}` : ''}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setStatus('connecting');

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }
      console.log('[WS Provider] Connected');
      setStatus('connected');
      setSocket(ws);
      connectInProgressRef.current = false;
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const message = JSON.parse(event.data);
        listeners.current.forEach(callback => callback(message));
      } catch (err) {
        console.error('[WS Provider] Failed to parse message:', err);
      }
    };

    ws.onclose = () => {
      connectInProgressRef.current = false;
      wsRef.current = null;
      if (!mountedRef.current) return;
      console.log('[WS Provider] Disconnected');
      setStatus('disconnected');
      setSocket(null);
      // Simple reconnect logic
      connectTimerRef.current = setTimeout(connect, 5000);
    };

    ws.onerror = (err) => {
      if (!mountedRef.current) return;
      console.error('[WS Provider] Error:', err);
      setStatus('error');
      // onclose will fire next, triggering reconnect
    };
  }, []);

  useEffect(() => {
    const ws = connect();
    return () => {
      if (connectTimerRef.current) {
        clearTimeout(connectTimerRef.current);
        connectTimerRef.current = null;
      }
      if (wsRef.current) {
        // Only close if the connection is already established or still pending
        // This avoids the "closed before connection is established" error
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onopen = null;
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
      connectInProgressRef.current = false;
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
