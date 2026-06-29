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
  const MAX_RECONNECT_ATTEMPTS = 5;

  const connect = useCallback(() => {
    if (!token) {
      console.log('[WS] No token available - skipping connection');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[WS] Already connected');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      console.log('[WS] Connection in progress');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/api/v2/prices/ws?token=${encodeURIComponent(token)}`;
      
      console.log('[WS] Connecting...');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const timeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.warn('[WS] Connection timeout');
          ws.close();
          setIsConnecting(false);
          setError('Connection timeout');
        }
      }, 10000);

      ws.onopen = () => {
        console.log('[WS] Connected');
        clearTimeout(timeout);
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttempts.current = 0;

        // ✅ Send initial ping
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

      ws.onerror = (event) => {
        console.error('[WS] Error:', event);
        setError('WebSocket error');
        setIsConnecting(false);
      };

      ws.onclose = (event) => {
        console.log(`[WS] Disconnected: ${event.code}`);
        clearTimeout(timeout);
        setIsConnected(false);
        setIsConnecting(false);
        wsRef.current = null;

        // ✅ Only reconnect if we have a token
        if (token && event.code !== 1000 && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(3000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`[WS] Reconnecting in ${delay}ms...`);
          
          reconnectTimerRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        }
      };
    } catch (err) {
      console.error('[WS] Connection error:', err);
      setError(err.message);
      setIsConnecting(false);
    }
  }, [token]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    
    if (wsRef.current) {
      try {
        wsRef.current.close(1000, 'Client disconnected');
      } catch (err) {
        // Ignore
      }
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

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

  // Auto-connect when token becomes available
  useEffect(() => {
    if (autoConnect && token) {
      const timer = setTimeout(() => {
        connect();
      }, 500);
      return () => clearTimeout(timer);
    }
    return () => {
      disconnect();
    };
  }, [token, autoConnect]);

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