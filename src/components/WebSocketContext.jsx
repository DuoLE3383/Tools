import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const WebSocketContext = createContext(null);

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
    // ✅ Don't connect if no token
    if (!token) {
      console.log('[WS] No token available, skipping connection');
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
      // ✅ Use relative path with token
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/v2/prices/ws?token=${encodeURIComponent(token)}`;
      console.log('[WS] Connecting...');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected');
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttempts.current = 0;

        // Send ping to start communication
        ws.send(JSON.stringify({ type: 'ping' }));
        ws.send(JSON.stringify({ type: 'get_prices' }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WS] Received:', data.type);
          setLastMessage(data);

          if (data.type === 'price_update' && data.data) {
            setPrices(data.data);
          }
        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('[WS] Error:', event);
        setError('WebSocket error');
        setIsConnecting(false);
      };

      ws.onclose = (event) => {
        console.log(`[WS] Disconnected: ${event.code}`);
        setIsConnected(false);
        setIsConnecting(false);
        wsRef.current = null;

        // ✅ Only reconnect if we have a token
        if (token && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = 3000 * Math.pow(2, reconnectAttempts.current);
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
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const sendMessage = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(data));
        return true;
      } catch (err) {
        console.error('[WS] Send error:', err);
        return false;
      }
    }
    return false;
  }, []);

  // ✅ Auto-connect only when token is available
  useEffect(() => {
    if (autoConnect && token) {
      connect();
    } else if (!token && wsRef.current) {
      // ✅ Disconnect if token is removed
      disconnect();
    }
    return () => {
      disconnect();
    };
  }, [token, autoConnect, connect, disconnect]);

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

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}