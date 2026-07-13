// src/mining/ProfitAlert.jsx
import { useState, useEffect, useCallback } from 'react';
import { useProfitCalculator } from '../hooks/useProfitCalculator';
import { useTelegramMine } from '../mrr/TelegramMineContext';

export default function ProfitAlert({ 
  coin,
  address,
  niceHashCostBTC,
  durationHours = 24,
  electricityCostPerKWh = 0.12,
  powerWatts = 0,
  onCall,
  checkInterval = 60000,
}) {
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
  } = useProfitCalculator({
    coin,
    address,
    niceHashCostBTC,
    durationHours,
    electricityCostPerKWh,
    powerWatts,
    onCall,
  });

  // Send Telegram alert
  const sendProfitAlert = useCallback(async (profitData, isNegative = false) => {
    if (!profitData) return;

    const emoji = isNegative ? '🔴' : '✅';
    const status = isNegative ? 'NEGATIVE' : 'POSITIVE';

    const message = `
${emoji} <b>Mining Profit Alert - ${status}</b>

📊 <b>${coin} Mining</b>
• Address: ${address.slice(0, 12)}...${address.slice(-6)}
• Hashrate: ${profitData.hashrate}
• Workers: ${profitData.workers}
• Efficiency: ${profitData.efficiency}

💰 <b>Income (24h)</b>
• ${paid24hCoin || 0} ${coin}
• $${profitData.paid24hUSD.toFixed(2)}

💸 <b>Costs (24h)</b>
• NiceHash: $${profitData.niceHashCostPerDay.toFixed(2)}
• Electricity: $${profitData.electricityCostPerDay.toFixed(2)}
• <b>Total: $${profitData.totalCostPerDay.toFixed(2)}</b>

📈 <b>Profit</b>
• Hourly: <b>$${profitData.netProfitPerHour.toFixed(2)}/h</b>
• Daily: <b>$${profitData.netProfitPerDay.toFixed(2)}/day</b>
• ROI: <b>${profitData.roi.toFixed(2)}%</b>

⏰ Updated: ${new Date(profitData.timestamp).toLocaleString()}
    `.trim();

    await notify(message);
    setAlertSent(true);
    setLastAlertType(isNegative ? 'negative' : 'positive');
  }, [coin, address, notify]);

  // Check and alert on profit change
  useEffect(() => {
    if (!profit) return;

    const isNegative = profit.netProfitPerHour < 0;

    // Send alert if:
    // 1. First check
    // 2. Status changed (positive -> negative or negative -> positive)
    // 3. Negative alert every 30 minutes (if still negative)
    const shouldAlert = 
      lastAlertType === null ||
      (isNegative !== (lastAlertType === 'negative')) ||
      (isNegative && !alertSent);

    if (shouldAlert) {
      sendProfitAlert(profit, isNegative);
    }

    // Reset alert sent flag when status changes back to positive
    if (!isNegative) {
      setAlertSent(false);
    }
  }, [profit, lastAlertType, alertSent, sendProfitAlert]);

  // Manual refresh
  const handleRefresh = useCallback(async () => {
    await checkProfit();
  }, [checkProfit]);

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
          <span style={{ fontSize: '18px' }}>
            {loading ? '⏳' : isProfitable === null ? '⚪' : isProfitable ? '🟢' : '🔴'}
          </span>
          <span style={{ fontWeight: 700, color: '#e2e8f0' }}>
            {coin} Profit Monitor
          </span>
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '6px',
        }}>
          <StatItem label="Hashrate" value={profit.hashrate} color="#60a5fa" />
          <StatItem label="Workers" value={profit.workers} color="#94a3b8" />
          <StatItem label="Efficiency" value={profit.efficiency} color="#34d399" />
          <StatItem label="Pending" value={profit.pendingBalance} color="#fbbf24" />
          
          <StatItem 
            label="Income (24h)" 
            value={`$${profit.paid24hUSD.toFixed(2)}`} 
            color="#34d399"
          />
          <StatItem 
            label="Cost (24h)" 
            value={`$${profit.totalCostPerDay.toFixed(2)}`} 
            color="#f87171"
          />
          <StatItem 
            label="Profit/Hour" 
            value={`$${profit.netProfitPerHour.toFixed(2)}`} 
            color={profit.isProfitable ? '#34d399' : '#f87171'}
            bold
          />
          <StatItem 
            label="ROI" 
            value={`${profit.roi.toFixed(2)}%`} 
            color={profit.roi > 0 ? '#34d399' : '#f87171'}
          />
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