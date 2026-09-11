// MiningPage.jsx - REDESIGNED
// Cleaner ops-terminal layout: readable type, SVG icon controls, no emoji glyphs.

import DashboardHeader from "../Dashboard/DashboardHeader.jsx";
import HeroMinersLookup from "./HeroMinersLookup.jsx";
import MiningCoin from "./MiningCoin.jsx";
import { RentedRigProvider } from "../mrr/RentedRigContext.jsx";
import {
  MiningWorkspaceProvider,
  useMiningWorkspace,
} from "./MiningWorkspaceProvider";
import { btcValue, compactNumber, percentValue } from "./miningWorkspaceData";
import { NiceHashOrderProvider } from "../nicehash/NiceHashContext.jsx";
import { useState, useCallback, useRef, useEffect } from "react";
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
  ExternalPoolMonitor,
} from "./pools/index.js";
import PoolMonitor from "./PoolMonitor.jsx";
import {
  RefreshIcon,
  HeartbeatIcon,
  BellIcon,
  LayersIcon,
} from "./Icons.jsx";

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
const HEARTBEAT_COOLDOWN_MS = 60000;

// Shared design tokens
const C = {
  panel: "rgba(15,23,42,0.72)",
  panelBorder: "rgba(148,163,184,0.12)",
  muted: "#64748b",
  faint: "#94a3b8",
  text: "#e2e8f0",
  accent: "#38bdf8",
  positive: "#34d399",
  negative: "#f87171",
  warning: "#fbbf24",
  purple: "#a78bfa",
  pink: "#f472b6",
  blue: "#60a5fa",
  indigo: "#818cf8",
};

// ============================================
// REUSABLE UI PRIMITIVES
// ============================================

function StatusDot({ color, pulse }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        background: color,
        boxShadow: pulse ? `0 0 8px ${color}66` : "none",
        animation: pulse ? "pulse-dot 1.2s infinite" : "none",
        marginRight: "6px",
        flexShrink: 0,
      }}
    />
  );
}

function ToolbarButton({ icon, label, onClick, disabled, active, activeColor = C.positive, tone = "muted", title }) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 6px",
    borderRadius: "4px",
    border: "1px solid rgba(148,163,184,0.18)",
    background: active ? "rgba(52,211,153,0.10)" : "rgba(148,163,184,0.08)",
    color: active ? activeColor : tone === "danger" ? C.negative : C.faint,
    fontSize: "8px",
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.55 : 1,
    transition: "border-color 0.15s, background 0.15s",
    whiteSpace: "nowrap",
  };
  return (
    <button className="btn-pro secondary" onClick={onClick} disabled={disabled} style={base} title={title}>
      {icon}
      {label}
    </button>
  );
}

function StatusPill({ label, color, detail }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "4px 8px",
        borderRadius: "999px",
        border: `1px solid ${color}33`,
        background: `${color}12`,
        color,
        fontSize: "8px",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <StatusDot color={color} />
      {label}
      {detail && <span style={{ color: C.muted, fontWeight: 500 }}>{detail}</span>}
    </span>
  );
}

function SourceDot({ label, ok, loading }) {
  const color = loading ? C.warning : ok ? C.positive : C.muted;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", whiteSpace: "nowrap" }}>
      <StatusDot color={color} pulse={loading} />
      <span style={{ color: loading ? C.warning : ok ? C.faint : C.muted, fontSize: "10px", fontWeight: 500 }}>
        {label}
      </span>
    </span>
  );
}

function CompactStat({ label, value, color }) {
  return (
    <span style={{ color: C.faint, fontSize: "10px", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <span style={{ color: C.muted }}>{label}:</span>
      <span style={{ color, fontWeight: 700 }}>{value}</span>
    </span>
  );
}

function HeartbeatBadge({ status, lastResult }) {
  const color =
    status === "running" ? C.warning :
    status === "success" ? C.positive :
    status === "error" ? C.negative :
    C.muted;
  const label =
    status === "running" ? "Heartbeat running" :
    status === "success" ? "Heartbeat OK" :
    status === "error" ? "Heartbeat failed" :
    "Heartbeat idle";
  return (
    <StatusPill
      label={label}
      color={color}
      detail={lastResult?.summary?.totals ? `${lastResult.summary.totals.rented || 0}r / ${lastResult.summary.totals.ghost || 0}g` : undefined}
    />
  );
}

// ============================================
// MINING ROUTE HERO
// ============================================

function MiningRouteHero({ onCall }) {
  const {
    opportunities,
    heroStats,
    heroLoading,
    dutchStats,
    dutchLoading,
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

  const activeRouteCount = opportunities.filter(
    (r) => (r.miningDutchBtcPerDay || 0) > 0 || (r.heroMiners || 0) > 0,
  ).length;
  const profitableCount = opportunities.filter((r) => (r.bestSpreadPercent ?? 0) > 0).length;
  const bestOpportunity = opportunities[0] || null;

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
    } catch { setHeartbeatStatus("error"); return null; }
  }, [onCall, refresh]);

  const fetchOpportunityAlertsStatus = useCallback(async () => {
    try {
      const res = await onCall("/api/v2/notify/opportunity-alerts/status", { silent: true });
      if (res && typeof res.enabled === 'boolean') {
        setOpportunityAlertsEnabled(res.enabled);
      }
    } catch { /* ignore */ }
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
    } catch { /* ignore */ }
  }, [onCall, opportunityAlertsEnabled]);

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
    const id = setTimeout(() => fetchOpportunityAlertsStatus(), 0);
    return () => clearTimeout(id);
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

  return (
    <section style={{ display: "grid", gap: "6px", width: "100%" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "6px",
          padding: "4px 8px",
          borderRadius: "6px",
          border: `1px solid ${C.panelBorder}`,
          background: C.panel,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <HeartbeatBadge status={heartbeatStatus} lastResult={lastHeartbeatResult} />
          <SourceDot label="Hero" ok={!!heroStats?.coinStats?.length} loading={heroLoading} />
          <SourceDot label="Dutch" ok={!!dutchStats?.coinStats?.length} loading={dutchLoading} />
          <StatusDot color={error ? C.negative : C.positive} pulse={loading} />
          <span style={{ color: error ? C.negative : C.muted, whiteSpace: "nowrap", fontSize: "10px" }}>
            {error ? "Error" : lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "Initializing..."}
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <ToolbarButton
            icon={<HeartbeatIcon size={14} color="currentColor" />}
            label={autoRefresh ? "Auto ON" : "Auto OFF"}
            active={autoRefresh}
            onClick={() => setAutoRefresh(p => !p)}
          />
          <ToolbarButton
            icon={<BellIcon size={14} color="currentColor" />}
            label={opportunityAlertsEnabled ? "Alerts ON" : "Alerts OFF"}
            active={opportunityAlertsEnabled}
            onClick={handleToggleOpportunityAlerts}
          />
          <ToolbarButton
            icon={<HeartbeatIcon size={14} color="currentColor" />}
            label="Heartbeat"
            onClick={handleForceHeartbeat}
            disabled={heartbeatStatus === "running"}
          />
          <ToolbarButton
            icon={<RefreshIcon size={14} color="currentColor" spinning={loading} />}
            label="Refresh"
            onClick={() => refresh(true)}
            disabled={loading}
          />
        </div>
      </div>

      {/* Route summary + table */}
      <div
        style={{
          border: `1px solid ${C.panelBorder}`,
          borderRadius: "10px",
          background: C.panel,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 8px",
            borderBottom: "1px solid rgba(148,163,184,0.08)",
            gap: "6px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: C.accent, fontWeight: 700, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <LayersIcon size={15} color={C.accent} />
              Route Intel
            </span>
            <CompactStat label="Routes" value={activeRouteCount} color={C.purple} />
            <CompactStat label="Positive" value={profitableCount} color={C.positive} />
            <CompactStat label="NH prices" value={Object.keys(niceHashPrices || {}).length} color={C.blue} />
          </div>
          {bestOpportunity && (
            <div style={{ textAlign: "right", fontSize: "10px", lineHeight: "1.2" }}>
              <span style={{ color: C.text, fontWeight: 700 }}>{bestOpportunity.label}</span>
              {bestOpportunity.bestSpreadPercent !== null && bestOpportunity.bestSpreadPercent > 0 && (
                <span style={{ color: C.positive, marginLeft: "10px", fontWeight: 700 }}>{percentValue(bestOpportunity.bestSpreadPercent)}</span>
              )}
              <span style={{ color: C.muted, marginLeft: "8px" }}>{btcValue(bestOpportunity.profitBtc)} BTC profit</span>
            </div>
          )}
        </div>

        <div style={{ overflowX: "auto", maxHeight: "300px", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ color: C.muted, borderBottom: "1px solid rgba(148,163,184,0.10)" }}>
                <th style={{ padding: "4px 6px", textAlign: "left", fontWeight: 600 }}>Algo</th>
                <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600 }}>Dutch</th>
                <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600 }}>Minerstat</th>
                <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600 }}>WhatToMine</th>
                <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600 }}>Hashrate.no</th>
                <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600 }}>NiceHash</th>
                <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600 }}>Spread</th>
                <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600 }}>Miners</th>
                <th style={{ padding: "4px 6px", textAlign: "left", fontWeight: 600 }}>Coins</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.slice(0, 15).map((row, index) => (
                <tr key={`${row.nicehashAlgo}-${index}`} style={{ borderBottom: "1px solid rgba(148,163,184,0.06)" }}>
                  <td style={{ padding: "4px 6px", color: C.text, whiteSpace: "nowrap", fontWeight: 500 }}>
                    {row.label}
                    <span style={{ color: C.muted, fontSize: "10px", marginLeft: "6px", fontFamily: "monospace" }}>{row.nicehashAlgo}</span>
                  </td>
                  <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700, color: (row.miningDutchBtcPerDay || 0) > 0 ? C.positive : C.muted, fontFamily: "monospace" }}>
                    {btcValue(row.miningDutchBtcPerDay)}
                  </td>
                  <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700, color: (row.minerstatBtcPerDay || 0) > 0 ? C.pink : C.muted, fontFamily: "monospace" }}>
                    {btcValue(row.minerstatBtcPerDay)}
                  </td>
                  <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700, color: (row.wtmBtcPerDay || 0) > 0 ? C.accent : C.muted, fontFamily: "monospace" }}>
                    {btcValue(row.wtmBtcPerDay)}
                  </td>
                  <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700, color: (row.hashrateNoBtcPerDay || 0) > 0 ? C.indigo : C.muted, fontFamily: "monospace" }}>
                    {btcValue(row.hashrateNoBtcPerDay)}
                  </td>
                  <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700, color: C.blue, fontFamily: "monospace" }}>
                    {btcValue(row.niceHashPrice)}
                  </td>
                  <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 800 }}>
                    <span style={{ color: (row.bestSpreadPercent ?? 0) > 0 ? C.positive : (row.bestSpreadPercent ?? 0) < 0 ? C.negative : C.faint }}>
                      {row.bestSpreadPercent === null ? "N/A" : percentValue(row.bestSpreadPercent)}
                    </span>
                  </td>
                  <td style={{ padding: "4px 6px", textAlign: "right", color: C.faint, fontFamily: "monospace" }}>
                    {compactNumber(row.heroMiners, 0)}
                  </td>
                  <td style={{ padding: "4px 6px" }}>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {row.heroCoins?.slice(0, 4).map((c) => (
                        <button
                          key={c}
                          onClick={() => openCoinModal(c)}
                          style={{
                            border: "1px solid rgba(96,165,250,0.22)",
                            color: "#bfdbfe",
                            background: "rgba(37,99,235,0.10)",
                            borderRadius: "999px",
                            padding: "2px 8px",
                            fontSize: "8px",
                            cursor: "pointer",
                            lineHeight: "8px",
                          }}
                        >
                          {c}
                        </button>
                      ))}
                      {(row.heroCoins?.length || 0) > 4 && (
                        <span style={{ color: C.muted, fontSize: "8px", lineHeight: "12px" }}>+{row.heroCoins.length - 4}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {opportunities.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: "14px", textAlign: "center", color: C.muted, fontSize: "8px" }}>
                    No route data yet.
                  </td>
                </tr>
              )}
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
  onCall, nhClient, state, dispatch,
  currentUser, isAdmin, forceCheckStatus, handleLogout, onNavigate,
}) {
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);

  return (
    <TelegramMineProvider onCall={onCall}>
      <div
        className="app-shell mining-shell"
        style={{
          padding: "0",
          width: "100%",
          maxWidth: "none",
          margin: "0 auto",
          background: "radial-gradient(circle at top left, rgba(56,189,248,0.14), transparent 34%), radial-gradient(circle at top right, rgba(16,185,129,0.12), transparent 30%), linear-gradient(180deg, rgba(2,6,23,0.96), rgba(15,23,42,0.98))",
          minHeight: "100vh",
        }}
      >
        <header
          style={{
            padding: "14px 20px 12px",
            marginBottom: "12px",
            borderBottom: "1px solid rgba(148,163,184,0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
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

        {/* Pool Monitor */}
        <section style={{ width: "100%", marginBottom: "14px", padding: "0 20px" }}>
          <PoolMonitor />
        </section>

        {/* Pool statistics */}
        <section style={{ width: "100%", marginBottom: "14px", padding: "0 20px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "10px" }}>
            <h2 style={{ margin: 0, color: C.text, fontSize: "10px", letterSpacing: "0.02em" }}>Pool Statistics</h2>
            <span style={{ color: C.muted, fontSize: "10px" }}>market profitability by source</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "12px", gridAutoRows: "1fr" }}>
            <MinerstatCard />
            <WhatToMineCard />
            <HashrateNoCard />
            <MiningDutchPoolCard />
          </div>
        </section>

        {/* Wallet monitors */}
        <section style={{ width: "100%", marginBottom: "14px", padding: "0 20px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "10px" }}>
            <h2 style={{ margin: 0, color: C.text, fontSize: "10px", letterSpacing: "0.02em" }}>Wallet Monitors</h2>
            <span style={{ color: C.muted, fontSize: "10px" }}>live balances, hashrate, and profit checks</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "12px", gridAutoRows: "1fr" }}>
            <HeroMinersLookup onCall={onCall} coinPrices={state.coinPrices} />
            <K1PoolCard onCall={onCall} coinPrices={state.coinPrices} />
            <KryptexCard onCall={onCall} coinPrices={state.coinPrices} />
            <ExternalPoolMonitor onCall={onCall} />
          </div>
        </section>

        {/* Route intel */}
        <section style={{ width: "100%", padding: "0 20px" }}>
          <MiningRouteHero onCall={onCall} />
        </section>

        {/* Mining coin router */}
        <section style={{ width: "100%", marginTop: "14px", padding: "0 20px 24px" }}>
          <div
            style={{
              padding: "14px",
              background: C.panel,
              border: `1px solid ${C.panelBorder}`,
              borderRadius: "12px",
            }}
          >
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
      <MiningWorkspaceProvider onCall={onCall} nhClient={nhClient} mrrClient={state?.mrrClient || "ALL"}>
        <CoinPriceProvider onCall={onCall}>
          <NiceHashOrderProvider callApi={onCall} nhClient="ALL">
            <div className="page-full" style={{ maxWidth: "none", width: "100%", padding: "0", margin: "0" }}>
              <MiningWorkspaceShell {...{ onNavigateHome, onCall, nhClient, state, dispatch, currentUser, isAdmin, forceCheckStatus, handleLogout, onNavigate }} />
            </div>
          </NiceHashOrderProvider>
        </CoinPriceProvider>
      </MiningWorkspaceProvider>
    </RentedRigProvider>
  );
}
