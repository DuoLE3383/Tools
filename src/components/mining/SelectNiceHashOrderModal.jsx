// src/components/mining/SelectNiceHashOrderModal.jsx
import { useState, useEffect, useCallback } from 'react';
import Modal from '../Modal';

export default function SelectNiceHashOrderModal({
  isOpen,
  onClose,
  onSelect,
  onCall,
  algorithm,
  nhClient,
}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchOrders = useCallback(async () => {
    if (!isOpen || !algorithm) return;
    setLoading(true);
    setError(null);
    try {
      const result = await onCall('/api/v2/hashpower/myOrders', {
        query: { op: 'LE', limit: 100, client: nhClient },
        silent: true,
      });
      const allOrders = result?.list || result?.myOrders || [];
      const matchingOrders = allOrders.filter(o => {
        const orderAlgo = typeof o.algorithm === 'object' ? o.algorithm.algorithm : o.algorithm;
        const isActive = (o.status?.code || o.status) === 'ACTIVE';
        return orderAlgo?.toUpperCase() === algorithm?.toUpperCase() && isActive;
      });
      setOrders(matchingOrders);
    } catch (err) {
      setError(err.message || 'Failed to fetch orders.');
    } finally {
      setLoading(false);
    }
  }, [isOpen, algorithm, nhClient, onCall]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Select Order for ${algorithm}`} maxWidth="700px">
      <div style={{ padding: '1rem' }}>
        {loading && <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Loading orders...</div>}
        {error && <div style={{ color: '#f87171', textAlign: 'center', padding: '1rem' }}>{error}</div>}
        {!loading && !error && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.2)' }}>
                <th style={{ padding: '8px', textAlign: 'left', color: '#94a3b8' }}>ID</th>
                <th style={{ padding: '8px', textAlign: 'right', color: '#94a3b8' }}>Price (BTC)</th>
                <th style={{ padding: '8px', textAlign: 'right', color: '#94a3b8' }}>Speed</th>
                <th style={{ padding: '8px', textAlign: 'left', color: '#94a3b8' }}>Account</th>
                <th style={{ padding: '8px', textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id} style={{ borderBottom: '1px solid rgba(148,163,184,0.1)' }}>
                  <td style={{ padding: '8px', fontFamily: 'monospace' }}>{order.id.slice(0, 8)}...</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#fbbf24' }}>{parseFloat(order.price || 0).toFixed(8)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{parseFloat(order.acceptedCurrentSpeed || 0).toFixed(2)} GH/s</td>
                  <td style={{ padding: '8px', color: '#60a5fa' }}>{order.nhClient || 'N/A'}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    <button className="btn-pro primary" onClick={() => onSelect(order)} style={{ fontSize: '11px', padding: '4px 12px' }}>Select</button>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                    No active orders found for {algorithm}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}