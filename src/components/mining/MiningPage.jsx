// MiningPage.jsx - FULL-WIDTH RESPONSIVE REDESIGN

import DashboardHeader from "../Dashboard/DashboardHeader.jsx";
import HeroMinersCard from "./HeroMinersCard.jsx";
import MiningCoin, { HeaderCell, BodyCell } from "./MiningCoin.jsx";
import { RentedRigProvider } from "../mrr/RentedRigContext.jsx";
import {
  MiningWorkspaceProvider,
  useMiningWorkspace,
} from "./MiningWorkspaceProvider";
import { btcValue, compactNumber, percentValue } from "./miningWorkspaceData";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useAsyncButtonState } from "./useAsyncButtonState.js";
import TelegramSendModal from "./TelegramSendModal.jsx";
import { useTelegramMine, TelegramMineProvider } from "../mrr/TelegramMineContext.jsx";
import { CoinPriceProvider, useCoinPrice } from "./CoinPriceContext.jsx";

const HEARTBEAT_INTERVAL_MS = 120000;
const HEARTBEAT_COOLDOWN_MS = 60000;

// ============================================
// STAT CARDS
// ============================================

function StatCard({ label, value, accent }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      padding: "clamp(8px, 1vw, 12px)",
      borderRadius: "10px",
      border: "1px solid rgba(148,163,184,0.12)",
      background: "rgba(15,23,42,0.74)",
      boxShadow: "0 12px 24px rgba(0,0,0,0.15)",
      minHeight: "clamp(60px, 8vh, 80px)",
    }}>
      <div style={{
        color: "#64748b",
        fontSize: "clamp(8px, 0.7vw, 10px)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        textAlign: "center",
      }}>
        {label}
      </div>
      <div style={{
        color: accent,
        fontSize: "clamp(16px, 1.8vw, 22px)",
        lineHeight: 1.1,
        fontWeight: 900,
        marginTop: "4px",
      }}>
        {value}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }) {
  return (
    <div style={{
      padding: "clamp(6px, 0.6vw, 10px)",
      borderRadius: "8px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(148,163,184,0.08)",
    }}>
      <div style={{
        color: "#64748b",
        fontSize: "clamp(8px, 0.6vw, 10px)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}>
        {label}
      </div>
      <div style={{
        color: tone,
        fontSize: "clamp(13px, 1.2vw, 16px)",
        fontWeight: 900,
        marginTop: "3px",
      }}>
        {value}
      </div>
    </div>
  );
}

// ============================================
// HEARTBEAT BADGE
// ============================================

function HeartbeatBadge({ status, lastResult, onClick }) {
  const getBadgeStyle = () => {
    switch (status) {
      case "running": return { color: "#fbbf24", label: "Heartbeating...", pulse: true };
      case "success": return { color: "#34d399", label: "OK", pulse: false };
      case "error": return { color: "#f87171", label: "Failed", pulse: false };
      default: return { color: "#64748b", label: "Idle", pulse: false };
    }
  };

  const badge = getBadgeStyle();
  const rentals = lastResult?.summary?.totals?.rented ?? 0;
  const ghosts = lastResult?.summary?.totals?.ghost ?? 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "clamp(4px, 0.5vw, 8px)" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 10px",
        borderRadius: "999px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(148,163,184,0.1)",
        cursor: "default",
      }}>
        <span style={{
          width: "clamp(6px, 0.6vw, 8px)",
          height: "clamp(6px, 0.6vw, 8px)",
          borderRadius: "50%",
          background: badge.color,
          boxShadow: badge.pulse ? `0 0 8px ${badge.color}88` : "none",
          animation: badge.pulse ? "pulse-dot 1.5s infinite" : "none",
        }} />
        <span style={{ color: badge.color, fontSize: "clamp(9px, 0.8vw, 11px)", fontWeight: 700 }}>
          {badge.label}
        </span>
        {lastResult && status === "success" && (
          <span style={{ color: "#94a3b8", fontSize: "clamp(8px, 0.6vw, 10px)" }}>
            {rentals} rented / {ghosts} ghost
          </span>
        )}
      </div>
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}

// ============================================
// STATUS INDICATOR
// ============================================

function StatusIndicator({ label, hasData, isLoading, error, lastUpdated }) {
  const color = error ? "#f87171" : hasData ? "#34d399" : "#64748b";
  const statusText = isLoading ? "Loading..." : error ? "Error" : hasData ? "OK" : "No Data";

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'clamp(8px, 0.6vw, 10px)', color: '#94a3b8' }}>
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: color,
        animation: isLoading ? 'pulse-dot 1.5s infinite' : 'none',
      }} />
      <span style={{ whiteSpace: 'nowrap' }}>{label}:</span>
      <span style={{ color, fontWeight: 600, whiteSpace: 'nowrap' }}>{statusText}</span>
      {lastUpdated && !isLoading && (
        <span style={{ color: '#64748b', marginLeft: '4px', whiteSpace: 'nowrap' }}>
          ({new Date(lastUpdated).toLocaleTimeString()})
        </span>
      )}
    </div>
  );
}

// ============================================
// MAIN ROUTE HERO
// ============================================

function MiningRouteHero({ onCall }) {
  const {
    opportunities,
    heroStats,
    heroLoading,
    heroError,
    dutchStats,
    dutchLoading,
    dutchError,
    minerstatLoading,
    minerstatError,
    wtmLoading,
    wtmError,
    hashrateNoLoading,
    hashrateNoError,
    loading,
    error,
    lastUpdated,
    refresh,
    priceFetchStatus
  } = useMiningWorkspace();
  const { openCoinModal } = useCoinPrice();
  const { notify: sendMineNotice } = useTelegramMine();

  const [heartbeatStatus, setHeartbeatStatus] = useState("idle");
  const [lastHeartbeatResult, setLastHeartbeatResult] = useState(null);
  const [lastHeartbeatTime, setLastHeartbeatTime] = useState(null);
  const heartbeatTimerRef = useRef(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const heartbeatCooldownRef = useRef(0);

  const hasHeroData = !!heroStats?.coinStats?.length;
  const hasDutchData = !!dutchStats?.coinStats?.length;
  const hasMinerstatData = useMiningWorkspace().hasMinerstatData;
  const hasWtmData = useMiningWorkspace().hasWtmData;
  const hasHashrateNoData = useMiningWorkspace().hasHashrateNoData;

  const bestRoute = opportunities[0] || null;
  const activeRouteCount = opportunities.filter(
    (route) => route.miningDutchBtcPerDay > 0 || route.heroMiners > 0,
  ).length;
  const profitableCount = opportunities.filter((route) => route.spread > 0).length;
  const bestOpportunity = opportunities[0] || null;

  const { status: priceUpdateStatus, trigger: triggerPriceUpdate } = useAsyncButtonState(3000);

  const runHeartbeat = useCallback(async (isAuto = false) => {
    if (!isAuto) {
      const now = Date.now();
      if (now - heartbeatCooldownRef.current < HEARTBEAT_COOLDOWN_MS) return;
      heartbeatCooldownRef.current = now;
    }
    setHeartbeatStatus("running");
    try {
      const res = await onCall("/api/v2/mrr/monitor/run", {
        method: "POST", body: { client: "ALL" }, silent: true,
      });
      setLastHeartbeatResult(res);
      setLastHeartbeatTime(Date.now());
      setHeartbeatStatus("success");
      refresh(true);
      return res;
    } catch (err) {
      setHeartbeatStatus("error");
      console.error("[Heartbeat] Failed:", err.message);
      return null;
    }
  }, [onCall, refresh]);

  useEffect(() => {
    if (!autoRefresh) {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      return;
    }
    heartbeatTimerRef.current = setInterval(() => runHeartbeat(true), HEARTBEAT_INTERVAL_MS);
    return () => { if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current); };
  }, [runHeartbeat, autoRefresh]);

  useEffect(() => {
    if (!lastUpdated) refresh(true);
  }, [lastUpdated, refresh]);

  const handleUpdatePrices = useCallback(async () => {
    await triggerPriceUpdate(async () => {
      try {
        const res = await onCall("/api/v2/prices/update", { method: "POST", silent: true });
        if (!res?.success) throw new Error(res?.error || "API returned failure");
        refresh(true);
      } catch (err) { console.error("[Prices] Update failed:", err.message); throw err; }
    });
  }, [onCall, triggerPriceUpdate, refresh]);

  const handleForceHeartbeat = useCallback(async () => {
    try {
      await sendMineNotice("🔍 Monitor heartbeat triggered...");
      const res = await runHeartbeat(false);
      if (res?.summary?.totals) {
        const { rented, ghost } = res.summary.totals;
        await sendMineNotice(`✅ Heartbeat complete. Active: ${rented || 0}, Ghost: ${ghost || 0}`);
      } else await sendMineNotice("✅ Heartbeat complete.");
    } catch (err) { await sendMineNotice(`❌ Heartbeat failed: ${err.message}`); }
  }, [runHeartbeat, sendMineNotice]);

  const priceUpdateButtonText = useMemo(() => ({
    running: "Updating...", success: "✅ Prices Updated", error: "❌ Failed", idle: "Update Prices",
  }[priceUpdateStatus]), [priceUpdateStatus]);

  const heartbeatTimeAgo = useMemo(() => {
    if (!lastHeartbeatTime) return null;
    const diff = Date.now() - lastHeartbeatTime;
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  }, [lastHeartbeatTime]);

  return (
    <section style={{ display: "grid", gap: "clamp(8px, 1vw, 12px)", marginBottom: "12px", width: "100%" }}>
      {/* Heartbeat Status Bar */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "clamp(8px, 1vw, 12px)",
        padding: "clamp(6px, 0.6vw, 10px) clamp(10px, 1vw, 16px)",
        borderRadius: "10px",
        border: "1px solid rgba(148,163,184,0.10)",
        background: "rgba(2,6,23,0.45)",
        width: "100%",
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(8px, 1vw, 12px)', flexWrap: 'wrap' }}>
          <HeartbeatBadge status={heartbeatStatus} lastResult={lastHeartbeatResult} />
          <div style={{ width: '1px', height: '20px', background: 'rgba(148,163,184,0.15)' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '4px 12px' }}>
            <StatusIndicator label="HeroMiners" hasData={hasHeroData} isLoading={heroLoading} error={heroError} lastUpdated={heroStats?.fetchedAt} />
            <StatusIndicator label="Mining-Dutch" hasData={hasDutchData} isLoading={dutchLoading} error={dutchError} lastUpdated={dutchStats?.fetchedAt} />
            <StatusIndicator label="Minerstat" hasData={hasMinerstatData} isLoading={minerstatLoading} error={minerstatError} />
            <StatusIndicator label="WhatToMine" hasData={hasWtmData} isLoading={wtmLoading} error={wtmError} />
            <StatusIndicator label="Hashrate.no" hasData={hasHashrateNoData} isLoading={hashrateNoLoading} error={hashrateNoError} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(6px, 0.5vw, 10px)', flexWrap: 'wrap' }}>
          {heartbeatTimeAgo && <span style={{ color: "#64748b", fontSize: "clamp(8px, 0.6vw, 10px)", fontStyle: 'italic' }}>Last: {heartbeatTimeAgo}</span>}
          <button className="btn-pro secondary" onClick={() => setAutoRefresh(prev => !prev)} style={{
            fontSize: "clamp(9px, 0.7vw, 11px)",
            padding: "4px 10px",
            minWidth: '100px',
            color: autoRefresh ? '#34d399' : '#f87171',
          }}>
            {autoRefresh ? "🔄 Auto: ON" : "⏸ Auto: OFF"}
          </button>
          <button className="btn-pro secondary" onClick={handleForceHeartbeat} disabled={heartbeatStatus === "running"} style={{ fontSize: "clamp(9px, 0.7vw, 11px)", padding: "4px 10px" }}>
            {heartbeatStatus === "running" ? "⏳" : "💓 Force"}
          </button>
          <button className="btn-pro secondary" onClick={handleUpdatePrices} disabled={priceUpdateStatus === "running"} style={{ fontSize: "clamp(9px, 0.7vw, 11px)", padding: "4px 10px" }}>
            {priceUpdateButtonText}
          </button>
          <button className="btn-pro secondary" onClick={() => void refresh(true)} disabled={loading} style={{ fontSize: "clamp(9px, 0.7vw, 11px)", padding: "4px 10px" }}>
            {loading ? "⏳" : "🔄 Routes"}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "clamp(8px, 1vw, 12px)", width: "100%" }}>
        <StatCard label="Tracked HeroMiners" value={compactNumber(heroStats?.coinStats?.length || 0, 0)} accent="#38bdf8" />
        <StatCard label="Mining-Dutch algos" value={compactNumber(dutchStats?.coinStats?.length || 0, 0)} accent="#fbbf24" />
        <StatCard label="Positive spread" value={compactNumber(profitableCount, 0)} accent="#34d399" />
        <StatCard label="Active routes" value={compactNumber(activeRouteCount, 0)} accent="#a78bfa" />
      </div>

      {/* Best Route & Top Candidates */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "clamp(8px, 1vw, 12px)", width: "100%" }}>
        <div style={{
          padding: "clamp(10px, 1vw, 14px)",
          borderRadius: "12px",
          border: "1px solid rgba(148,163,184,0.12)",
          background: "linear-gradient(135deg, rgba(15,23,42,0.9), rgba(15,23,42,0.55))",
          boxShadow: "0 18px 40px rgba(0,0,0,0.20)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
            <div>
              <div style={{ color: "#38bdf8", fontSize: "clamp(9px, 0.7vw, 11px)", textTransform: "uppercase", letterSpacing: "0.12em" }}>Route Intel</div>
              <div style={{ color: "#f8fafc", fontSize: "clamp(13px, 1.2vw, 16px)", fontWeight: 800 }}>Best route</div>
            </div>
          </div>
          {error && <div style={{ color: "#f87171", fontSize: "clamp(10px, 0.8vw, 12px)", marginBottom: "10px" }}>{error}</div>}
          {bestRoute ? (
            <div style={{
              display: "grid", gap: "4px", padding: "clamp(8px, 0.8vw, 12px)",
              borderRadius: "10px", background: "rgba(2,6,23,0.45)",
              border: "1px solid rgba(148,163,184,0.10)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: "#e2e8f0", fontSize: "clamp(14px, 1.4vw, 18px)", fontWeight: 800 }}>{bestOpportunity?.label}</div>
                  <div style={{ color: "#94a3b8", fontSize: "clamp(8px, 0.6vw, 10px)" }}>{bestOpportunity?.bestSource} to NiceHash / MRR mapping</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#34d399", fontSize: "clamp(14px, 1.4vw, 18px)", fontWeight: 800 }}>{btcValue(bestOpportunity?.miningDutchBtcPerDay)}</div>
                  <div style={{ color: "#94a3b8", fontSize: "clamp(9px, 0.7vw, 11px)" }}>BTC/day</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "clamp(8px, 0.8vw, 12px)", flexWrap: "wrap", color: "#cbd5e1", fontSize: "clamp(10px, 0.8vw, 12px)" }}>
                <span>NiceHash: {bestOpportunity?.nicehashAlgo}</span>
                <span>MRR: {bestOpportunity?.mrrAlgo}</span>
                <span>Spread: {bestOpportunity?.spread === null ? "N/A" : percentValue(bestOpportunity?.spread)}</span>
                <span>Hero miners: {compactNumber(bestRoute?.heroMiners, 0)}</span>
              </div>
            </div>
          ) : (
            <div style={{ color: "#94a3b8", fontSize: "clamp(10px, 0.8vw, 12px)", padding: "8px 0" }}>No route data yet.</div>
          )}
          <div style={{ marginTop: "10px", color: "#64748b", fontSize: "clamp(9px, 0.7vw, 11px)" }}>
            {lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : "Waiting for initial mining sync..."}
          </div>
        </div>

        <div style={{
          padding: "clamp(10px, 1vw, 14px)",
          borderRadius: "12px",
          border: "1px solid rgba(148,163,184,0.12)",
          background: "linear-gradient(135deg, rgba(15,23,42,0.82), rgba(2,6,23,0.78))",
          boxShadow: "0 18px 40px rgba(0,0,0,0.20)",
        }}>
          <div style={{ color: "#f8fafc", fontSize: "clamp(11px, 1vw, 13px)", fontWeight: 800, marginBottom: "8px" }}>Top Route Candidates</div>
          <div style={{ display: "grid", gap: "8px", maxHeight: "170px", overflow: "auto" }}>
            {opportunities.slice(0, 5).map((route) => (
              <div key={route.nicehashAlgo} style={{
                display: "flex", justifyContent: "space-between", gap: "10px",
                padding: "6px 8px", borderRadius: "8px", background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(148,163,184,0.08)",
              }}>
                <div>
                  <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: "clamp(10px, 0.8vw, 12px)" }}>{route.label}</div>
                  <div style={{ color: "#64748b", fontSize: "clamp(9px, 0.7vw, 11px)" }}>{route.nicehashAlgo} • {route.mrrAlgo}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: route.spread > 0 ? "#34d399" : "#94a3b8", fontWeight: 800, fontSize: "clamp(10px, 0.8vw, 12px)" }}>{btcValue(route.miningDutchBtcPerDay)}</div>
                  <div style={{ color: "#64748b", fontSize: "clamp(9px, 0.7vw, 11px)" }}>{route.spread === null ? "N/A" : percentValue(route.spread)}</div>
                </div>
              </div>
            ))}
            {opportunities.length === 0 && <div style={{ color: "#94a3b8", fontSize: "clamp(10px, 0.8vw, 12px)" }}>No route candidates available.</div>}
          </div>
        </div>
      </div>

      {/* Opportunity Finder */}
      <div style={{
        padding: "clamp(10px, 1vw, 14px)",
        borderRadius: "12px",
        border: "1px solid rgba(148,163,184,0.12)",
        background: "rgba(15,23,42,0.72)",
        boxShadow: "0 18px 40px rgba(0,0,0,0.20)",
        width: "100%",
        overflow: "hidden",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
          <div>
            <div style={{ color: "#38bdf8", fontSize: "clamp(9px, 0.7vw, 11px)", textTransform: "uppercase", letterSpacing: "0.12em" }}>Opportunity Finder</div>
            <div style={{ color: "#f8fafc", fontSize: "clamp(13px, 1.2vw, 16px)", fontWeight: 800 }}>Pool revenue vs NiceHash / MRR market price</div>
          </div>
          <div style={{ color: "#94a3b8", fontSize: "clamp(10px, 0.8vw, 12px)" }}>Compare across all three sources</div>
        </div>

        {bestOpportunity ? (
          <div style={{
            display: "grid", gap: "6px", marginBottom: "10px", padding: "clamp(8px, 0.8vw, 12px)",
            borderRadius: "10px", border: "1px solid rgba(148,163,184,0.10)",
            background: "linear-gradient(135deg, rgba(2,6,23,0.45), rgba(15,23,42,0.88))",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <div style={{ color: "#e2e8f0", fontSize: "clamp(14px, 1.4vw, 18px)", fontWeight: 900 }}>{bestOpportunity.label}</div>
                <div style={{ color: "#94a3b8", fontSize: "clamp(8px, 0.6vw, 10px)" }}>Winner: {bestOpportunity.winner} · NiceHash {bestOpportunity.nicehashAlgo} · MRR {bestOpportunity.mrrAlgo}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: bestOpportunity.opportunityScore >= 0 ? "#34d399" : "#f87171", fontSize: "clamp(13px, 1.2vw, 16px)", fontWeight: 900 }}>{btcValue(bestOpportunity.opportunityScore)}</div>
                <div style={{ color: "#94a3b8", fontSize: "clamp(9px, 0.7vw, 11px)" }}>Opportunity BTC/day</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "clamp(6px, 0.5vw, 10px)" }}>
              <MiniStat label="Pool revenue" value={btcValue(bestOpportunity.poolRevenue)} tone="#34d399" />
              <MiniStat label="NiceHash buy/day" value={btcValue(bestOpportunity.niceHashPrice)} tone="#60a5fa" />
              <MiniStat label="MRR market/day" value={btcValue(bestOpportunity.mrrMarketPrice)} tone="#fbbf24" />
              <MiniStat label="Spread vs NH" value={bestOpportunity.spreadVsNh === null ? "N/A" : percentValue(bestOpportunity.spreadVsNh)} tone="#a78bfa" />
            </div>
          </div>
        ) : (
          <div style={{ color: "#94a3b8", fontSize: "clamp(10px, 0.8vw, 12px)" }}>No opportunity rows yet.</div>
        )}

        {priceFetchStatus && Object.keys(priceFetchStatus).length > 0 && (
          <div style={{ marginTop: "12px", padding: "10px", borderRadius: "8px", background: "rgba(15,23,42,0.5)", border: "1px solid rgba(148,163,184,0.12)" }}>
            <details>
              <summary style={{ color: "#94a3b8", fontSize: "clamp(9px, 0.7vw, 11px)", cursor: "pointer" }}>Price Fetch Status ({Object.keys(priceFetchStatus).length} algos)</summary>
              <div style={{ marginTop: "8px", fontSize: "clamp(8px, 0.6vw, 10px)" }}>
                {Object.entries(priceFetchStatus).map(([algo, status]) => (
                  <div key={algo} style={{ color: "#64748b", padding: "2px 0" }}>
                    <span style={{ color: "#e2e8f0" }}>{algo}:</span> {status}
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        <div style={{ overflowX: "auto", width: "100%" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "700px", fontSize: "clamp(10px, 0.8vw, 12px)" }}>
            <thead>
              <tr style={{ color: "#94a3b8", borderBottom: "1px solid rgba(148,163,184,0.12)" }}>
                <HeaderCell align="left">Algo</HeaderCell>
                <HeaderCell align="left">Winner</HeaderCell>
                <HeaderCell>Pool</HeaderCell>
                <HeaderCell>NH</HeaderCell>
                <HeaderCell>MRR</HeaderCell>
                <HeaderCell>Spread NH</HeaderCell>
                <HeaderCell>Spread MRR</HeaderCell>
                <HeaderCell>Coins</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {opportunities.slice(0, 10).map((row) => (
                <tr key={row.nicehashAlgo} style={{ borderBottom: "1px solid rgba(148,163,184,0.08)" }}>
                  <BodyCell align="left">
                    <strong style={{ color: "#e2e8f0", fontSize: "clamp(10px, 0.8vw, 12px)" }}>{row.label}</strong>
                    <div style={{ color: "#64748b", fontSize: "clamp(8px, 0.6vw, 10px)", marginTop: "2px" }}>{row.nicehashAlgo} • {row.mrrAlgo}</div>
                  </BodyCell>
                  <BodyCell align="left">{row.winner}</BodyCell>
                  <BodyCell><strong style={{ color: "#34d399", fontSize: "clamp(10px, 0.8vw, 12px)" }}>{btcValue(row.poolRevenue)}</strong></BodyCell>
                  <BodyCell><strong style={{ color: "#60a5fa", fontSize: "clamp(10px, 0.8vw, 12px)" }}>{btcValue(row.niceHashPrice)}</strong></BodyCell>
                  <BodyCell><strong style={{ color: "#fbbf24", fontSize: "clamp(10px, 0.8vw, 12px)" }}>{btcValue(row.mrrMarketPrice)}</strong></BodyCell>
                  <BodyCell>
                    <span style={{ color: row.spreadVsNh > 0 ? "#34d399" : row.spreadVsNh < 0 ? "#f87171" : "#94a3b8", fontWeight: 700, fontSize: "clamp(9px, 0.7vw, 11px)" }}>
                      {row.spreadVsNh === null ? "N/A" : percentValue(row.spreadVsNh)}
                    </span>
                  </BodyCell>
                  <BodyCell>
                    <span style={{ color: row.spreadVsMrr > 0 ? "#34d399" : row.spreadVsMrr < 0 ? "#f87171" : "#94a3b8", fontWeight: 700, fontSize: "clamp(9px, 0.7vw, 11px)" }}>
                      {row.spreadVsMrr === null ? "N/A" : percentValue(row.spreadVsMrr)}
                    </span>
                  </BodyCell>
                  <BodyCell align="left">
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {row.heroCoins.slice(0, 5).map((coin) => (
                        <button key={coin} onClick={() => openCoinModal(coin)} style={{
                          border: "1px solid rgba(96,165,250,0.22)", color: "#bfdbfe",
                          background: "rgba(37,99,235,0.12)", borderRadius: "999px",
                          padding: "1px 6px", fontSize: "clamp(8px, 0.6vw, 10px)", cursor: "pointer",
                          transition: "all 0.2s",
                        }}>
                          {coin}
                        </button>
                      ))}
                      {row.heroCoins.length > 5 && (
                        <span style={{ color: "#64748b", fontSize: "clamp(8px, 0.6vw, 10px)" }}>+{row.heroCoins.length - 5}</span>
                      )}
                    </div>
                  </BodyCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ============================================
// SHELL
// ============================================

function MiningWorkspaceShell({
  onNavigateHome,
  onCall,
  nhClient,
  state,
  dispatch,
  currentUser,
  isAdmin,
  forceCheckStatus,
  handleLogout,
  onNavigate,
}) {
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);

  return (
    <TelegramMineProvider onCall={onCall}>
      <div className="app-shell mining-shell" style={{
        padding: "0",
        width: "100%",
        maxWidth: "none",
        margin: "0 auto",
        background: "radial-gradient(circle at top left, rgba(56,189,248,0.16), transparent 32%), radial-gradient(circle at top right, rgba(16,185,129,0.14), transparent 28%), linear-gradient(180deg, rgba(2,6,23,0.95), rgba(15,23,42,0.96))",
        minHeight: "100vh",
        width: "100%",
      }}>
        <header style={{
          padding: "clamp(12px, 1.5vw, 20px) 0 clamp(8px, 1vw, 12px)",
          marginBottom: "clamp(8px, 1vw, 12px)",
          borderBottom: "1px solid rgba(148,163,184,0.10)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: "clamp(10px, 1.2vw, 16px)",
          flexWrap: "wrap",
          width: "100%",
        }}>
          <DashboardHeader
            state={state}
            currentUser={currentUser}
            isAdmin={isAdmin}
            onForceCheck={forceCheckStatus}
            onDebugLogs={() => dispatch({ type: "SET_DEBUG_MODAL", payload: true })}
            onLogout={handleLogout}
            onUsers={() => dispatch({ type: "SET_USERS_MODAL", payload: true })}
            onCalculator={() => dispatch({ type: "SET_CALCULATOR_MODAL", payload: true })}
            onNavigate={onNavigate}
            currentView="mining"
          />
        </header>

        <TelegramSendModal isOpen={telegramModalOpen} onClose={() => setTelegramModalOpen(false)} />
        <MiningRouteHero onCall={onCall} />

        <section style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "clamp(10px, 1vw, 16px)",
          alignItems: "start",
          width: "100%",
          marginTop: "clamp(10px, 1vw, 16px)",
        }}>
          <article style={{
            padding: "clamp(10px, 1vw, 14px)",
            background: "rgba(15,23,42,0.72)",
            border: "1px solid rgba(148,163,184,0.12)",
            borderRadius: "12px",
            boxShadow: "0 18px 40px rgba(0,0,0,0.20)",
            width: "100%",
            overflow: "hidden",
          }}>
            <HeroMinersCard onCall={onCall} />
          </article>
          <aside style={{
            padding: "clamp(10px, 1vw, 14px)",
            background: "rgba(15,23,42,0.72)",
            border: "1px solid rgba(148,163,184,0.12)",
            borderRadius: "12px",
            boxShadow: "0 18px 40px rgba(0,0,0,0.20)",
            width: "100%",
            overflow: "hidden",
          }}>
            <MiningCoin onCall={onCall} nhClient={nhClient} />
          </aside>
        </section>
      </div>
    </TelegramMineProvider>
  );
}

// ============================================
// MAIN EXPORT
// ============================================

export default function MiningPage({
  onCall,
  nhClient = "BT",
  onNavigateHome,
  state,
  dispatch,
  currentUser,
  isAdmin,
  forceCheckStatus,
  handleLogout,
  onNavigate,
}) {
  return (
    <RentedRigProvider callApi={onCall}>
      <MiningWorkspaceProvider onCall={onCall} nhClient={nhClient} mrrClient={state?.mrrClient || "BT"}>
        <CoinPriceProvider onCall={onCall}>
          <div className="page-full">
            <MiningWorkspaceShell {...{ onNavigateHome, onCall, nhClient, state, dispatch, currentUser, isAdmin, forceCheckStatus, handleLogout, onNavigate }} />
          </div>
        </CoinPriceProvider>
      </MiningWorkspaceProvider>
    </RentedRigProvider>
  );
}