// components/WebSocketContext.jsx - COMPLETE WITH EXPORTS

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const WebSocketContext = createContext(null);

// ✅ Make sure this is exported
export function WebSocketProvider({ children, token, autoConnect = true }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [error, setError] = useState(null);
  const [prices, setPrices] = useState({});
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const connectTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const tokenRef = useRef(token);
  const connectInProgressRef = useRef(false);
  const MAX_RECONNECT_ATTEMPTS = 5;

  // Keep tokenRef in sync without triggering re-renders
  tokenRef.current = token;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (connectTimerRef.current) {
      clearTimeout(connectTimerRef.current);
      connectTimerRef.current = null;
    }
    connectInProgressRef.current = false;
    
    if (wsRef.current) {
      // Null out handlers before closing to prevent reconnect trigger
      wsRef.current.onopen = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      try { wsRef.current.close(1000, 'Client disconnected'); } catch {}
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const connect = useCallback(() => {
    const currentToken = tokenRef.current;
    if (!currentToken) {
      console.log('[WS] No token available - skipping connection');
      return;
    }

    // Prevent concurrent connection attempts
    if (connectInProgressRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[WS] Already connected');
      return;
    }
    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      console.log('[WS] Connection in progress');
      return;
    }

    connectInProgressRef.current = true;
    setIsConnecting(true);
    setError(null);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/v2/prices/ws?token=${encodeURIComponent(currentToken)}`;
    
    console.log('[WS] Connecting...');

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    const timeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.warn('[WS] Connection timeout');
        connectInProgressRef.current = false;
        ws.onclose = null;
        ws.onerror = null;
        ws.onopen = null;
        try { ws.close(); } catch {}
        if (wsRef.current === ws) wsRef.current = null;
        setIsConnecting(false);
        setError('Connection timeout');
      }
    }, 10000);

    ws.onopen = () => {
      clearTimeout(timeout);
      connectInProgressRef.current = false;
      if (!mountedRef.current) {
        ws.onclose = null;
        ws.onerror = null;
        try { ws.close(); } catch {}
        return;
      }
      console.log('[WS] Connected');
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
      reconnectAttempts.current = 0;

      try {
        ws.send(JSON.stringify({ 
          type: 'ping',
          action: 'ping',
          requestId: Date.now().toString()
        }));
      } catch (err) {
        console.error('[WS] Failed to send initial ping:', err);
      }
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        if (!event.data) return;
        const data = JSON.parse(event.data);
        
        if (data.type) {
          console.log('[WS] Received:', data.type);
        }
        
        setLastMessage(data);

        if (data.type === 'price_update' && data.data) {
          setPrices(prev => ({ ...prev, ...data.data }));
        }
      } catch (err) {
        if (event.data && event.data.length > 0) {
          console.error('[WS] Parse error:', err.message);
        }
      }
    };

    ws.onerror = () => {
      connectInProgressRef.current = false;
      if (!mountedRef.current) return;
      setError('WebSocket error');
      setIsConnecting(false);
      // onclose will fire next
    };

    ws.onclose = (event) => {
      clearTimeout(timeout);
      connectInProgressRef.current = false;
      if (wsRef.current === ws) wsRef.current = null;
      if (!mountedRef.current) return;
      console.log(`[WS] Disconnected: ${event.code}`);
      setIsConnected(false);
      setIsConnecting(false);

      const currentToken = tokenRef.current;
      if (currentToken && event.code !== 1000 && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(3000 * Math.pow(2, reconnectAttempts.current), 30000);
        console.log(`[WS] Reconnecting in ${delay}ms...`);
        
        reconnectTimerRef.current = setTimeout(() => {
          reconnectAttempts.current++;
          connect();
        }, delay);
      }
    };
  }, []); // Empty deps — stable reference, uses tokenRef internally

  // Auto-connect when token becomes available
  useEffect(() => {
    if (autoConnect && token) {
      // Clear any stale reconnect timer before starting fresh
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      reconnectAttempts.current = 0;
      connectTimerRef.current = setTimeout(() => {
        connect();
      }, 500);
      return () => {
        if (connectTimerRef.current) {
          clearTimeout(connectTimerRef.current);
          connectTimerRef.current = null;
        }
      };
    }
    if (!token) {
      // No token — clean up everything
      disconnect();
      return;
    }
  }, [token, autoConnect]); // Only reconnect when token actually changes

  const sendMessage = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        const message = {
          ...data,
          requestId: data.requestId || Date.now().toString(),
          timestamp: new Date().toISOString()
        };
        wsRef.current.send(JSON.stringify(message));
        return true;
      } catch (err) {
        console.error('[WS] Send error:', err);
        return false;
      }
    }
    console.warn('[WS] Cannot send message: not connected');
    return false;
  }, []);

  const value = {
    isConnected,
    isConnecting,
    lastMessage,
    error,
    prices,
    connect,
    disconnect,
    sendMessage,
    isReady: isConnected && !error && !!token,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

// ✅ Make sure this is exported
export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

// ✅ Also export the context itself if needed
export { WebSocketContext };
