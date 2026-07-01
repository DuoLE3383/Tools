// src/components/mining/PoolMonitor.jsx
import React, { useState, useCallback } from 'react';

const POOL_OPTIONS = [
  { value: 'herominers', label: 'HeroMiners' },
  { value: '2miners', label: '2Miners' },
];

const StatsDisplay = ({ data }) => {
  if (!data) return null;

  return (
    <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
      <h3 style={{ marginTop: 0, color: '#34d399' }}>{data.source} Stats</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
        <div><strong>Current Hashrate:</strong> {data.hashrate}</div>
        <div><strong>24h Avg Hashrate:</strong> {data.hashrate_24h}</div>
        <div><strong>Pending Balance:</strong> {data.balance}</div>
        <div><strong>Total Paid:</strong> {data.paid}</div>
        <div><strong>Workers Online:</strong> {data.workersOnline}</div>
        <div><strong>Last Share:</strong> {data.lastShare}</div>
      </div>
    </div>
  );
};

export default function PoolMonitor({ onCall, onNavigate }) {
  const [pool, setPool] = useState('herominers');
  const [coin, setCoin] = useState('qrl');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  const handleFetchStats = useCallback(async () => {
    if (!address.trim()) {
      setError('Wallet address is required.');
      return;
    }

    setLoading(true);
    setError(null);
    setStats(null);

    try {
      // Use the onCall prop for API requests
      const result = await onCall(`/api/v2/pool/${pool}/${coin}/${address}`, {
        method: 'GET',
        silent: true, // To avoid global loading states
      });

      if (!result || !result.success) {
        throw new Error(result.error || 'Failed to fetch stats.');
      }

      setStats(result.data || result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pool, coin, address]);

  return (
    <div style={{ padding: '20px', maxWidth: '700px', margin: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <button onClick={() => onNavigate('/')} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px' }}>
          &larr; Back to Dashboard
        </button>
        <h2 style={{ margin: 0 }}>
          External Pool Monitor
        </h2>
        <div style={{ width: '120px' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: '#2d3748', padding: '24px', borderRadius: '8px' }}>
        {/* Pool Selection */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {POOL_OPTIONS.map(option => (
            <button
              key={option.value}
              onClick={() => setPool(option.value)}
              style={{
                flex: 1,
                padding: '10px',
                fontSize: '14px',
                border: '1px solid #4a5568',
                borderRadius: '6px',
                cursor: 'pointer',
                background: pool === option.value ? '#34d399' : '#4a5568',
                color: pool === option.value ? '#1a202c' : 'white',
                fontWeight: pool === option.value ? 'bold' : 'normal',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Coin and Address Inputs */}
        <div style={{ display: 'flex', gap: '16px' }}>
          <input
            type="text"
            value={coin}
            onChange={(e) => setCoin(e.target.value.toLowerCase())}
            placeholder="Coin Symbol (e.g., qrl, xmr)"
            style={{
              flex: 1,
              padding: '10px',
              background: '#1a202c',
              border: '1px solid #4a5568',
              borderRadius: '6px',
              color: 'white',
            }}
          />
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Your Wallet Address"
            style={{
              flex: 3,
              padding: '10px',
              background: '#1a202c',
              border: '1px solid #4a5568',
              borderRadius: '6px',
              color: 'white',
            }}
          />
        </div>

        {/* Action Button */}
        <button
          onClick={handleFetchStats}
          disabled={loading}
          style={{
            padding: '12px',
            fontSize: '16px',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            background: '#34d399',
            color: '#1a202c',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Fetching...' : 'Fetch Stats'}
        </button>
      </div>

      {/* Results */}
      <div style={{ marginTop: '24px' }}>
        {error && (
          <div style={{
            padding: '12px',
            background: 'rgba(248, 113, 113, 0.2)',
            border: '1px solid rgba(248, 113, 113, 0.5)',
            borderRadius: '6px',
            color: '#f87171',
            textAlign: 'center',
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {loading && !stats && (
          <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '20px' }}>
            Loading pool data...
          </div>
        )}

        {stats && <StatsDisplay data={stats} />}
      </div>
    </div>
  );
}