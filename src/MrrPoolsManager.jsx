import React, { useState, useEffect, useCallback } from 'react';

/**
 * MrrPoolsManager - Unified component for viewing and managing MRR Rig Pools.
 * Merges rig listing with individual pool editing logic.
 * Clients are auto-discovered from the server (MRR_KEY_RIG_* in .env).
 */
const MrrPoolsManager = ({ defaultClient = 'ALL', onCall }) => {
  const [rigs, setRigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedClient, setSelectedClient] = useState(defaultClient);
  const [editingRig, setEditingRig] = useState(null);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [mrrClients, setMrrClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(true);

  // Fetch available MRR clients from server (driven by env MRR_KEY_RIG_*)
  const fetchClients = useCallback(async () => {
    setClientsLoading(true);
    try {
      // Use onCall if available, otherwise use bare fetch
      const fetcher = onCall
        ? () => onCall('/api/v2/mrr/clients', { silent: true })
        : () => fetch('/api/v2/mrr/clients').then(r => r.json());

      const result = await fetcher();
      if (result?.success && Array.isArray(result.clients)) {
        setMrrClients(result.clients);
        // Update selectedClient if current selection is not in the list
        const names = result.clients.map(c => c.name);
        if (!names.includes(selectedClient) && selectedClient !== 'ALL') {
          setSelectedClient(result.defaultClient || 'ALL');
        }
      } else {
        // Fallback: derive from the rigs endpoint error or use defaults
        setMrrClients([
          { name: 'BT', isDefault: true },
          { name: 'SL', isDefault: false },
          { name: 'LN', isDefault: false },
          { name: 'LUCKY', isDefault: false },
        ]);
      }
    } catch {
      // Fallback if API fails
      setMrrClients([
        { name: 'BT', isDefault: true },
        { name: 'SL', isDefault: false },
        { name: 'LN', isDefault: false },
        { name: 'LUCKY', isDefault: false },
      ]);
    } finally {
      setClientsLoading(false);
    }
  }, [onCall, selectedClient]);

  // Fetch rigs and their merged pool info
  const fetchRigs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // endpoint=/rig/mine in index.js automatically merges pool info into the rig object
      const url = `/api/v2/mrr/rigs?client=${selectedClient}&endpoint=/rig/mine`;
      const fetcher = onCall
        ? () => onCall(url, { silent: true })
        : () => fetch(url).then(r => r.json());

      const result = await fetcher();
      if (result.success) {
        setRigs(result.rigs || []);
      } else {
        setError(result.message || 'Failed to fetch rigs');
      }
    } catch (err) {
      setError('Network error while fetching rigs');
    } finally {
      setLoading(false);
    }
  }, [selectedClient, onCall]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    if (!clientsLoading) {
      fetchRigs();
    }
  }, [fetchRigs, clientsLoading]);

  const handleEditPool = (rig) => {
    setEditingRig({
      id: rig.id,
      name: rig.name,
      host: rig.host || '',
      port: rig.port || '',
      user: rig.user || '',
      pass: rig.pass || 'x',
      client: rig.mrrClient || selectedClient
    });
    setUpdateStatus(null);
  };

  const handleUpdatePool = async (e) => {
    e.preventDefault();
    setUpdateStatus({ type: 'info', message: 'Updating pool...' });

    try {
      const url = `/api/v2/mrr/rig/${editingRig.id}/pool?client=${editingRig.client}`;
      const body = JSON.stringify({
        pools: [{
          host: editingRig.host,
          port: Number(editingRig.port),
          user: editingRig.user,
          pass: editingRig.pass,
          priority: 0
        }]
      });

      let result;
      if (onCall) {
        const res = await onCall(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        result = res;
      } else {
        const resp = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        result = await resp.json();
      }

      if (result.success) {
        setUpdateStatus({ type: 'success', message: 'Pool updated successfully!' });
        setTimeout(() => {
          setEditingRig(null);
          fetchRigs();
        }, 1500);
      } else {
        setUpdateStatus({ type: 'error', message: result.message || 'Update failed' });
      }
    } catch (err) {
      setUpdateStatus({ type: 'error', message: 'Network error during update' });
    }
  };

  // Client badge colors
  const clientColors = {
    BT: '#36d472b0',
    SL: '#d97706',
    LN: '#4708f3',
    LUCKY: '#c0ec48',
    VN: '#f31890',
  };

  const getClientColor = (name) => {
    return clientColors[name.toUpperCase()] || 'rgba(255,255,255,0.1)';
  };

  const clientOptions = mrrClients.map(c => ({
    value: c.name,
    label: `${c.name}${c.isDefault ? ' (Default)' : ''}`,
    color: getClientColor(c.name),
  }));

  return (
    <div className="mrr-pools-container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <h2>MRR Pool Manager</h2>
        <div className="controls" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            disabled={clientsLoading}
            style={{
              padding: '4px 8px',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '4px',
              background: 'rgba(255,255,255,0.05)',
              color: '#e2e8f0',
            }}
          >
            <option value="ALL">All Clients</option>
            {clientOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button onClick={fetchRigs} disabled={loading || clientsLoading} style={{
            padding: '4px 12px',
            border: '1px solid rgba(96,165,250,0.3)',
            borderRadius: '4px',
            background: 'rgba(96,165,250,0.1)',
            color: '#60a5fa',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && <div className="error-banner" style={{ color: '#f87171', padding: '8px', marginTop: '8px' }}>{error}</div>}

      {loading ? (
        <p style={{ opacity: 0.6, marginTop: '1rem' }}>Loading rigs and pool configurations...</p>
      ) : (
        <table width="100%" border="1" style={{ borderCollapse: 'collapse', marginTop: '1rem', borderColor: 'rgba(255,255,255,0.1)' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
              <th style={{ padding: '8px', textAlign: 'left' }}>ID</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Name</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Algorithm</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Current Pool (Stratum)</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>User</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rigs.map((rig) => (
              <tr key={`${rig.mrrClient}-${rig.id}`} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '8px' }}>{rig.id}</td>
                <td style={{ padding: '8px' }}>
                  {rig.name}
                  <br />
                  <span style={{
                    fontSize: '11px',
                    display: 'inline-block',
                    padding: '1px 6px',
                    borderRadius: '3px',
                    background: getClientColor(rig.mrrClient || ''),
                    color: '#fff',
                    marginTop: '2px',
                  }}>
                    {rig.mrrClient}
                  </span>
                </td>
                <td style={{ padding: '8px' }}>{rig.type}</td>
                <td style={{ padding: '8px' }}>{rig.host ? `${rig.host}:${rig.port}` : 'No Pool Configured'}</td>
                <td style={{ padding: '8px' }}>{rig.user || '-'}</td>
                <td style={{ padding: '8px' }}>
                  <button
                    onClick={() => handleEditPool(rig)}
                    style={{
                      padding: '4px 10px',
                      border: '1px solid rgba(96,165,250,0.3)',
                      borderRadius: '4px',
                      background: 'rgba(96,165,250,0.1)',
                      color: '#60a5fa',
                      cursor: 'pointer',
                    }}
                  >
                    Edit Pool
                  </button>
                </td>
              </tr>
            ))}
            {rigs.length === 0 && !loading && (
              <tr>
                <td colSpan={6} style={{ padding: '16px', textAlign: 'center', opacity: 0.5 }}>
                  No rigs found for the selected client.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {/* Modal / Inline Editor for Single Rig Pool */}
      {editingRig && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
        }}>
          <div className="modal-content" style={{
            background: '#1e293b', padding: '2rem', borderRadius: '8px',
            minWidth: '400px', maxWidth: '500px', color: '#e2e8f0',
          }}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
              Edit Pool for: {editingRig.name}
            </h3>
            <form onSubmit={handleUpdatePool} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
                Stratum Host:
                <input
                  type="text"
                  value={editingRig.host}
                  onChange={e => setEditingRig({ ...editingRig, host: e.target.value })}
                  required
                  style={{
                    padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.05)', color: '#e2e8f0',
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
                Port:
                <input
                  type="number"
                  value={editingRig.port}
                  onChange={e => setEditingRig({ ...editingRig, port: e.target.value })}
                  required
                  style={{
                    padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.05)', color: '#e2e8f0',
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
                Worker/User:
                <input
                  type="text"
                  value={editingRig.user}
                  onChange={e => setEditingRig({ ...editingRig, user: e.target.value })}
                  required
                  style={{
                    padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.05)', color: '#e2e8f0',
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
                Password:
                <input
                  type="text"
                  value={editingRig.pass}
                  onChange={e => setEditingRig({ ...editingRig, pass: e.target.value })}
                  style={{
                    padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.05)', color: '#e2e8f0',
                  }}
                />
              </label>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px' }}>
                <span style={{ opacity: 0.6 }}>Client:</span>
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: '3px',
                  background: getClientColor(editingRig.client),
                  color: '#fff', fontWeight: 600,
                }}>
                  {editingRig.client}
                </span>
              </div>

              {updateStatus && (
                <div style={{
                  color: updateStatus.type === 'error' ? '#f87171' : updateStatus.type === 'success' ? '#10b981' : '#60a5fa',
                  padding: '8px', borderRadius: '4px',
                  background: updateStatus.type === 'error' ? 'rgba(248,113,113,0.1)' : updateStatus.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(96,165,250,0.1)',
                }}>
                  {updateStatus.message}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="submit" style={{
                  background: '#10b981', color: 'white', padding: '10px 20px', border: 'none',
                  borderRadius: '4px', cursor: 'pointer', fontWeight: 600,
                }}>
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRig(null)}
                  style={{
                    padding: '10px 20px', border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '4px', background: 'transparent', color: '#94a3b8', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MrrPoolsManager;
