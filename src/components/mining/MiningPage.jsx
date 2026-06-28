// MiningPage.jsx - fully upgraded with CoinPriceProvider
import HeroMinersCard from "./HeroMinersCard.jsx";
import MiningCoin, { HeaderCell, BodyCell } from "./MiningCoin.jsx";
import { RentedRigProvider } from "../mrr/RentedRigContext.jsx";
import {
  MiningWorkspaceProvider,
  useMiningWorkspace,
} from "./MiningWorkspaceProvider";
import { btcValue, compactNumber, percentValue } from "./miningWorkspaceData";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import TelegramSendModal from "./TelegramSendModal.jsx";
import { useTelegramMine } from "../mrr/TelegramMineContext.jsx";
import { CoinPriceProvider, useCoinPrice } from "./CoinPriceContext.jsx";

const HEARTBEAT_INTERVAL_MS = 120000; // 2 minutes
const HEARTBEAT_COOLDOWN_MS = 60000;  // 1 minute minimum between manual triggers

// ===== Stat Cards =====
function StatCard({ label, value, accent }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "10px 12px",
        borderRadius: "10px",
        border: "1px solid rgba(148,163,184,0.12)",
        background: "rgba(15,23,42,0.74)",
        boxShadow: "0 12px 24px rgba(0,0,0,0.15)",
      }}
    >
      <div
        style={{
          color: "#64748b",
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: accent,
          fontSize: "20px",
          lineHeight: 1.1,
          fontWeight: 900,
          marginTop: "4px",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }) {
  return (
    <div
      style={{
        padding: "8px",
        borderRadius: "8px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(148,163,184,0.08)",
      }}
    >
      <div
        style={{
          color: "#64748b",
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: tone,
          fontSize: "15px",
          fontWeight: 900,
          marginTop: "3px",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ===== Heartbeat Status Badge =====
function HeartbeatBadge({ status, lastResult, onClick }) {
  const getBadgeStyle = () => {
    switch (status) {
      case "running":
        return { color: "#fbbf24", label: "Heartbeating...", pulse: true };
      case "success":
        return { color: "#34d399", label: "OK", pulse: false };
      case "error":
        return { color: "#f87171", label: "Failed", pulse: false };
      default:
        return { color: "#64748b", label: "Idle", pulse: false };
    }
  };

  const badge = getBadgeStyle();
  const rentals = lastResult?.summary?.totals?.rented ?? 0;
  const ghosts = lastResult?.summary?.totals?.ghost ?? 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 10px",
          borderRadius: "999px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(148,163,184,0.1)",
          cursor: "default",
        }}
      >
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: badge.color,
            boxShadow: badge.pulse
              ? `0 0 8px ${badge.color}88`
              : "none",
            animation: badge.pulse ? "pulse-dot 1.5s infinite" : "none",
          }}
        />
        <span style={{ color: badge.color, fontSize: "11px", fontWeight: 700 }}>
          {badge.label}
        </span>
        {lastResult && status === "success" && (
          <span style={{ color: "#94a3b8", fontSize: "10px" }}>
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

// ===== Main Route Hero =====
function MiningRouteHero({ onCall }) {
  const {
    routes,
    opportunities,
    heroRows,
    miningDutchRows,
    loading,
    error,
    lastUpdated,
    refresh,
    priceFetchStatus,
  } = useMiningWorkspace();
  const { openCoinModal } = useCoinPrice();
  const { notify: sendMineNotice } = useTelegramMine();

  const [heartbeatStatus, setHeartbeatStatus] = useState("idle"); // idle | running | success | error
  const [lastHeartbeatResult, setLastHeartbeatResult] = useState(null);
  const [lastHeartbeatTime, setLastHeartbeatTime] = useState(null);
  const heartbeatTimerRef = useRef(null);
  const heartbeatCooldownRef = useRef(0);

  const bestRoute = routes[0] || null;
  const activeRouteCount = routes.filter(
    (route) => route.miningDutchBtcPerDay > 0 || route.heroMiners > 0,
  ).length;
  const profitableCount = routes.filter((route) => route.spread > 0).length;
  const bestOpportunity = opportunities[0] || null;

  // ── Coin Price Update State ────────────────────────────────
  const [priceUpdateStatus, setPriceUpdateStatus] = useState("idle"); // idle | running | success | error

  // ── Run Heartbeat ──────────────────────────────────────────
  const runHeartbeat = useCallback(async (isAuto = false) => {
    // Enforce cooldown for manual triggers
    if (!isAuto) {
      const now = Date.now();
      if (now - heartbeatCooldownRef.current < HEARTBEAT_COOLDOWN_MS) {
        return;
      }
      heartbeatCooldownRef.current = now;
    }

    setHeartbeatStatus("running");
    try {
      const res = await onCall("/api/v2/mrr/monitor/run", {
        method: "POST",
        body: { client: "ALL" },
        silent: true,
      });

      setLastHeartbeatResult(res);
      setLastHeartbeatTime(Date.now());
      setHeartbeatStatus("success");

      // Auto-refresh workspace data so routes re-evaluate
      refresh(true);

      return res;
    } catch (err) {
      setHeartbeatStatus("error");
      console.error("[Heartbeat] Failed:", err.message);
      return null;
    }
  }, [onCall, refresh]);

  // ── Periodic Heartbeat Timer ───────────────────────────────
  useEffect(() => {
    heartbeatTimerRef.current = setInterval(() => {
      runHeartbeat(true);
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
      }
    };
  }, [runHeartbeat]);

  // ── Manual Coin Price Update ───────────────────────────────
  const handleUpdatePrices = useCallback(async () => {
    if (priceUpdateStatus === "running") return;
    setPriceUpdateStatus("running");
    try {
      const res = await onCall("/api/v2/prices/update", {
        method: "POST",
        silent: true,
      });
      setPriceUpdateStatus(res?.success ? "success" : "error");
      setTimeout(() => {
        setPriceUpdateStatus((prev) => prev === "success" ? "idle" : prev);
      }, 3000);
    } catch (err) {
      setPriceUpdateStatus("error");
      console.error("[Prices] Update failed:", err.message);
      setTimeout(() => setPriceUpdateStatus("idle"), 3000);
    }
  }, [onCall, priceUpdateStatus]);

  // ── Manual Force Heartbeat ─────────────────────────────────
  const handleForceHeartbeat = useCallback(async () => {
    try {
      await sendMineNotice("🔍 Monitor heartbeat triggered...");
      const res = await runHeartbeat(false);
      if (res?.summary?.totals) {
        const { rented, ghost } = res.summary.totals;
        await sendMineNotice(
          `✅ Heartbeat complete. Active: ${rented || 0}, Ghost: ${ghost || 0}`
        );
      } else {
        await sendMineNotice("✅ Heartbeat complete.");
      }
    } catch (err) {
      await sendMineNotice(`❌ Heartbeat failed: ${err.message}`);
    }
  }, [runHeartbeat, sendMineNotice]);

  // ── Time since last heartbeat ──────────────────────────────
  const heartbeatTimeAgo = useMemo(() => {
    if (!lastHeartbeatTime) return null;
    const diff = Date.now() - lastHeartbeatTime;
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  }, [lastHeartbeatTime]);

  // ── Render ─────────────────────────────────────────────────
  return (
    <section style={{ display: "grid", gap: "10px", marginBottom: "12px" }}>
      {/* Heartbeat Status Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "10px",
          padding: "8px 12px",
          borderRadius: "10px",
          border: "1px solid rgba(148,163,184,0.10)",
          background: "rgba(2,6,23,0.45)",
        }}
      >
        <HeartbeatBadge
          status={heartbeatStatus}
          lastResult={lastHeartbeatResult}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {heartbeatTimeAgo && (
            <span style={{ color: "#64748b", fontSize: "10px" }}>
              Last: {heartbeatTimeAgo}
            </span>
          )}
          <button
            className="btn-pro secondary"
            onClick={handleForceHeartbeat}
            disabled={heartbeatStatus === "running"}
            style={{ fontSize: "11px", padding: "4px 12px" }}
          >
            {heartbeatStatus === "running" ? "Running..." : "Force Heartbeat"}
          </button>
          <button
            className="btn-pro secondary"
            onClick={handleUpdatePrices}
            disabled={priceUpdateStatus === "running"}
            style={{ fontSize: "11px", padding: "4px 12px" }}
          >
            {priceUpdateStatus === "running" ? "Updating..." : priceUpdateStatus === "success" ? "✅ Prices Updated" : priceUpdateStatus === "error" ? "❌ Failed" : "Update Prices"}
          </button>
          <button
            className="btn-pro secondary"
            onClick={() => void refresh(true)}
            disabled={loading}
            style={{ fontSize: "11px", padding: "4px 12px" }}
          >
            {loading ? "Refreshing..." : "Refresh Routes"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "10px",
        }}
      >
        <StatCard
          label="Tracked HeroMiners"
          value={compactNumber(heroRows.length, 0)}
          accent="#38bdf8"
        />
        <StatCard
          label="Mining-Dutch algos"
          value={compactNumber(miningDutchRows.length, 0)}
          accent="#fbbf24"
        />
        <StatCard
          label="Positive spread"
          value={compactNumber(profitableCount, 0)}
          accent="#34d399"
        />
        <StatCard
          label="Active routes"
          value={compactNumber(activeRouteCount, 0)}
          accent="#a78bfa"
        />
      </div>

      {/* Best Route & Top Candidates */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr",
          gap: "10px",
        }}
      >
        <div
          style={{
            padding: "12px",
            borderRadius: "12px",
            border: "1px solid rgba(148,163,184,0.12)",
            background:
              "linear-gradient(135deg, rgba(15,23,42,0.9), rgba(15,23,42,0.55))",
            boxShadow: "0 18px 40px rgba(0,0,0,0.20)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "10px",
              flexWrap: "wrap",
              marginBottom: "8px",
            }}
          >
            <div>
              <div
                style={{
                  color: "#38bdf8",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                }}
              >
                Route Intel
              </div>
              <div
                style={{ color: "#f8fafc", fontSize: "15px", fontWeight: 800 }}
              >
                Best route
              </div>
            </div>
          </div>

          {error && (
            <div
              style={{
                color: "#f87171",
                fontSize: "12px",
                marginBottom: "10px",
              }}
            >
              {error}
            </div>
          )}

          {bestRoute ? (
            <div
              style={{
                display: "grid",
                gap: "4px",
                padding: "10px",
                borderRadius: "10px",
                background: "rgba(2,6,23,0.45)",
                border: "1px solid rgba(148,163,184,0.10)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      color: "#e2e8f0",
                      fontSize: "18px",
                      fontWeight: 800,
                    }}
                  >
                    {bestRoute.label}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: "10px" }}>
                    {bestRoute.bestSource} to NiceHash / MRR mapping
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      color: "#34d399",
                      fontSize: "18px",
                      fontWeight: 800,
                    }}
                  >
                    {btcValue(bestRoute.miningDutchBtcPerDay)}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: "11px" }}>
                    BTC/day
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                  color: "#cbd5e1",
                  fontSize: "12px",
                }}
              >
                <span>NiceHash: {bestRoute.nicehashAlgo}</span>
                <span>MRR: {bestRoute.mrrAlgo}</span>
                <span>
                  Spread:{" "}
                  {bestRoute.spread === null
                    ? "N/A"
                    : percentValue(bestRoute.spread)}
                </span>
                <span>
                  Hero miners: {compactNumber(bestRoute.heroMiners, 0)}
                </span>
              </div>
            </div>
          ) : (
            <div
              style={{ color: "#94a3b8", fontSize: "12px", padding: "8px 0" }}
            >
              No route data yet. Refresh once the pool stats finish loading.
            </div>
          )}

          <div
            style={{ marginTop: "10px", color: "#64748b", fontSize: "11px" }}
          >
            {lastUpdated
              ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}`
              : "Waiting for initial mining sync..."}
          </div>
        </div>

        <div
          style={{
            padding: "12px",
            borderRadius: "12px",
            border: "1px solid rgba(148,163,184,0.12)",
            background:
              "linear-gradient(135deg, rgba(15,23,42,0.82), rgba(2,6,23,0.78))",
            boxShadow: "0 18px 40px rgba(0,0,0,0.20)",
          }}
        >
          <div
            style={{
              color: "#f8fafc",
              fontSize: "13px",
              fontWeight: 800,
              marginBottom: "8px",
            }}
          >
            Top Route Candidates
          </div>
          <div
            style={{
              display: "grid",
              gap: "8px",
              maxHeight: "170px",
              overflow: "auto",
            }}
          >
            {routes.slice(0, 5).map((route) => (
              <div
                key={route.nicehashAlgo}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "10px",
                  padding: "6px 8px",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(148,163,184,0.08)",
                }}
              >
                <div>
                  <div style={{ color: "#e2e8f0", fontWeight: 700 }}>
                    {route.label}
                  </div>
                  <div style={{ color: "#64748b", fontSize: "11px" }}>
                    {route.nicehashAlgo} • {route.mrrAlgo}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      color: route.spread > 0 ? "#34d399" : "#94a3b8",
                      fontWeight: 800,
                    }}
                  >
                    {btcValue(route.miningDutchBtcPerDay)}
                  </div>
                  <div style={{ color: "#64748b", fontSize: "11px" }}>
                    {route.spread === null ? "N/A" : percentValue(route.spread)}
                  </div>
                </div>
              </div>
            ))}
            {routes.length === 0 && (
              <div style={{ color: "#94a3b8", fontSize: "12px" }}>
                No route candidates available.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Opportunity Finder */}
      <div
        style={{
          padding: "12px",
          borderRadius: "12px",
          border: "1px solid rgba(148,163,184,0.12)",
          background: "rgba(15,23,42,0.72)",
          boxShadow: "0 18px 40px rgba(0,0,0,0.20)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "10px",
            flexWrap: "wrap",
            marginBottom: "10px",
          }}
        >
          <div>
            <div
              style={{
                color: "#38bdf8",
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
              }}
            >
              Opportunity Finder
            </div>
            <div
              style={{ color: "#f8fafc", fontSize: "15px", fontWeight: 800 }}
            >
              Pool revenue vs NiceHash / MRR market price
            </div>
          </div>
          <div style={{ color: "#94a3b8", fontSize: "12px" }}>
            Compare the same algo/day across all three sources
          </div>
        </div>

        {bestOpportunity ? (
          <div
            style={{
              display: "grid",
              gap: "6px",
              marginBottom: "10px",
              padding: "10px",
              borderRadius: "10px",
              border: "1px solid rgba(148,163,184,0.10)",
              background:
                "linear-gradient(135deg, rgba(2,6,23,0.45), rgba(15,23,42,0.88))",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#e2e8f0",
                    fontSize: "18px",
                    fontWeight: 900,
                  }}
                >
                  {bestOpportunity.label}
                </div>
                <div style={{ color: "#94a3b8", fontSize: "10px" }}>
                  Winner: {bestOpportunity.winner} · NiceHash{" "}
                  {bestOpportunity.nicehashAlgo} · MRR {bestOpportunity.mrrAlgo}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    color:
                      bestOpportunity.opportunityScore >= 0
                        ? "#34d399"
                        : "#f87171",
                    fontSize: "15px",
                    fontWeight: 900,
                  }}
                >
                  {btcValue(bestOpportunity.opportunityScore)}
                </div>
                <div style={{ color: "#94a3b8", fontSize: "11px" }}>
                  Opportunity BTC/day
                </div>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: "10px",
              }}
            >
              <MiniStat
                label="Pool revenue"
                value={btcValue(bestOpportunity.poolRevenue)}
                tone="#34d399"
              />
              <MiniStat
                label="NiceHash buy/day"
                value={btcValue(bestOpportunity.niceHashPrice)}
                tone="#60a5fa"
              />
              <MiniStat
                label="MRR market/day"
                value={btcValue(bestOpportunity.mrrMarketPrice)}
                tone="#fbbf24"
              />
              <MiniStat
                label="Spread vs NH"
                value={
                  bestOpportunity.spreadVsNh === null
                    ? "N/A"
                    : percentValue(bestOpportunity.spreadVsNh)
                }
                tone="#a78bfa"
              />
            </div>
          </div>
        ) : (
          <div style={{ color: "#94a3b8", fontSize: "12px" }}>
            No opportunity rows yet.
          </div>
        )}

        {priceFetchStatus && Object.keys(priceFetchStatus).length > 0 && (
          <div
            style={{
              marginTop: "12px",
              padding: "10px",
              borderRadius: "8px",
              background: "rgba(15,23,42,0.5)",
              border: "1px solid rgba(148,163,184,0.12)",
            }}
          >
            <details>
              <summary
                style={{
                  color: "#94a3b8",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                Price Fetch Status ({Object.keys(priceFetchStatus).length}{" "}
                algos)
              </summary>
              <div style={{ marginTop: "8px", fontSize: "10px" }}>
                {Object.entries(priceFetchStatus).map(([algo, status]) => (
                  <div
                    key={algo}
                    style={{ color: "#64748b", padding: "2px 0" }}
                  >
                    <span style={{ color: "#e2e8f0" }}>{algo}:</span> {status}
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: "1100px",
            }}
          >
            <thead>
              <tr
                style={{
                  color: "#94a3b8",
                  borderBottom: "1px solid rgba(148,163,184,0.12)",
                }}
              >
                <HeaderCell align="left">Algo</HeaderCell>
                <HeaderCell align="left">Winner</HeaderCell>
                <HeaderCell>Pool BTC/day</HeaderCell>
                <HeaderCell>NH Buy/day</HeaderCell>
                <HeaderCell>MRR Market/day</HeaderCell>
                <HeaderCell>Spread NH</HeaderCell>
                <HeaderCell>Spread MRR</HeaderCell>
                <HeaderCell>Hero Coins</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {opportunities.slice(0, 10).map((row) => (
                <tr
                  key={row.nicehashAlgo}
                  style={{ borderBottom: "1px solid rgba(148,163,184,0.08)" }}
                >
                  <BodyCell align="left">
                    <strong style={{ color: "#e2e8f0" }}>{row.label}</strong>
                    <div
                      style={{
                        color: "#64748b",
                        fontSize: "11px",
                        marginTop: "2px",
                      }}
                    >
                      {row.nicehashAlgo} • {row.mrrAlgo}
                    </div>
                  </BodyCell>
                  <BodyCell align="left">{row.winner}</BodyCell>
                  <BodyCell>
                    <strong style={{ color: "#34d399" }}>
                      {btcValue(row.poolRevenue)}
                    </strong>
                  </BodyCell>
                  <BodyCell>
                    <strong style={{ color: "#60a5fa" }}>
                      {btcValue(row.niceHashPrice)}
                    </strong>
                  </BodyCell>
                  <BodyCell>
                    <strong style={{ color: "#fbbf24" }}>
                      {btcValue(row.mrrMarketPrice)}
                    </strong>
                  </BodyCell>
                  <BodyCell>
                    <span
                      style={{
                        color:
                          row.spreadVsNh > 0
                            ? "#34d399"
                            : row.spreadVsNh < 0
                              ? "#f87171"
                              : "#94a3b8",
                        fontWeight: 700,
                      }}
                    >
                      {row.spreadVsNh === null
                        ? "N/A"
                        : percentValue(row.spreadVsNh)}
                    </span>
                  </BodyCell>
                  <BodyCell>
                    <span
                      style={{
                        color:
                          row.spreadVsMrr > 0
                            ? "#34d399"
                            : row.spreadVsMrr < 0
                              ? "#f87171"
                              : "#94a3b8",
                        fontWeight: 700,
                      }}
                    >
                      {row.spreadVsMrr === null
                        ? "N/A"
                        : percentValue(row.spreadVsMrr)}
                    </span>
                  </BodyCell>
                  <BodyCell align="left">
                    <div
                      style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}
                    >
                      {row.heroCoins.map((coin) => (
                        <button
                          key={coin}
                          onClick={() => openCoinModal(coin)}
                          style={{
                            border: "1px solid rgba(96,165,250,0.22)",
                            color: "#bfdbfe",
                            background: "rgba(37,99,235,0.12)",
                            borderRadius: "999px",
                            padding: "2px 6px",
                            fontSize: "10px",
                            cursor: "pointer",
                            transition: "all 0.2s",
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.background = "rgba(37,99,235,0.25)";
                            e.target.style.borderColor = "rgba(96,165,250,0.5)";
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = "rgba(37,99,235,0.12)";
                            e.target.style.borderColor = "rgba(96,165,250,0.22)";
                          }}
                        >
                          {coin}
                        </button>
                      ))}
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

// ===== Shell =====
function MiningWorkspaceShell({ onNavigateHome, onCall, nhClient }) {
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);

  return (
    <div
      className="app-shell mining-shell"
      style={{
        padding: "0 12px 24px",
        maxWidth: "1500px",
        margin: "0 auto",
        background:
          "radial-gradient(circle at top left, rgba(56,189,248,0.16), transparent 32%), radial-gradient(circle at top right, rgba(16,185,129,0.14), transparent 28%), linear-gradient(180deg, rgba(2,6,23,0.95), rgba(15,23,42,0.96))",
        minHeight: "100vh",
      }}
    >
      <header
        style={{
          padding: "20px 0 12px",
          marginBottom: "12px",
          borderBottom: "1px solid rgba(148,163,184,0.10)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: "260px" }}>
          <div
            style={{
              color: "#38bdf8",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              marginBottom: "6px",
            }}
          >
            <h3>Mining Workspace</h3>
          </div>
          <p
            className="subtitle"
            style={{ margin: "4px 0 0", maxWidth: "760px", fontSize: "12px" }}
          >
            Dedicated profitability routing view with live route intelligence,
            current pool stats, and profitability comparison.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button className="btn-pro secondary" onClick={onNavigateHome}>
            Back to Dashboard
          </button>
          <button
            className="btn-pro secondary"
            onClick={() => setTelegramModalOpen(true)}
          >
            Telegram
          </button>
          <button
            className="btn-pro secondary"
            onClick={() => window.location.reload()}
          >
            Refresh Page
          </button>
        </div>
      </header>

      <TelegramSendModal
        isOpen={telegramModalOpen}
        onClose={() => setTelegramModalOpen(false)}
      />

      <MiningRouteHero onCall={onCall} />

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1.15fr 0.85fr",
          gap: "12px",
          alignItems: "start",
        }}
      >
        <article
          style={{
            padding: "12px",
            background: "rgba(15,23,42,0.72)",
            border: "1px solid rgba(148,163,184,0.12)",
            borderRadius: "12px",
            boxShadow: "0 18px 40px rgba(0,0,0,0.20)",
          }}
        >
          <HeroMinersCard onCall={onCall} />
        </article>

        <aside
          style={{
            padding: "12px",
            background: "rgba(15,23,42,0.72)",
            border: "1px solid rgba(148,163,184,0.12)",
            borderRadius: "12px",
            boxShadow: "0 18px 40px rgba(0,0,0,0.20)",
          }}
        >
          <MiningCoin onCall={onCall} nhClient={nhClient} />
        </aside>
      </section>
    </div>
  );
}

// ===== Main Export =====
export default function MiningPage({
  onCall,
  nhClient = "BT",
  onNavigateHome,
}) {
  return (
    <RentedRigProvider callApi={onCall}>
      <MiningWorkspaceProvider onCall={onCall} nhClient={nhClient}>
        <CoinPriceProvider onCall={onCall}>
          <MiningWorkspaceShell
            onNavigateHome={onNavigateHome}
            onCall={onCall}
            nhClient={nhClient}
          />
        </CoinPriceProvider>
      </MiningWorkspaceProvider>
    </RentedRigProvider>
  );
}
