// MiningPage.jsx - COMPACT REASONING VIEW
// Pool Lookup moved to top, opportunistic routes tightened

import DashboardHeader from "../Dashboard/DashboardHeader.jsx";
import HeroMinersCard from "./HeroMinersCard.jsx";
import HeroMinersLookup from "./HeroMinersLookup.jsx";
import MiningCoin, { HeaderCell, BodyCell } from "./MiningCoin.jsx";
import { RentedRigProvider } from "../mrr/RentedRigContext.jsx";
import {
  MiningWorkspaceProvider,
  useMiningWorkspace,
} from "./MiningWorkspaceProvider";
import { btcValue, compactNumber, percentValue } from "./miningWorkspaceData";
import { NiceHashOrderProvider } from "../nicehash/NiceHashContext.jsx";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useAsyncButtonState } from "./useAsyncButtonState.js";
import TelegramSendModal from "./TelegramSendModal.jsx";
import { useTelegramMine, TelegramMineProvider } from "../mrr/TelegramMineContext.jsx";
import { CoinPriceProvider, useCoinPrice } from "./CoinPriceContext.jsx";
import {
  MinerstatCard,
  WhatToMineCard,
  HashrateNoCard,
  MiningDutchPoolCard,
  K1PoolCard,
  KryptexCard,
  TwoMinersPoolCard,
} from "./pools/index.js";

const HEARTBEAT_INTERVAL_MS = 120000;
const HEARTBEAT_COOLDOWN_MS = 60000;

// ============================================
// STATUS BAR (compact)
// ============================================

function StatusDot({ color, pulse }) {
  return (
    <span style={{
      display: "inline-block",
      width: "6px", height: "6px",
      borderRadius: "50%",
      background: color,
      boxShadow: pulse ? `0 0 6px ${color}66` : "none",
      animation: pulse ? "pulse-dot 1.5s infinite" : "none",
      marginRight: "3px",
    }} />
  );
}

// ============================================
// MINING ROUTE HERO (compact)
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
    loading,
    error,
    lastUpdated,
    refresh,
    niceHashPrices,
  } = useMiningWorkspace();
  const { openCoinModal } = useCoinPrice();
  const { notify: sendMineNotice } = useTelegramMine();
  const [heartbeatStatus, setHeartbeatStatus] = useState("idle");
  const [lastHeartbeatResult, setLastHeartbeatResult] = useState(null);
  const heartbeatTimerRef = useRef(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const heartbeatCooldownRef = useRef(0);
  const [opportunityAlertsEnabled, setOpportunityAlertsEnabled] = useState(true);

  const bestRoute = opportunities[0] || null;
  const activeRouteCount = opportunities.filter(
    (r) => (r.miningDutchBtcPerDay || 0) > 0 || (r.heroMiners || 0) > 0,
  ).length;
  const profitableCount = opportunities.filter((r) => r.spread > 0).length;
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
      const res = await onCall("/api/v2/mrr/monitor/run", { method: "POST", body: { client: "ALL" }, silent: true });
      setLastHeartbeatResult(res);
      setHeartbeatStatus("success");
      refresh(true);
      return res;
    } catch (err) { setHeartbeatStatus("error"); return null; }
  }, [onCall, refresh]);

  const fetchOpportunityAlertsStatus = useCallback(async () => {
    try {
      const res = await onCall("/api/v2/notify/opportunity-alerts/status", { silent: true });
      if (res && typeof res.enabled === 'boolean') {
        setOpportunityAlertsEnabled(res.enabled);
      }
    } catch {}
  }, [onCall]);

  const handleToggleOpportunityAlerts = useCallback(async () => {
    const newState = !opportunityAlertsEnabled;
    try {
      const res = await onCall("/api/v2/notify/opportunity-alerts/status", {
        method: "POST",
        body: { enabled: newState },
        silent: true,
      });
      if (res && typeof res.enabled === 'boolean') {
        setOpportunityAlertsEnabled(res.enabled);
      }
    } catch (err) {}
  }, [onCall, opportunityAlertsEnabled]);

  useEffect(() => {
    if (!autoRefresh) { if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current); return; }
    heartbeatTimerRef.current = setInterval(() => runHeartbeat(true), HEARTBEAT_INTERVAL_MS);
    return () => { if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current); };
  }, [runHeartbeat, autoRefresh]);

  useEffect(() => {
    if (!lastUpdated) refresh(true);
    fetchOpportunityAlertsStatus();
  }, [lastUpdated, refresh, fetchOpportunityAlertsStatus]);

  const handleForceHeartbeat = useCallback(async () => {
    try {
      await sendMineNotice("🔍 Monitor heartbeat triggered...");
      const res = await runHeartbeat(false);
      if (res?.summary?.totals) {
        await sendMineNotice(`✅ Heartbeat. Active: ${res.summary.totals.rented || 0}, Ghost: ${res.summary.totals.ghost || 0}`);
      } else await sendMineNotice("✅ Heartbeat complete.");
    } catch (err) { await sendMineNotice(`❌ Heartbeat failed: ${err.message}`); }
  }, [runHeartbeat, sendMineNotice]);

  const heartbeatTimeAgo = useMemo(() => {
    if (!lastHeartbeatResult?.summary?.totals) return null;
    return new Date().toLocaleTimeString();
  }, [lastHeartbeatResult]);

  return (
    <section style={{ display: "grid", gap: "6px", width: "100%" }}>
      {/* Top bar: compact status + controls */}
      <div style={{
        display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center",
        gap: "6px", padding: "6px 12px", borderRadius: "8px",
        border: "1px solid rgba(148,163,184,0.08)", background: "rgba(2,6,23,0.4)",
        fontSize: "clamp(9px, 0.7vw, 11px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <HeartbeatBadge status={heartbeatStatus} lastResult={lastHeartbeatResult} />
          <SourceDot label="Hero" ok={!!heroStats?.coinStats?.length} loading={heroLoading} />
          <SourceDot label="Dutch" ok={!!dutchStats?.coinStats?.length} loading={dutchLoading} />
          <StatusDot color={error ? "#f87171" : "#34d399"} />
          <span style={{ color: error ? "#f87171" : "#64748b", whiteSpace: "nowrap" }}>
            {error ? "Error" : lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "Initializing..."}
          </span>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          <ToggleBtn active={autoRefresh} onToggle={() => setAutoRefresh(p => !p)} label={autoRefresh ? "Auto ON" : "Auto OFF"} />
          <ToggleBtn active={opportunityAlertsEnabled} onToggle={handleToggleOpportunityAlerts} label={opportunityAlertsEnabled ? "Opp. Alerts ON" : "Opp. Alerts OFF"} />
          <button className="btn-pro secondary" onClick={handleForceHeartbeat} disabled={heartbeatStatus === "running"} style={{ fontSize: "clamp(9px, 0.7vw, 11px)", padding: "2px 8px" }}>
            {heartbeatStatus === "running" ? "⏳" : "💓"}
          </button>
          <button className="btn-pro secondary" onClick={() => refresh(true)} disabled={loading} style={{ fontSize: "clamp(9px, 0.7vw, 11px)", padding: "2px 8px" }}>
            {loading ? "⏳" : "🔄"}
          </button>
        </div>
      </div>

      {/* Compact route summary + table */}
      <div style={{
        border: "1px solid rgba(148,163,184,0.10)", borderRadius: "8px",
        background: "rgba(15,23,42,0.6)", overflow: "hidden",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderBottom: "1px solid rgba(148,163,184,0.06)" }}>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: "clamp(9px, 0.7vw, 11px)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Route Intel
            </span>
            <CompactStat label="Routes" value={activeRouteCount} color="#a78bfa" />
            <CompactStat label="Positive" value={profitableCount} color="#34d399" />
            <CompactStat label="NH prices" value={Object.keys(niceHashPrices || {}).length} color="#60a5fa" />
          </div>
          {bestOpportunity && (
            <div style={{ textAlign: "right", fontSize: "clamp(9px, 0.7vw, 11px)" }}>
              <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{bestOpportunity.label}</span>
              {bestOpportunity.spread > 0 && (
                <span style={{ color: "#34d399", marginLeft: "8px" }}>{percentValue(bestOpportunity.spread)}</span>
              )}
              <span style={{ color: "#64748b", marginLeft: "6px" }}>{btcValue(bestOpportunity.opportunityScore)} BTC</span>
            </div>
          )}
        </div>

        <div style={{ overflowX: "auto", maxHeight: "320px", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "clamp(9px, 0.7vw, 11px)" }}>
            <thead>
              <tr style={{ color: "#64748b", borderBottom: "1px solid rgba(148,163,184,0.08)" }}>
                <th style={{ padding: "4px 6px", textAlign: "left", fontWeight: 600 }}>Algo</th>
                <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600 }}>MD</th>
                <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600 }}>MS</th>
                <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600 }}>WTM</th>
                <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600 }}>HN</th>
                <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600 }}>NH</th>
                <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600 }}>Sprd</th>
                <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600 }}>Min</th>
                <th style={{ padding: "4px 6px", textAlign: "left", fontWeight: 600 }}>Coins</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.slice(0, 15).map((row, index) => (
                <tr key={`${row.nicehashAlgo}-${index}`} style={{ borderBottom: "1px solid rgba(148,163,184,0.04)" }}>
                  <td style={{ padding: "3px 6px", color: "#e2e8f0", whiteSpace: "nowrap" }}>
                    {row.label}
                    <span style={{ color: "#64748b", fontSize: "8px", marginLeft: "4px" }}>{row.nicehashAlgo}</span>
                  </td>
                  <td style={{ padding: "3px 6px", textAlign: "right", fontWeight: 700, color: (row.miningDutchBtcPerDay || 0) > 0 ? "#34d399" : "#64748b" }}>
                    {btcValue(row.miningDutchBtcPerDay)}
                  </td>
                  <td style={{ padding: "3px 6px", textAlign: "right", fontWeight: 700, color: (row.minerstatBtcPerDay || 0) > 0 ? "#f472b6" : "#64748b" }}>
                    {btcValue(row.minerstatBtcPerDay)}
                  </td>
                  <td style={{ padding: "3px 6px", textAlign: "right", fontWeight: 700, color: (row.wtmBtcPerDay || 0) > 0 ? "#38bdf8" : "#64748b" }}>
                    {btcValue(row.wtmBtcPerDay)}
                  </td>
                  <td style={{ padding: "3px 6px", textAlign: "right", fontWeight: 700, color: (row.hashrateNoBtcPerDay || 0) > 0 ? "#818cf8" : "#64748b" }}>
                    {btcValue(row.hashrateNoBtcPerDay)}
                  </td>
                  <td style={{ padding: "3px 6px", textAlign: "right", fontWeight: 700, color: "#60a5fa" }}>
                    {btcValue(row.niceHashPrice)}
                  </td>
                  <td style={{ padding: "3px 6px", textAlign: "right", fontWeight: 900 }}>
                    <span style={{ color: row.spread > 0 ? "#34d399" : row.spread < 0 ? "#f87171" : "#94a3b8" }}>
                      {row.spread === null ? "N/A" : percentValue(row.spread)}
                    </span>
                  </td>
                  <td style={{ padding: "3px 6px", textAlign: "right", color: "#94a3b8" }}>
                    {compactNumber(row.heroMiners, 0)}
                  </td>
                  <td style={{ padding: "3px 6px" }}>
                    <div style={{ display: "flex", gap: "2px", flexWrap: "wrap" }}>
                      {row.heroCoins?.slice(0, 4).map((c) => (
                        <button key={c} onClick={() => openCoinModal(c)} style={{
                          border: "1px solid rgba(96,165,250,0.2)", color: "#bfdbfe",
                          background: "rgba(37,99,235,0.1)", borderRadius: "99px",
                          padding: "0 4px", fontSize: "8px", cursor: "pointer", lineHeight: "14px",
                        }}>{c}</button>
                      ))}
                      {(row.heroCoins?.length || 0) > 4 && (
                        <span style={{ color: "#64748b", fontSize: "8px", lineHeight: "14px" }}>+{row.heroCoins.length - 4}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {opportunities.length === 0 && (
                <tr><td colSpan={9} style={{ padding: "16px", textAlign: "center", color: "#64748b" }}>No route data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// Small helpers
function CompactStat({ label, value, color }) {
  return (
    <span style={{ color: "#94a3b8", fontSize: "clamp(9px, 0.7vw, 11px)", whiteSpace: "nowrap" }}>
      {label}: <span style={{ color, fontWeight: 700 }}>{value}</span>
    </span>
  );
}

function ToggleBtn({ active, onToggle, label }) {
  return (
    <button className="btn-pro secondary" onClick={onToggle} style={{
      fontSize: "clamp(9px, 0.7vw, 11px)", padding: "2px 8px",
      color: active ? "#34d399" : "#f87171",
    }}>{label}</button>
  );
}

function HeartbeatBadge({ status, lastResult }) {
  const color = status === "running" ? "#fbbf24" : status === "success" ? "#34d399" : status === "error" ? "#f87171" : "#64748b";
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <StatusDot color={color} pulse={status === "running"} />
      <span style={{ color, fontWeight: 600, fontSize: "clamp(9px, 0.7vw, 11px)" }}>
        {status === "running" ? "HB..." : status === "success" ? "HB OK" : status === "error" ? "HB Fail" : "HB Idle"}
      </span>
      {lastResult?.summary?.totals && (
        <span style={{ color: "#94a3b8", fontSize: "clamp(8px, 0.6vw, 10px)" }}>
          {lastResult.summary.totals.rented || 0}r / {lastResult.summary.totals.ghost || 0}g
        </span>
      )}
    </span>
  );
}

function SourceDot({ label, ok, loading }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "3px", whiteSpace: "nowrap" }}>
      <StatusDot color={loading ? "#fbbf24" : ok ? "#34d399" : "#64748b"} pulse={loading} />
      <span style={{ color: loading ? "#fbbf24" : ok ? "#94a3b8" : "#64748b", fontSize: "clamp(8px, 0.6vw, 10px)" }}>
        {label}
      </span>
    </span>
  );
}

// ============================================
// SHELL (NEW ORDER: Pool Lookup first, then routes, then cards)
// ============================================

function MiningWorkspaceShell({
  onNavigateHome, onCall, nhClient, state, dispatch,
  currentUser, isAdmin, forceCheckStatus, handleLogout, onNavigate,
}) {
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);

  return (
    <TelegramMineProvider onCall={onCall}>
      <div className="app-shell mining-shell" style={{
        padding: "0", width: "100%", maxWidth: "none", margin: "0 auto",
        background: "radial-gradient(circle at top left, rgba(56,189,248,0.16), transparent 32%), radial-gradient(circle at top right, rgba(16,185,129,0.14), transparent 28%), linear-gradient(180deg, rgba(2,6,23,0.95), rgba(15,23,42,0.96))",
        minHeight: "100vh",
      }}>
        <header style={{
          padding: "clamp(8px, 1vw, 14px) 0 clamp(6px, 0.6vw, 10px)",
          marginBottom: "clamp(6px, 0.6vw, 10px)",
          borderBottom: "1px solid rgba(148,163,184,0.08)",
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          gap: "clamp(8px, 1vw, 12px)", flexWrap: "wrap",
        }}>
          <DashboardHeader
            state={state} currentUser={currentUser} isAdmin={isAdmin}
            onForceCheck={forceCheckStatus}
            onDebugLogs={() => dispatch({ type: "SET_DEBUG_MODAL", payload: true })}
            onLogout={handleLogout}
            onUsers={() => dispatch({ type: "SET_USERS_MODAL", payload: true })}
            onCalculator={() => dispatch({ type: "SET_CALCULATOR_MODAL", payload: true })}
            onNavigate={onNavigate} currentView="mining"
          />
        </header>

        <TelegramSendModal isOpen={telegramModalOpen} onClose={() => setTelegramModalOpen(false)} />

        {/* POOL LOOKUP — ALL IN ONE ROW */}
        <section style={{ width: "100%", marginBottom: "10px" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: "8px",
            alignItems: "start",
          }}>
            <MinerstatCard />
            <WhatToMineCard />
            <HashrateNoCard />
            <MiningDutchPoolCard />
            <HeroMinersLookup onCall={onCall} coinPrices={state.coinPrices} />
            <K1PoolCard onCall={onCall} coinPrices={state.coinPrices} />
            <KryptexCard onCall={onCall} coinPrices={state.coinPrices} />
            <TwoMinersPoolCard onCall={onCall} />
          </div>
        </section>

        {/* ROUTE INTEL — MIDDLE */}
        <MiningRouteHero onCall={onCall} />

        {/* MINING COIN ROUTER */}
        <section style={{ width: "100%", marginTop: "clamp(8px, 0.8vw, 12px)" }}>
          <div style={{
            padding: "clamp(8px, 0.8vw, 12px)",
            background: "rgba(15,23,42,0.68)",
            border: "1px solid rgba(148,163,184,0.10)",
            borderRadius: "10px",
          }}>
            <MiningCoin onCall={onCall} nhClient={nhClient} />
          </div>
        </section>
      </div>
    </TelegramMineProvider>
  );
}

export default function MiningPage({
  onCall, nhClient = "BT", onNavigateHome, state, dispatch,
  currentUser, isAdmin, forceCheckStatus, handleLogout, onNavigate,
}) {
  return (
    <RentedRigProvider callApi={onCall}>
      <MiningWorkspaceProvider onCall={onCall} nhClient={nhClient} mrrClient={state?.mrrClient || "BT"}>
        <CoinPriceProvider onCall={onCall}>
          <NiceHashOrderProvider callApi={onCall} nhClient="VN">
            <div className="page-full">
              <MiningWorkspaceShell {...{ onNavigateHome, onCall, nhClient, state, dispatch, currentUser, isAdmin, forceCheckStatus, handleLogout, onNavigate }} />
            </div>
          </NiceHashOrderProvider>
        </CoinPriceProvider>
      </MiningWorkspaceProvider>
    </RentedRigProvider>
  );
}
