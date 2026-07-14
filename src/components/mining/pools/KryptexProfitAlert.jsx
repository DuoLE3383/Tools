// KryptexProfitAlert.jsx — Profit monitor for Kryptex pool miners
// Uses Kryptex pool data instead of HeroMiners for the income side
import { useState, useCallback, useMemo } from 'react';
import { useKryptexProfitCalculator } from '../../../hooks/useKryptexProfitCalculator';
import SelectNiceHashOrderModal from '../SelectNiceHashOrderModal';
import { formatDisplayNumber } from '../../../core/priceUtils.js';
import { useProfitAlert } from '../../../hooks/useProfitAlert.js';

const COIN_TO_ALGO = {
  'ETC': 'ETCHASH',
  'XMR': 'RANDOMXMONERO',
  'CFX': 'OCTOPUS',
  'ERG': 'AUTOLYKOS2',
  'RVN': 'KAWPOW',
  'BEAM': 'BEAMV3',
  'FLUX': 'ZELHASH',
  'ALPH': 'BLAKE3',
  'FB': 'SHA256ASICBOOST',
};

const ORDER_STORAGE_PREFIX = 'kryptex_profit_alert_order_';

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

export default function KryptexProfitAlert({
  pair,
  onCall,
  nhClient = 'VN',
}) {
  const [manualOrderId, setManualOrderId] = useState(() => pair?.id ? loadSavedOrderId(pair.id) : null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

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
  } = useKryptexProfitCalculator({
    pair,
    onCall,
    nhClient,
    manualNiceHashOrderId: manualOrderId,
  });

  const { coin, address } = pairData || {};

  const { niceHashOrder } = useProfitAlert({
    profit,
    pairData,
    niceHashPriceBTC,
    orderedHashrateGH,
    niceHashOrderId,
    alertTitle: `Kryptex Pool Profit Alert`,
  });

  const getCoinAlgorithm = (coinName) => {
    return COIN_TO_ALGO[coinName?.toUpperCase()] || coinName?.toUpperCase() || 'UNKNOWN';
  };
  const algorithm = getCoinAlgorithm(coin);

  const handleSelectOrder = (order) => {
    setManualOrderId(order.id);
    setIsOrderModalOpen(false);
  };

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
      padding: '10px 14px',
      background: 'rgba(15,23,42,0.72)',
      border: `1px solid ${isProfitable === null ? 'rgba(148,163,184,0.12)' : isProfitable ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>
            {loading ? '⏳' : isProfitable === null ? '⚪' : isProfitable ? '🟢' : '🔴'}
          </span>
          <span style={{ fontWeight: 700, color: '#e2e8f0' }}>
            {coin} MONITOR
          </span>
          {niceHashOrderId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '9px', color: '#64748b' }}>
                {orderDisplayDetails ? `${orderDisplayDetails} (${niceHashOrderId.slice(0, 8)}...)` : `Order: ${niceHashOrderId.slice(0, 8)}...`}
              </span>
              <button onClick={() => setIsOrderModalOpen(true)} style={{ fontSize: '9px', background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: '0 2px' }}>(change)</button>
            </div>
          )}
          {!niceHashOrderId && !loading && (
            <button onClick={() => setIsOrderModalOpen(true)} style={{ fontSize: '10px', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', color: '#60a5fa', borderRadius: '4px', padding: '1px 6px', cursor: 'pointer' }}>Select Order</button>
          )}
          {error && <span style={{ color: '#f87171', fontSize: '11px' }}>⚠️ {error}</span>}
        </div>
        <button onClick={handleRefresh} disabled={loading} style={{
          padding: '4px 12px', fontSize: '11px', background: 'rgba(148,163,184,0.1)',
          border: '1px solid rgba(148,163,184,0.2)', borderRadius: '6px', color: '#e2e8f0',
          cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1,
        }}>
          {loading ? '⏳' : '⟳ Check'}
        </button>
      </div>

      {profit && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
          <StatItem label="Profit/H" value={`$${formatDisplayNumber(profit.netProfitPerHour)}`} color={profit.isProfitable ? '#34d399' : '#f87171'} bold />
          <StatItem label="ROI" value={`${formatDisplayNumber(profit.roi)}%`} color={profit.roi > 0 ? '#34d399' : '#f87171'} />
          <StatItem label="Income 24h" value={`$${profit.paid24hUSD.toFixed(2)}`} color="#34d399" />
          <StatItem label="NH Paid" value={`$${formatDisplayNumber(profit.nhTotalPaidUSD)}`} color="#f87171" />
        </div>
      )}

      {profit && (
        <div style={{ fontSize: '10px', color: '#64748b', display: 'flex', gap: '12px', flexWrap: 'wrap', borderTop: '1px solid rgba(148,163,184,0.08)', paddingTop: '6px' }}>
          <span>NH Price: {niceHashPriceBTC.toFixed(8)} BTC/GH/day</span>
          <span>Speed: {orderedHashrateGH.toFixed(2)} GH/s</span>
        </div>
      )}

      {lastCheck && (
        <div style={{ fontSize: '10px', color: '#64748b', textAlign: 'right' }}>
          Check: {lastCheck.toLocaleString()}
          {isProfitable !== null && (
            <span style={{ marginLeft: '8px', color: isProfitable ? '#34d399' : '#f87171', fontWeight: 600 }}>
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
        nhClient={nhClient}
      />
    </div>
  );
}

function StatItem({ label, value, color, bold = false }) {
  return (
    <div style={{ padding: '6px 8px', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
      <div style={{ color: '#64748b', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ color: color || '#e2e8f0', fontSize: '13px', fontWeight: bold ? 800 : 600, marginTop: '2px' }}>{value}</div>
    </div>
  );
}
