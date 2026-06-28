// ==========================
//  COMPONENT: HEROMINERS CARD
//  FORCE price from coinStats
// ==========================

import { useState, useCallback, useEffect } from "react";
import "./HeroMinersCard.css";

export default function HeroMinersCard({
  onCall,
  initialCoin = "QRL",
  onPaste,
}) {
  const [address, setAddress] = useState("");
  const [coin, setCoin] = useState(initialCoin);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdate, setLastUpdate] = useState(null);
  const [viewMode, setViewMode] = useState("dashboard"); // 'dashboard' | 'raw'

  // Coin price state
  const [coinPrice, setCoinPrice] = useState(0);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceSource, setPriceSource] = useState("");

  // Load last address from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("herominers_last_address");
    if (saved) {
      try {
        const { address: savedAddress, coin: savedCoin } = JSON.parse(saved);
        setAddress(savedAddress);
        if (savedCoin) setCoin(savedCoin);
      } catch (e) {}
    }
  }, []);

  const handleLookup = useCallback(async () => {
    if (!address || !coin) {
      setError("Address and Coin are required.");
      return;
    }

    setLoading(true);
    setError("");
    setStats(null);

    try {
      const result = await onCall("/api/v2/mining-stats/herominers/address", {
        query: { address: address.trim(), coin: coin.trim().toUpperCase() },
        silent: true,
      });

      if (result?.success) {
        setStats(result.data);
        setLastUpdate(new Date());

        localStorage.setItem(
          "herominers_last_address",
          JSON.stringify({
            address: address.trim(),
            coin: coin.trim().toUpperCase(),
          }),
        );

        // FORCE price from coinStats - this is the most reliable source
        if (result.data?.coinStats && result.data.coinStats.length > 0) {
          const upperCoin = coin.trim().toUpperCase();
          const mainCoin = result.data.coinStats.find(cs => cs.coin === upperCoin) || result.data.coinStats[0];
          
          // Log the raw coinStats for debugging
          console.log('📊 coinStats from API:', result.data.coinStats);
          console.log('📊 Main coin:', mainCoin);
          
          if (mainCoin?.priceUsd !== undefined && mainCoin.priceUsd > 0) {
            // Force the price to be exactly what's in coinStats
            const price = parseFloat(mainCoin.priceUsd);
            setCoinPrice(price);
            setPriceSource("coinStats");
            console.log(`💰 ${coin} price from coinStats: $${price}`);
          }
        }
        
        // Only fetch from API if we didn't get a valid price from coinStats
        if (coinPrice === 0) {
          await fetchCoinPrice(coin.trim().toUpperCase());
        }
      } else {
        throw new Error(result?.error || "Failed to fetch address stats.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [address, coin, onCall]);

  // Fetch coin price from CoinGecko (fallback)
  const fetchCoinPrice = useCallback(
    async (coinSymbol) => {
      if (!coinSymbol) return;
      setPriceLoading(true);
      
      try {
        const upperSymbol = coinSymbol.toUpperCase();
        const coinId = upperSymbol.toLowerCase();

        const result = await onCall("/api/v2/prices/coingecko", {
          query: {
            ids: coinId,
            vs_currency: "usd",
          },
          silent: true,
        });

        const data = result?.data || result || {};
        let price = 0;

        if (data[coinId] && data[coinId].usd !== undefined) {
          price = parseFloat(data[coinId].usd);
        } else if (data.data && data.data[coinId] && data.data[coinId].usd !== undefined) {
          price = parseFloat(data.data[coinId].usd);
        } else if (data.price !== undefined) {
          price = parseFloat(data.price);
        } else if (data.usd !== undefined) {
          price = parseFloat(data.usd);
        }

        if (price > 0 && price < 100000) {
          setCoinPrice(price);
          setPriceSource("coingecko");
          console.log(`💰 ${coinSymbol} price from CoinGecko: $${price}`);
        }
      } catch (err) {
        console.error("Failed to fetch coin price:", err);
      } finally {
        setPriceLoading(false);
      }
    },
    [onCall],
  );

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleLookup();
    }
  };

  // Format USD helper
  const formatUsd = (value) => {
    if (!value || value === 0) return "";
    if (value >= 1) return `$${value.toFixed(2)}`;
    if (value >= 0.0001) return `$${value.toFixed(4)}`;
    if (value >= 0.000001) return `$${value.toFixed(8)}`;
    return `$${value.toFixed(12)}`;
  };

  // Format number with commas
  const formatNumberWithCommas = (value) => {
    if (!value || value === 0) return "0";
    if (value < 0.01 && value > 0) return value.toFixed(6);
    if (value < 1) return value.toFixed(4);
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  };

  // Parse amount from formatted string
  const parseAmount = (formatted) => {
    if (!formatted) return 0;
    const cleaned = formatted.replace(/[^0-9.]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  // Parse hashrate to H/s
  const parseHashrate = (hashrateStr) => {
    if (!hashrateStr) return 0;
    const match = hashrateStr.match(/([\d.]+)\s*([KMGT]?H)\/s/);
    if (!match) {
      const num = parseFloat(hashrateStr);
      return isNaN(num) ? 0 : num;
    }
    const value = parseFloat(match[1]);
    const unit = match[2];
    switch (unit) {
      case 'KH/s': return value * 1000;
      case 'MH/s': return value * 1000000;
      case 'GH/s': return value * 1000000000;
      case 'TH/s': return value * 1000000000000;
      default: return value;
    }
  };

  // Calculate 1h profit based on 1h hashrate
  const calculate1hProfit = (hashrate1hStr, price) => {
    if (!hashrate1hStr || !price || price === 0) return 0;
    const hashrateInH = parseHashrate(hashrate1hStr);
    if (hashrateInH === 0) return 0;
    
    // For QRL: ~0.01 coins per day per MH/s
    const coinsPerDayPerMH = 0.01;
    const coinsPerDay = (hashrateInH / 1000000) * coinsPerDayPerMH;
    const coinsPerHour = coinsPerDay / 24;
    return coinsPerHour * price;
  };

  // Render dashboard
  const renderDashboard = () => {
    if (!stats) return null;

    const {
      liveStats = {},
      paymentStats = {},
      shareStats = { total: {}, pool: {}, solo: {} },
      blockStats = {},
      charts = { hashrate: [], payments: [] },
      coinStats = [],
      workerStats = {},
      miningDetails = {},
    } = stats;

    const totalShares = shareStats.total || {};

    const validShares = miningDetails.validShares ?? totalShares.valid ?? 0;
    const staleShares = miningDetails.staleShares ?? totalShares.stale ?? 0;
    const invalidShares = miningDetails.invalidShares ?? totalShares.invalid ?? 0;
    const efficiency = miningDetails.efficiency ?? (totalShares.efficiency ? totalShares.efficiency + "%" : "0.00%");
    const blocksFound = miningDetails.blocksFound ?? blockStats.totalBlocks ?? 0;
    const roundContribution = miningDetails.roundContribution ?? blockStats.roundContribution ?? "0.00%";
    const payoutEstimate = miningDetails.payoutEstimate ?? blockStats.payoutEstimate ?? "0.0000 QRL";

    const hashrate15m = liveStats.avg15m || liveStats.hashrate15m || "0 H/s";
    const hashrate1h = liveStats.avg1h || liveStats.hashrate1h || "0 H/s";

    // Parse payment amounts
    const pendingBalanceRaw = paymentStats.pendingBalance || "0.0000 QRL";
    const totalPaidRaw = paymentStats.totalPaid || "0.0000 QRL";
    const paid24hRaw = paymentStats.paid24h || "0.0000 QRL";
    const paidWeekRaw = paymentStats.paidWeek || "0.0000 QRL";

    const pendingNum = parseAmount(pendingBalanceRaw);
    const totalPaidNum = parseAmount(totalPaidRaw);
    const paid24hNum = parseAmount(paid24hRaw);
    const paidWeekNum = parseAmount(paidWeekRaw);

    // FORCE the price from coinStats - this is the most reliable source
    let effectivePrice = 0;
    let priceSourceText = "unknown";

    // ALWAYS use coinStats price first - it has the correct price
    if (coinStats && coinStats.length > 0) {
      const upperCoin = coin.trim().toUpperCase();
      const mainCoin = coinStats.find(cs => cs.coin === upperCoin) || coinStats[0];
      
      console.log('🔍 Looking for price in coinStats:', {
        coin: upperCoin,
        coinStats,
        mainCoin,
        priceUsd: mainCoin?.priceUsd
      });
      
      if (mainCoin?.priceUsd !== undefined) {
        const price = parseFloat(mainCoin.priceUsd);
        if (price > 0 && price < 100000) {
          effectivePrice = price;
          priceSourceText = "coinStats";
          console.log(`✅ Using price from coinStats: $${effectivePrice}`);
        }
      }
    }

    // If no price from coinStats, use coinPrice state
    if (effectivePrice === 0 && coinPrice > 0 && coinPrice < 100000) {
      effectivePrice = coinPrice;
      priceSourceText = "state";
      console.log(`✅ Using price from state: $${effectivePrice}`);
    }

    // If price is still 0 or invalid, use a hardcoded fallback for QRL
    if ((effectivePrice === 0 || effectivePrice > 100000) && coin === "QRL") {
      effectivePrice = 0.96;
      priceSourceText = "hardcoded";
      console.log(`⚠️ Using hardcoded price for QRL: $${effectivePrice}`);
    }

    // If price is still invalid, skip USD calculations
    const isValidPrice = effectivePrice > 0 && effectivePrice < 100000;

    // Calculate 1h profit
    const oneHourProfit = calculate1hProfit(hashrate1h, effectivePrice);

    const coinSymbol = coin || "QRL";

    console.log("💰 FINAL Price Debug:", {
      effectivePrice,
      priceSourceText,
      isValidPrice,
      pendingNum,
      totalPaidNum,
      paid24hNum,
      paidWeekNum,
      pendingUsd: pendingNum * effectivePrice,
      totalPaidUsd: totalPaidNum * effectivePrice,
      oneHourProfit,
    });

    return (
      <div className="herominers-dashboard">
        {/* Live Stats Section */}
        <div className="stats-section">
          <h4>📊 Live Stats</h4>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-label">Current Hashrate</span>
              <span className="stat-value highlight">
                {liveStats.currentHashrate || "0 H/s"}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Avg 15m</span>
              <span className="stat-value">{hashrate15m}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Avg 1h</span>
              <span className="stat-value">{hashrate1h}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Avg 6h</span>
              <span className="stat-value">{liveStats.avg6h || "0 H/s"}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Avg 24h</span>
              <span className="stat-value">{liveStats.avg24h || "0 H/s"}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Last Share</span>
              <span className="stat-value">{liveStats.lastShare || "N/A"}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Total Hashes</span>
              <span className="stat-value">{liveStats.totalHashes || "0"}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Workers Online</span>
              <span className="stat-value">
                {liveStats.workersOnline || 0} / {liveStats.workersTotal || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Stats Section */}
        <div className="stats-section">
          <h4>💰 Payments</h4>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-label">Pending Balance</span>
              <span className="stat-value highlight">
                {pendingBalanceRaw}
                {isValidPrice && pendingNum > 0 && (
                  <span className="stat-value-usd" style={{ display: 'block', fontSize: '12px', fontWeight: 'normal' }}>
                    (${formatNumberWithCommas(pendingNum * effectivePrice)} USD)
                  </span>
                )}
              </span>
            </div>

            <div className="stat-item">
              <span className="stat-label">Total Paid</span>
              <span className="stat-value">
                {totalPaidRaw}
                {isValidPrice && totalPaidNum > 0 && (
                  <span className="stat-value-usd" style={{ display: 'block', fontSize: '12px', fontWeight: 'normal' }}>
                    (${formatNumberWithCommas(totalPaidNum * effectivePrice)} USD)
                  </span>
                )}
              </span>
            </div>

            <div className="stat-item">
              <span className="stat-label">Last 24h Paid</span>
              <span className="stat-value">
                {paid24hRaw}
                {isValidPrice && paid24hNum > 0 && (
                  <span className="stat-value-usd" style={{ display: 'block', fontSize: '12px', fontWeight: 'normal' }}>
                    (${formatNumberWithCommas(paid24hNum * effectivePrice)} USD)
                  </span>
                )}
              </span>
            </div>

            <div className="stat-item">
              <span className="stat-label">Last Week Paid</span>
              <span className="stat-value">
                {paidWeekRaw}
                {isValidPrice && paidWeekNum > 0 && (
                  <span className="stat-value-usd" style={{ display: 'block', fontSize: '12px', fontWeight: 'normal' }}>
                    (${formatNumberWithCommas(paidWeekNum * effectivePrice)} USD)
                  </span>
                )}
              </span>
            </div>

            {/* 1h Profit Estimate */}
            <div className="stat-item" style={{ gridColumn: 'span 2' }}>
              <span className="stat-label">1h Profit Estimate</span>
              <span className="stat-value highlight" style={{ color: '#fbbf24' }}>
                {oneHourProfit > 0 ? formatUsd(oneHourProfit) : 'N/A'}
                {isValidPrice && oneHourProfit > 0 && (
                  <span className="stat-value-usd" style={{ display: 'block', fontSize: '12px', fontWeight: 'normal', color: '#94a3b8' }}>
                    Based on 1h avg hashrate ({hashrate1h})
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Coin Stats Section */}
        {coinStats && coinStats.length > 0 && (
          <div className="stats-section">
            <h4>🪙 Coin Breakdown</h4>
            <div className="stats-grid">
              {(coinStats || []).map((cs) => (
                <div className="stat-item" key={cs.coin}>
                  <span className="stat-label">{cs.coin} Hashrate</span>
                  <span className="stat-value">{cs.hashrate}</span>
                </div>
              ))}
              {(coinStats || []).map((cs) => (
                <div className="stat-item" key={`${cs.coin}-unpaid`}>
                  <span className="stat-label">{cs.coin} Unpaid</span>
                  <span className="stat-value">
                    {cs.unpaid?.toLocaleString()}
                    {cs.priceUsd > 0 && cs.priceUsd < 100000 && (
                      <span className="stat-value-usd" style={{ display: 'block', fontSize: '12px', fontWeight: 'normal' }}>
                        (${formatNumberWithCommas(cs.unpaid * cs.priceUsd)} USD)
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mining Details Section */}
        <div className="stats-section">
          <h4>⛏️ Mining Details</h4>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-label">Valid Shares</span>
              <span className="stat-value success">
                {validShares.toLocaleString()}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Stale Shares</span>
              <span className="stat-value warning">
                {staleShares.toLocaleString()}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Invalid Shares</span>
              <span className="stat-value error">
                {invalidShares.toLocaleString()}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Efficiency</span>
              <span className="stat-value">{efficiency}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Blocks Found</span>
              <span className="stat-value highlight">{blocksFound}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Round Contribution</span>
              <span className="stat-value">{roundContribution}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Payout Estimate</span>
              <span className="stat-value">{payoutEstimate}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Hashrate 15m</span>
              <span className="stat-value">{hashrate15m}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Hashrate 1h</span>
              <span className="stat-value">{hashrate1h}</span>
            </div>
          </div>
        </div>

        {/* Worker Stats Section */}
        {workerStats && workerStats.total > 0 && (
          <div className="stats-section">
            <h4>👷 Worker Summary</h4>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">Total Workers</span>
                <span className="stat-value">{workerStats.total}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Pool Workers</span>
                <span className="stat-value">{workerStats.pool || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Solo Workers</span>
                <span className="stat-value">{workerStats.solo || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Total Hashrate</span>
                <span className="stat-value">
                  {workerStats.totalHashrate || "0 H/s"}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Total Shares</span>
                <span className="stat-value">
                  {workerStats.totalShares || "0"}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Total Blocks</span>
                <span className="stat-value">
                  {workerStats.totalBlocksFound || 0}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Charts */}
        {charts.hashrate && charts.hashrate.length > 0 && (
          <div className="chart-section">
            <h4>📈 Hashrate Chart</h4>
            <div className="chart-placeholder">
              <div className="chart-bars">
                {charts.hashrate.slice(-24).map((point, i) => {
                  const max = Math.max(
                    ...charts.hashrate.map((p) => p.hashrate || 0),
                  );
                  const height = max > 0 ? (point.hashrate / max) * 100 : 0;
                  return (
                    <div key={i} className="chart-bar-wrapper">
                      <div
                        className="chart-bar"
                        style={{ height: `${Math.max(5, height)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="chart-labels">
                <span>1d</span>
                <span>12h</span>
                <span>Now</span>
              </div>
            </div>
          </div>
        )}

        {/* Last Update */}
        {lastUpdate && (
          <div className="update-info">
            Last updated: {lastUpdate.toLocaleString()}
            {isValidPrice && (
              <span style={{ marginLeft: "12px", color: "#34d399" }}>
                {coin} Price: ${effectivePrice.toFixed(4)} ({priceSourceText})
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="herominers-card">
      <div className="card-header">
        <h3>🔍 HeroMiners Address Lookup</h3>
        <div className="card-actions">
          {stats && (
            <button
              className="btn-sm"
              onClick={() =>
                setViewMode(viewMode === "dashboard" ? "raw" : "dashboard")
              }
            >
              {viewMode === "dashboard" ? "View Raw" : "View Dashboard"}
            </button>
          )}
        </div>
      </div>
      <div className="search-section">
        <div className="search-row">
          <div className="coin-input-wrapper">
            <input
              type="text"
              value={coin}
              onChange={(e) => setCoin(e.target.value.toUpperCase())}
              onKeyPress={handleKeyPress}
              placeholder="Coin (e.g., QRL)"
              className="address-input"
            />
          </div>
          <div className="address-input-wrapper">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter your wallet address"
              className="address-input"
            />
          </div>
          {onPaste && stats?.coinStats && (
            <button
              className="btn-primary"
              onClick={() => onPaste(stats.coinStats)}
            >
              📋 Paste
            </button>
          )}
          <button
            className="btn-primary"
            onClick={handleLookup}
            disabled={loading}
          >
            {loading ? "⏳" : "🔍 Lookup"}
          </button>
        </div>
      </div>
      {error && <div className="error-message">❌ {error}</div>}
      {stats && (
        <div className="stats-content">
          {viewMode === "dashboard" ? (
            renderDashboard()
          ) : (
            <pre className="raw-data">{JSON.stringify(stats, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}