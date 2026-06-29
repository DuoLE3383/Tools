import React from 'react';
import { useWebSocket } from './WebSocketContext';

export function WebSocketStatus() {
  const { isConnected, isConnecting, error } = useWebSocket();

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
      <span style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: isConnected ? '#10b981' : isConnecting ? '#fbbf24' : '#ef4444',
      }} />
      <span style={{ color: '#94a3b8' }}>
        {isConnected ? 'Live' : isConnecting ? 'Connecting...' : error ? 'Error' : 'Offline'}
      </span>
    </div>
  );
}