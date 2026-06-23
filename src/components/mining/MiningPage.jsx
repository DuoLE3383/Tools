// MiningPage.jsx
import HeroMinersCard from "./HeroMinersCard.jsx";
import MiningCoin, { HeaderCell, BodyCell } from "./MiningCoin.jsx";
import { RentedRigProvider } from "../mrr/RentedRigContext.jsx";
import {
  MiningWorkspaceProvider,
  useMiningWorkspace,
} from "./MiningWorkspaceProvider";
import { btcValue, compactNumber, percentValue } from "./miningWorkspaceData";
import { useState, useEffect, useMemo, useCallback } from "react";

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

function MiningRouteHero() {
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
  const bestRoute = routes[0] || null;
  const activeRouteCount = routes.filter(
    (route) => route.miningDutchBtcPerDay > 0 || route.heroMiners > 0,
  ).length;
  const profitableCount = routes.filter((route) => route.spread > 0).length;
  const bestOpportunity = opportunities[0] || null;

  return (
    <section style={{ display: "grid", gap: "10px", marginBottom: "12px" }}>
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
            <button
              className="btn-pro secondary"
              onClick={() => void refresh(true)}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh routes"}
            </button>
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
                        <span
                          key={coin}
                          style={{
                            border: "1px solid rgba(96,165,250,0.22)",
                            color: "#bfdbfe",
                            background: "rgba(37,99,235,0.12)",
                            borderRadius: "999px",
                            padding: "2px 6px",
                            fontSize: "10px",
                          }}
                        >
                          {coin}
                        </span>
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
// --- NEW: Stratum Connection Helper component ---
function StratumConnectionHelper({ onCall }) {
  const { heroRows, loading: workspaceLoading } = useMiningWorkspace(); // Already provides heroRows
  const [dutchPoolStatus, setDutchPoolStatus] = useState(null);
  const [dutchMultiport, setDutchMultiport] = useState(null);
  const [dutchLoading, setDutchLoading] = useState(true);
  const [error, setError] = useState("");

  const heroAlgos = useMemo(() => {
    const algoMap = new Map();
    heroRows.forEach((row) => {
      // The `raw` object contains the original API response for the coin
      if (row.algorithm && row.raw?.subdomain) {
        algoMap.set(row.algorithm, {
          algorithm: row.algorithm,
          subdomain: `${row.raw.subdomain}.herominers.com`,
        });
      }
    });
    return Array.from(algoMap.values());
  }, [heroRows]);

  // Fetch Mining-Dutch pool status and multiport
  const fetchDutchData = useCallback(async () => {
    setDutchLoading(true);
    try {
      const [statusRes, multiportRes] = await Promise.all([
        onCall("/api/v2/mining-dutch/poolstatus", { silent: true }),
        onCall("/api/v2/mining-dutch/multiport", {
          query: { method: "nowmining" },
          silent: true,
        }),
      ]);
      if (statusRes?.success) setDutchPoolStatus(statusRes);
      else setDutchPoolStatus(null);
      if (multiportRes?.success) setDutchMultiport(multiportRes);
      else setDutchMultiport(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setDutchLoading(false);
    }
  }, [onCall]);

  useEffect(() => {
    queueMicrotask(() => void fetchDutchData());
  }, [fetchDutchData]);

  const loading = workspaceLoading || dutchLoading;

  return (
    <details
      style={{
        marginTop: "12px",
        borderRadius: "12px",
        border: "1px solid rgba(148,163,184,0.12)",
        background: "rgba(15,23,42,0.72)",
        boxShadow: "0 18px 40px rgba(0,0,0,0.20)",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          padding: "12px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          listStyle: "none",
          color: "#e2e8f0",
          fontWeight: 700,
          fontSize: "14px",
        }}
      >
        <span>🔌 Stratum Connection Helper</span>
        <span style={{ color: "#64748b", fontSize: "12px" }}>
          {loading
            ? "Loading..."
            : `${heroAlgos.length} algos · ${dutchMultiport?.ports?.length || 0} ports`}
        </span>
      </summary>
      <div style={{ padding: "0 16px 16px" }}>
        {error && (
          <div style={{ color: "#f87171", marginBottom: "12px" }}>{error}</div>
        )}
        {loading ? (
          <div style={{ color: "#94a3b8", padding: "12px 0" }}>
            Fetching stratum data...
          </div>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {/* HeroMiners */}
            <div>
              <h4
                style={{
                  color: "#38bdf8",
                  margin: "0 0 8px",
                  fontSize: "13px",
                }}
              >
                HeroMiners – Algorithms & Subdomains
              </h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: "6px",
                }}
              >
                {heroAlgos.length > 0 ? (
                  heroAlgos.map((item) => (
                    <div
                      key={item.algorithm}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "6px",
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(148,163,184,0.08)",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "8px",
                        fontSize: "12px",
                      }}
                    >
                      <span style={{ color: "#e2e8f0" }}>{item.algorithm}</span>
                      <span
                        style={{ color: "#94a3b8", wordBreak: "break-all" }}
                      >
                        {item.subdomain}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ color: "#64748b", fontSize: "12px" }}>
                    No algorithms found.
                  </div>
                )}
              </div>
            </div>

            {/* Mining-Dutch */}
            <div>
              <h4
                style={{
                  color: "#fbbf24",
                  margin: "0 0 8px",
                  fontSize: "13px",
                }}
              >
                Mining-Dutch – Stratum Endpoints
              </h4>
              {dutchMultiport &&
              dutchMultiport.ports &&
              Array.isArray(dutchMultiport.ports) ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(220px, 1fr))",
                    gap: "6px",
                  }}
                >
                  {dutchMultiport.ports.map((portInfo) => (
                    <div
                      key={portInfo.port}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "6px",
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(148,163,184,0.08)",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "8px",
                        fontSize: "12px",
                      }}
                    >
                      <span style={{ color: "#e2e8f0" }}>
                        {portInfo.algorithm || "Unknown"}
                      </span>
                      <span style={{ color: "#94a3b8" }}>
                        stratum.mining-dutch.nl:{portInfo.port}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: "#64748b", fontSize: "12px" }}>
                  No port data available.
                </div>
              )}
              {dutchPoolStatus && (
                <div
                  style={{
                    marginTop: "8px",
                    fontSize: "11px",
                    color: "#64748b",
                  }}
                >
                  Pool status: {dutchPoolStatus.message || "OK"}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function MiningWorkspaceShell({ onNavigateHome, onCall, nhClient }) {
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
            onClick={() => window.location.reload()}
          >
            Refresh
          </button>
        </div>
      </header>

      <MiningRouteHero />

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

      {/* NEW: Stratum Connection Helper section */}
      <StratumConnectionHelper onCall={onCall} />

      {/* <section style={{ marginTop: '12px' }}>
        <TelegramManager onCall={onCall} mrrClient="VN" />
      </section> */}
    </div>
  );
}

export default function MiningPage({
  onCall,
  nhClient = "BT",
  onNavigateHome,
}) {
  return (
    <RentedRigProvider callApi={onCall}>
      <MiningWorkspaceProvider onCall={onCall} nhClient={nhClient}>
        <MiningWorkspaceShell
          onNavigateHome={onNavigateHome}
          onCall={onCall}
          nhClient={nhClient}
        />
      </MiningWorkspaceProvider>
    </RentedRigProvider>
  );
}