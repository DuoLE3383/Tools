// KryptexProfitAlert.jsx — Profit monitor for Kryptex pool miners
// Uses Kryptex pool data instead of HeroMiners for the income side
import { useState, useEffect, useCallback } from 'react';
import { useKryptexProfitCalculator } from '../../../hooks/useKryptexProfitCalculator';
import { useTelegramMine } from '../../mrr/TelegramMineContext';
import SelectNiceHashOrderModal from '../SelectNiceHashOrderModal';

const COIN_TO_ALGO = {
  'ETC': 'ETCHASH',
  'XMR': 'RANDOMXMONERO',
  'CFX': 'OCTOPUS',
  'ERG': 'AUTOLYKOS2',
  'RVN': 'KAWPOW',
  'BEAM': 'BEAMV3',
  'FLUX': 'ZELHASH',
  'ALPH': 'BLAKE3',
};

export default function KryptexProfitAlert({
  pair,
  onCall,
  nhClient = 'VN',
}) {
  const [manualOrderId, setManualOrderId] = useState(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [alertSent, setAlertSent] = useState(false);
  const [lastAlertType, setLastAlertType] = useState(null);
  const { notify } = useTelegramMine();

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

  const getCoinAlgorithm = (coinName) => {
    return COIN_TO_ALGO[coinName?.toUpperCase()] || coinName?.toUpperCase() || 'UNKNOWN';
  };
  const algorithm = getCoinAlgorithm(coin);

  const handleSelectOrder = (order) => {
    setManualOrderId(order.id);
    setIsOrderModalOpen(false);
  };

  const sendProfitAlert = useCallback(async (profitData, isNegative = false) => {
    if (!profitData) return;
    const emoji = isNegative ? '🔴' : '✅';
    const status = isNegative ? 'NEGATIVE' : 'POSITIVE';

    const message =
`${emoji} <b>Kryptex Pool Profit Alert - ${status}</b>

📊 <b>${coin} Mining</b>
• Address: ${address?.slice(0, 12)}...${address?.slice(-6)}
• Hashrate: ${profitData.hashrate}
• Workers: ${profitData.workers}

💰 <b>Income (24h)</b>
• ${profitData.paid24hCoin.toFixed(6)} ${coin}
• $${profitData.paid24hUSD.toFixed(2)}
• ${profitData.grossBtcPerDay.toFixed(8)} BTC

💸 <b>NiceHash Cost (24h)</b>
• ${niceHashPriceBTC.toFixed(8)} BTC/GH/day × ${orderedHashrateGH.toFixed(2)} GH/s
• ${profitData.costPerDay.toFixed(8)} BTC
• Paid: ${(profitData.nhTotalPaidBTC || 0).toFixed(8)} BTC
• $${profitData.costPerDayUSD.toFixed(2)}

📈 <b>Profit</b>
• Hourly: <b>$${profitData.netProfitPerHour.toFixed(2)}/h</b>
• Daily: <b>$${profitData.netProfitPerDay.toFixed(2)}/day</b>
• Daily BTC: <b>${profitData.netProfitBTC.toFixed(8)} BTC</b>
• ROI: <b>${profitData.roi.toFixed(2)}%</b>

${niceHashOrderId ? `🆔 Order: ${niceHashOrderId.slice(0, 8)}...` : ''}
⏰ Updated: ${new Date(profitData.timestamp).toLocaleString()}`;

    await notify(message);
    setAlertSent(true);
    setLastAlertType(isNegative ? 'negative' : 'positive');
  }, [coin, address, niceHashPriceBTC, orderedHashrateGH, niceHashOrderId, notify]);

  useEffect(() => {
    if (!profit) return;
    const isNegative = profit.netProfitPerHour < 0;
    const shouldAlert =
      lastAlertType === null ||
      (isNegative !== (lastAlertType === 'negative')) ||
      (isNegative && !alertSent);
    if (shouldAlert) sendProfitAlert(profit, isNegative);
    if (!isNegative) setAlertSent(false);
  }, [profit, lastAlertType, alertSent, sendProfitAlert]);

  const handleRefresh = useCallback(async () => {
    await checkProfit();
  }, [checkProfit]);

  if (!pair) return null;

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
            🟢 Kryptex Profit
          </span>
          {niceHashOrderId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '9px', color: '#64748b' }}>Order: {niceHashOrderId.slice(0, 8)}...</span>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '6px' }}>
          <StatItem label="Hashrate" value={profit.hashrate} color="#60a5fa" />
          <StatItem label="Workers" value={profit.workers} color="#94a3b8" />
          <StatItem label="ROI" value={`${profit.roi.toFixed(2)}%`} color={profit.roi > 0 ? '#34d399' : '#f87171'} />
          <StatItem label="Pending" value={profit.pendingBalance} color="#fbbf24" />
          <StatItem label="Income 24h" value={`$${profit.paid24hUSD.toFixed(2)}`} color="#34d399" />
          <StatItem label="NH Cost 24h" value={`$${profit.costPerDayUSD.toFixed(2)}`} color="#f87171" />
          <StatItem label="Profit/H" value={`$${profit.netProfitPerHour.toFixed(2)}`} color={profit.isProfitable ? '#34d399' : '#f87171'} bold />
          <StatItem label="BTC/Day" value={`${profit.netProfitBTC.toFixed(8)}`} color={profit.isProfitable ? '#34d399' : '#f87171'} />
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
