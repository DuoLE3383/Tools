import { useState, useEffect, useCallback, useRef } from 'react';
import { useNiceHashOrders } from '../components/nicehash/NiceHashContext';
import { useTelegramMine } from '../components/mrr/TelegramMineContext';

export function useProfitAlert({
  profit,
  pairData,
  niceHashPriceBTC,
  orderedHashrateGH,
  niceHashOrderId,
  alertTitle,
}) {
  const [alertSent, setAlertSent] = useState(false);
  const [lastAlertType, setLastAlertType] = useState(null);
  const alertedProfitRef = useRef(null);
  const { notify } = useTelegramMine();
  const { getOrderById } = useNiceHashOrders();

  const niceHashOrder = getOrderById(niceHashOrderId);
  const { coin, address } = pairData || {};

  const sendProfitAlert = useCallback(async (profitData, isNegative = false) => {
    if (!profitData) return;

    const emoji = isNegative ? '🔴' : '✅';
    const status = isNegative ? 'NEGATIVE' : 'POSITIVE';

    const orderDetails = [
      niceHashOrder?.poolName && niceHashOrder.poolName !== 'N/A' ? niceHashOrder.poolName : null,
      niceHashOrder?.account
    ].filter(Boolean).join(' - ');

    const orderInfo = niceHashOrderId
      ? `🆔 ${orderDetails ? `${orderDetails} (${niceHashOrderId.slice(0, 8)}...)` : `Order: ${niceHashOrderId.slice(0, 8)}...`}`
      : '';

    const message = `
${emoji} <b>${alertTitle} - ${status}</b>

📊 <b>${coin} Mining</b>
• Address: ${address?.slice(0, 12)}...${address?.slice(-6)}
• Hashrate: ${profitData.hashrate}
• Workers: ${profitData.workers}

💰 <b>Income (24h)</b>
• ${profitData.paid24hCoin.toFixed(profitData.paid24hCoin > 1 ? 4 : 6)} ${coin}
• $${profitData.paid24hUSD.toFixed(2)}
• ${profitData.grossBtcPerDay.toFixed(8)} BTC

💸 <b>NiceHash Cost (24h)</b>
• ${niceHashPriceBTC.toFixed(8)} BTC/GH/day × ${orderedHashrateGH.toFixed(2)} GH/s
• ${profitData.costPerDay.toFixed(8)} BTC
• Paid: <b>${(profitData.nhTotalPaidBTC || 0).toFixed(8)} BTC</b>
• $${profitData.costPerDayUSD.toFixed(2)}

📈 <b>Profit</b>
• Hourly: <b>$${profitData.netProfitPerHour.toFixed(2)}/h</b>
• Daily: <b>$${profitData.netProfitPerDay.toFixed(2)}/day</b>
• Daily BTC: <b>${profitData.netProfitBTC.toFixed(8)} BTC</b>
• ROI: <b>${profitData.roi.toFixed(2)}%</b>

${orderInfo}

⏰ Updated: ${new Date(profitData.timestamp).toLocaleString()}
    `.trim();

    await notify(message);
    setAlertSent(true);
    setLastAlertType(isNegative ? 'negative' : 'positive');
  }, [
    coin,
    address,
    niceHashPriceBTC,
    orderedHashrateGH,
    niceHashOrderId,
    notify,
    niceHashOrder,
    alertTitle,
  ]);

  useEffect(() => {
    if (!profit || alertedProfitRef.current === profit) {
      return;
    }

    const isNegative = profit.netProfitPerHour < 0;
    const shouldAlert =
      lastAlertType === null ||
      (isNegative !== (lastAlertType === 'negative')) ||
      (isNegative && !alertSent);

    if (shouldAlert) {
      alertedProfitRef.current = profit;
      sendProfitAlert(profit, isNegative);
    }

    if (!isNegative) {
      setAlertSent(false);
    }
  }, [profit, lastAlertType, alertSent, sendProfitAlert]);

  return { niceHashOrder };
}