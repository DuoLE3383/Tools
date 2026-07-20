// src/mining/ProfitAlert.jsx
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useProfitCalculator } from '../../hooks/useProfitCalculator';
import SelectNiceHashOrderModal from './SelectNiceHashOrderModal.jsx';
import { formatDisplayNumber } from '../../core/priceUtils.js';
import { useProfitAlert } from '../../hooks/useProfitAlert.js';

const ORDER_STORAGE_PREFIX = 'profit_alert_order_';
const CLIENT_STORAGE_PREFIX = 'profit_alert_client_';

function loadSavedOrderId(pairId) {
  try {
    return localStorage.getItem(`${ORDER_STORAGE_PREFIX}${pairId}`) || null;
  } catch { return null; }
}

function saveOrderId(pairId, orderId) {
  try {
    if (orderId) localStorage.setItem(`${ORDER_STORAGE_PREFIX}${pairId}`, orderId);
    else localStorage.removeItem(`${ORDER_STORAGE_PREFIX}${pairId}`);
  } catch {}
}

function loadSavedClient(pairId, fallback) {
  try { return localStorage.getItem(`${CLIENT_STORAGE_PREFIX}${pairId}`) || fallback; } catch { return fallback; }
}

function saveClient(pairId, client) {
  try { localStorage.setItem(`${CLIENT_STORAGE_PREFIX}${pairId}`, client); } catch {}
}

export default function ProfitAlert({ 
  pair,           // Auto-detected from pool monitor
  onCall,
  nhClient = 'VN',
  niceHashClients = [{ id: 'VN', label: 'All NiceHash accounts' }],
  poolName,
  onProfitUpdate,
}) {
  const [manualOrderId, setManualOrderId] = useState(() => pair?.id ? loadSavedOrderId(pair.id) : null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [selectedNhClient, setSelectedNhClient] = useState(() => pair?.id ? loadSavedClient(pair.id, nhClient) : nhClient);

  const {
    stats,
    loading,
    error,
    profit,
    isProfitable,
    lastCheck,
    checkProfit,
    niceHashOrderId,
    niceHashPriceBTC,
    orderedHashrateGH,
    pair: pairData,
  } = useProfitCalculator({
    pair,
    onCall,
    nhClient: selectedNhClient,
    manualNiceHashOrderId: manualOrderId,
  });

  useEffect(() => {
    if (onProfitUpdate) {
      onProfitUpdate(pair.id, profit);
    }
  }, [profit, pair.id, onProfitUpdate]);

  const { coin, address } = pairData || {};

  const { niceHashOrder } = useProfitAlert({
    profit,
    pairData,
    niceHashPriceBTC,
    orderedHashrateGH,
    niceHashOrderId,
    alertTitle: `${poolName ? `${poolName} ` : ''}Mining Profit Alert`,
    poolName,
  });

  // This is a copy from useProfitCalculator.js to determine the algo for the modal
  const getCoinAlgorithm = (coinName) => {
    const coinUpper = coinName?.toUpperCase() || '';
    const algoMap = {
      'QRL': 'RANDOMXMONERO',
      'XMR': 'RANDOMXMONERO',
      'ZEPH': 'RANDOMXMONERO',
      'SALVIUM': 'RANDOMXMONERO',
      'CFX': 'OCTOPUS',
      'CONFLUX': 'OCTOPUS',
      'RVN': 'KAWPOW',
      'RAVENCOIN': 'KAWPOW',
      'KAS': 'KHEAVYHASH',
      'KASPA': 'KHEAVYHASH',
      'ERG': 'AUTOLYKOS2',
      'ERGO': 'AUTOLYKOS2',
      'ETC': 'ETCHASH',
      'ETHW': 'ETCHASH',
      'BEAM': 'BEAMV3',
      'FLUX': 'ZELHASH',
      'ALPH': 'BLAKE3',
      'ALEPHIUM': 'BLAKE3',
      'DYNEX': 'DYNEXSOLVE',
      'NEXA': 'NEXAPOW',
      'CLORE': 'KAWPOW',
      'AIPG': 'KAWPOW',
    };
    return algoMap[coinUpper] || coinUpper;
  };
  const algorithm = pair?.algorithm || getCoinAlgorithm(coin);

  const handleSelectOrder = (order) => {
    setManualOrderId(order.id);
    saveOrderId(pair.id, order.id);
    setIsOrderModalOpen(false);
  };

  const handleClientChange = (event) => {
    const nextClient = event.target.value;
    setSelectedNhClient(nextClient);
    saveClient(pair.id, nextClient);
    setManualOrderId(null);
    saveOrderId(pair.id, null);
  };

  // Manual refresh
  const handleRefresh = useCallback(async () => {
    await checkProfit();
  }, [checkProfit]);

  if (!pair) return null;

  const orderDisplayDetails = useMemo(() => {
    if (!niceHashOrder) return '';
    return [
      niceHashOrder.poolName && niceHashOrder.poolName !== 'N/A' ? niceHashOrder.poolName : null,
      niceHashOrder.account
    ].filter(Boolean).join(' - ');
  }, [niceHashOrder]);

  return (
    <div style={{
      padding: '12px 16px',
      background: 'rgba(15,23,42,0.72)',
      border: `1px solid ${isProfitable === null ? 'rgba(148,163,184,0.12)' : isProfitable ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px' }}>
            {loading ? '⏳' : isProfitable === null ? '⚪' : isProfitable ? '🟢' : '🔴'}
          </span>
          <span style={{ fontWeight: 600, color: '#e2e8f0' }}>
            {/* {poolName ? `${poolName} - ` : ''} */}
            {coin} Monitor
          </span>
          <select
            value={selectedNhClient}
            onChange={handleClientChange}
            aria-label="NiceHash account"
            style={{ maxWidth: '145px', fontSize: '10px', background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(96,165,250,0.35)', borderRadius: '4px', color: '#bfdbfe', padding: '2px 4px', cursor: 'pointer' }}
          >
            {niceHashClients.map((client) => <option key={client.id} value={client.id}>{client.label || client.id}</option>)}
          </select>
          {niceHashOrderId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '9px', color: '#64748b' }}>
                {orderDisplayDetails ? `${orderDisplayDetails} (${niceHashOrderId.slice(0, 8)}...)` : `Order: ${niceHashOrderId.slice(0, 8)}...`}
              </span>
              <button onClick={() => setIsOrderModalOpen(true)} style={{ fontSize: '9px', background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: '0 2px' }}>
                (change)
              </button>
            </div>
          )}
          {!niceHashOrderId && !loading && (
            <button onClick={() => setIsOrderModalOpen(true)} style={{ fontSize: '10px', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', color: '#60a5fa', borderRadius: '4px', padding: '1px 6px', cursor: 'pointer' }}>
              Select Nicehash
            </button>
          )}
          {error && (
            <span style={{ color: '#f87171', fontSize: '11px' }}>
              ⚠️ {error}
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          style={{
            padding: '4px 12px',
            fontSize: '11px',
            background: 'rgba(148,163,184,0.1)',
            border: '1px solid rgba(148,163,184,0.2)',
            borderRadius: '6px',
            color: '#e2e8f0',
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? '⏳' : '⟳ Check'}
        </button>
      </div>

      {/* Stats Grid */}
      {profit && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '6px',
        }}>
          <StatItem 
            label="Profit/Hour" 
            value={`$${formatDisplayNumber(profit.netProfitPerHour)}`} 
            color={profit.isProfitable ? '#34d399' : '#f87171'}
            bold
          />
          <StatItem label="ROI" value={`${formatDisplayNumber(profit.roi)}%`} color={profit.roi > 0 ? '#34d399' : '#f87171'} />
          <StatItem 
            label="Income (24h)" 
            value={`$${profit.paid24hUSD.toFixed(2)}`} 
            color="#34d399"
          />
          <StatItem 
            label="NH Paid" 
            value={`$${formatDisplayNumber(profit.nhTotalPaidUSD)}`} 
            color="#f87171"
          />
        </div>
      )}

      {/* NiceHash Info */}
      {profit && (
        <div style={{
          fontSize: '10px',
          color: '#64748b',
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          borderTop: '1px solid rgba(148,163,184,0.08)',
          paddingTop: '6px',
        }}>
          <span>NH Price: {niceHashPriceBTC.toFixed(8)} BTC/GH/day</span>
          <span>Speed: {orderedHashrateGH.toFixed(2)} GH/s</span>
          <span>Cost: {profit.costPerDay.toFixed(8)} BTC/day</span>
          <span>BTC: ${profit.btcPrice.toFixed(0)}</span>
        </div>
      )}

      {/* Last check */}
      {lastCheck && (
        <div style={{
          fontSize: '10px',
          color: '#64748b',
          textAlign: 'right',
        }}>
          Last check: {lastCheck.toLocaleString()}
          {isProfitable !== null && (
            <span style={{ 
              marginLeft: '8px',
              color: isProfitable ? '#34d399' : '#f87171',
              fontWeight: 600,
            }}>
              {isProfitable ? '✅ PROFITABLE' : '⚠️ NEGATIVE'}
            </span>
          )}
        </div>
      )}

      <SelectNiceHashOrderModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        onSelect={handleSelectOrder}
        onCall={onCall}
        algorithm={algorithm}
        nhClient={selectedNhClient}
      />
    </div>
  );
}

function StatItem({ label, value, color, bold = false }) {
  return (
    <div style={{
      padding: '6px 8px',
      background: 'rgba(0,0,0,0.15)',
      borderRadius: '6px',
    }}>
      <div style={{
        color: '#64748b',
        fontSize: '9px',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        {label}
      </div>
      <div style={{
        color: color || '#e2e8f0',
        fontSize: '13px',
        fontWeight: bold ? 800 : 600,
        marginTop: '2px',
      }}>
        {value}
      </div>
    </div>
  );
}
