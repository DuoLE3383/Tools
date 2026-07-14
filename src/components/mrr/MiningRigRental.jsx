// MiningRigRental.jsx - RESPONSIVE FULL-WIDTH REDESIGN

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import MrrRigs from "./MrrRigs";
import Modal from "../Modal";
import TelegramManager, { useTelegram } from "../TelegramManager";
import { calculateRemainingTime, toUtcTimestamp } from "../../core/time";
import ErrorBoundary from "../ErrorBoundary"; 
import CryptoRatePage from "../../../CryptoRatePage.jsx"; 

// ============================================
// UTILITY FUNCTIONS
// ============================================

function extractArray(payload, keys = ["rentals", "rigs", "list", "result", "items", "data"]) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload.data && Array.isArray(payload.data[key])) return payload.data[key];
  }
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.rentals && Array.isArray(payload.rentals)) return payload.rentals;
  if (payload.data && typeof payload.data === "object") {
    return extractArray(payload.data, keys);
  }
  return [];
}

function isCurrentRental(rental) {
  const statusRaw = rental?.status;
  const status = String(typeof statusRaw === "object" ? statusRaw.status : statusRaw || "").toLowerCase();
  const rentedFlag = Boolean(statusRaw?.rented || rental?.rented);
  const endTs = toUtcTimestamp(rental?.end || rental?.end_time || rental?.endTime || statusRaw?.end);
  const hasFutureEnd = Number.isFinite(endTs) && endTs > Date.now();
  return hasFutureEnd || rentedFlag || status.includes("rented") || status.includes("active") || status.includes("running");
}

export function CountdownTimer({ endTime }) {
  const [remaining, setRemaining] = useState(() => calculateRemainingTime(endTime));
  const timerRef = useRef(null);

  useEffect(() => {
    if (!endTime) {
      setRemaining(null);
      return;
    }
    const updateCountdown = () => {
      const newRemaining = calculateRemainingTime(endTime);
      setRemaining(newRemaining);
      if (newRemaining === "Expired") {
        clearInterval(timerRef.current);
      }
    };
    updateCountdown();
    timerRef.current = setInterval(updateCountdown, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [endTime]);

  if (!remaining) return <span style={{ opacity: 0.6 }}>N/A</span>;
  const isExpired = remaining === "Expired";
  return <span style={{ color: isExpired ? "#f87171" : "#a78bfa" }}>{remaining}</span>;
}

// ============================================
// MRR RENTALS TABLE
// ============================================

function MrrRentalsTable({ data, onOpenPools, onNotice, mrrClient }) {
  const isError = !data ||
    (typeof data === "string" && data.length > 0 && !data.startsWith("{")) ||
    (typeof data === "object" && data.success === false) ||
    data.error;

  if (isError) {
    const errMsg = typeof data === "string" ? data : data?.error || data?.message || data?.data?.message || "Unauthorized or API Error";
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <div style={{ color: "#f87171", marginBottom: "10px", fontWeight: "bold", fontSize: "1.2rem" }}>
          {String(errMsg).includes("401") || errMsg === "Unauthorized" ? "Authentication Failed (401)" : "Data Fetch Error"}
        </div>
        <div style={{ opacity: 0.8, fontSize: "13px", maxWidth: "500px", margin: "0 auto" }}>{errMsg}</div>
        <p style={{ marginTop: "20px", fontSize: "11px", opacity: 0.5 }}>
          Ensure the MRR API Key and Secret for client "{mrrClient}" are set correctly in your server-side .env file.
        </p>
      </div>
    );
  }

  const rentals = useMemo(() => extractArray(data), [data]);

  if (!Array.isArray(rentals) || !rentals.length) {
    return <div style={{ padding: "30px", textAlign: "center", opacity: 0.5 }}>No active rentals found.</div>;
  }

  const getRaw = (rate) => {
    if (!rate) return 0;
    if (typeof rate === "number") return rate;
    if (typeof rate === "string") return parseFloat(rate) || 0;
    return parseFloat(rate.hash ?? rate.hashrate ?? rate.advertised ?? 0);
  };

  return (
    <div className="table-responsive" style={{ overflowX: "auto" }}>
      <table className="pro-table" style={{ width: "100%", minWidth: "700px", fontSize: "12px" }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Algo</th>
            {mrrClient === "ALL" && <th>Account</th>}
            <th>Avg / Ads</th>
            <th>Pool</th>
            <th>Target</th>
            <th style={{ textAlign: "right" }}>Price</th>
            <th style={{ width: "120px" }}>Remaining</th>
            <th>Status</th>
            <th style={{ textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rentals.map((r) => {
            const now = Date.now();
            const start = toUtcTimestamp(r.start);
            const end = toUtcTimestamp(r.end);
            const ads = getRaw(r.hashrate?.advertised || r.advertised);
            const avg = getRaw(r.hashrate?.average || r.average);
            const suffix = r.hashrate?.suffix || r.hashrate?.advertised?.type || "";

            const totalMs = end - start;
            const elapsedMs = Math.max(0, Math.min(now - start, totalMs));
            const remainingMs = Math.max(0, end - now);
            const totalExpectedHashes = ads * (totalMs / 1000);
            const actualHashesDone = avg * (elapsedMs / 1000);
            const remainingHashesNeeded = totalExpectedHashes - actualHashesDone;
            const targetCalc = remainingMs > 0 ? remainingHashesNeeded / (remainingMs / 1000) : 0;
            const target = Number.isFinite(targetCalc) ? targetCalc : 0;
            const displayTarget = target < 0 ? 0 : target;

            return (
              <tr key={r.id} style={{ borderLeft: avg < ads * 0.9 ? "3px solid #f87171" : "none" }}>
                <td style={{ fontFamily: "monospace", color: "#94a3b8", fontSize: "11px" }}>{r.id}</td>
                <td style={{ fontWeight: "bold" }}>{r.rig?.name || r.name || r.rig_name || r.rigName || "N/A"}</td>
                <td style={{ color: "#60a5fa" }}>{r.rig?.type || r.algo || r.algorithm || r.miningAlgorithm || "N/A"}</td>
                {mrrClient === "ALL" && (
                  <td>
                    <span style={{ fontSize: "10px", background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: "4px" }}>
                      {r.mrrClient || "N/A"}
                    </span>
                  </td>
                )}
                <td style={{ fontFamily: "monospace" }}>
                  {r.hashrate?.advertised?.nice || (typeof r.hashrate === "object" ? r.hashrate?.advertised : r.hashrate) || "0"}
                  <small>{!r.hashrate?.advertised?.nice && (r.hashrate?.suffix || "")}</small>
                </td>
                <td style={{ fontSize: "10px" }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: "120px", whiteSpace: "nowrap" }} title={r.host}>
                    {r.host ? `${r.host}:${r.port}` : <span style={{ opacity: 0.4 }}>No Data</span>}
                  </div>
                  <div style={{ opacity: 0.5, fontSize: "9px" }}>{r.user}</div>
                </td>
                <td style={{ color: "#fbbf24" }}>
                  <strong style={{ color: target > ads ? "#f87171" : "#34d399" }}>{displayTarget.toFixed(2)}</strong>
                  <small style={{ opacity: 0.5 }}>{suffix}</small>
                </td>
                <td style={{ color: "#fbbf24", textAlign: "right" }}>
                  {typeof r.price === "object" ? r.price?.paid || r.price?.advertised || r.price?.price || "0.00" : r.price || "0.00"}
                  <small style={{ opacity: 0.5 }}>{r.price?.currency || r.currency || "BTC"}</small>
                </td>
                <td><CountdownTimer endTime={r.end} /></td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <span className={
                    String(r.status?.status || r.status || "").toLowerCase().includes("active") ||
                    String(r.status?.status || r.status || "").toLowerCase().includes("rented")
                      ? "status-success" : "status-ready"
                  }>
                    {String(r.status?.status || r.status || "").toUpperCase().includes("ACTIVE") ? "RENTED" :
                      r.status?.status || r.status || (r.end ? "FINISHED" : "READY")}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button className="btn-pro secondary" onClick={() => onOpenPools?.(r)} style={{ fontSize: "11px" }}>Pools</button>
                    <button className="btn-pro secondary" onClick={() => onNotice?.(r, target)} style={{ fontSize: "11px", color: "#24A1DE" }}>Notice</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================
// MRR POOLS TABLE
// ============================================

export function MrrPoolsTable({ data }) {
  if (!data || (typeof data === "object" && !Array.isArray(data) && data.success === false) || data.error) {
    const errMsg = typeof data === "string" ? data : data?.error || data?.message || data?.data?.message || "Failed to fetch pool data";
    return (
      <div style={{ padding: "30px", textAlign: "center" }}>
        <div style={{ color: "#f87171", fontWeight: "bold" }}>Pool Data Error</div>
        <div style={{ opacity: 0.7, fontSize: "12px", marginTop: "5px" }}>{errMsg}</div>
        <p style={{ marginTop: "15px", fontSize: "11px", opacity: 0.5 }}>
          Ensure MRR API credentials for the selected client are correctly defined in your <code>.env</code> file.
        </p>
      </div>
    );
  }

  let results = [];
  if (data?.data && typeof data.data === "object" && !Array.isArray(data.data) && (data.data.pools || data.data.result)) {
    results = [data.data];
  } else {
    const rawResults = extractArray(data, ["pools", "data", "result"]);
    results = rawResults.length > 0 && !rawResults[0].pools && (rawResults[0].user || rawResults[0].host || rawResults[0].stratumHost)
      ? [{ id: "Pools", pools: rawResults }]
      : rawResults;
  }

  if (!results.length) {
    return <div style={{ padding: "30px", textAlign: "center", opacity: 0.5 }}>No pool data found.</div>;
  }

  return (
    <div className="mrr-pools-modal-content">
      {results.map((res, idx) => (
        <div key={res.rigId || res.rigid || res.id || idx} style={{ marginBottom: "25px", borderBottom: "1px solid #333", paddingBottom: "15px" }}>
          <h4 style={{ color: "#ff1cbb", margin: "25px 5px 10px 0" }}>
            {res.rigId || res.rigid ? `Rig ID: ${res.rigId || res.rigid}` : res.id ? `Rental ID: ${res.id}` : "Target ID: N/A"}
          </h4>
          <div className="table-responsive" style={{ overflowX: "auto" }}>
            <table className="pro-table" style={{ width: "100%", minWidth: "500px", fontSize: "11px" }}>
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Host</th>
                  <th>Port</th>
                  <th>User</th>
                  <th>Algo</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(res.pools) ? res.pools : Array.isArray(res) ? res : []).map((p, pIdx) => (
                  <tr key={pIdx} style={{ color: "#d7ceff", fontSize: "10px" }}>
                    <td>{p.priority}</td>
                    <td>{p.host || p.stratumHost}</td>
                    <td>{p.port || p.stratumPort || "N/A"}</td>
                    <td style={{ fontWeight: "bold" }}>{p.user || p.username || "N/A"}</td>
                    <td>{p.algo || p.algorithm || p.type || res.algo || res.algorithm || res.type || res.rentals?.algo || res.rentals?.type || "N/A"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function MiningRigRental({
  onCall,
  mrrClient,
  setMrrClient,
  algorithm,
  onOpenMrrPools,
  onOpenCompletionCalculator,
  coinPrices,
}) {
  const [activeModal, setActiveModal] = useState(null);
  const [modalData, setModalData] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  const tg = useTelegram(onCall, mrrClient);

  const [rentals, setRentals] = useState([]);
  const [loadingRentals, setLoadingRentals] = useState(false);

  const [mrrSummaryData, setMrrSummaryData] = useState(null);
  const lastSummarySentTime = useRef(0);
  const [newRentalFound, setNewRentalFound] = useState(null);
  const knownRentalIds = useRef(new Set());
  const notifiedAlerts = useRef(new Set());
  const conditionTimers = useRef(new Map());
  const fetchInFlightRef = useRef(false);

  const fetchActiveRentals = useCallback(async () => {
    if (!mrrClient) {
      setRentals([]);
      knownRentalIds.current.clear();
      return;
    }
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    setLoadingRentals(true);
    try {
      const result = await onCall("/api/v2/mrr/rentals", {
        query: { client: mrrClient },
        silent: true,
      });
      if (result?.success) {
        const rawList = extractArray(result);
        const now = Date.now();
        const newList = rawList.filter((r) => {
          const endTs = toUtcTimestamp(r.end || r.end_time);
          return endTs > now;
        });

        const fresh = newList.find((r) => {
          const isKnown = knownRentalIds.current.has(String(r.id));
          const startTime = toUtcTimestamp(r.start);
          return !isKnown && now - startTime < 900000;
        });

        if (fresh) {
          setNewRentalFound(fresh);
          if (Notification.permission === "granted") {
            new Notification(`Rig Rented: ${fresh.name || fresh.id}`, {
              body: `New rental active for ${fresh.hours}h`,
            });
          }
        }

        newList.forEach((r) => {
          const rentalId = String(r.id);
          const startTime = toUtcTimestamp(r.start);
          const endTime = toUtcTimestamp(r.end);
          const elapsedMs = now - startTime;
          const remainingMs = endTime - now;
          const rawHash = r.hashrate?.average?.hash || r.hashrate?.current || r.hash || 0;
          const currentHash = Number.isFinite(parseFloat(rawHash)) ? parseFloat(rawHash) : 0;
          const rawEff = r.hashrate?.average?.percent || r.percent || 100;
          const efficiency = Number.isFinite(parseFloat(rawEff)) ? parseFloat(rawEff) : 100;

          let timers = conditionTimers.current.get(rentalId) || { zeroStart: 0, lowStart: 0 };

          const lowPerfKey = `${rentalId}_low_50`;
          if (efficiency < 50 && efficiency > 0) {
            if (timers.lowStart === 0) timers.lowStart = now;
            if (now - timers.lowStart >= 900000) {
              if (!notifiedAlerts.current.has(lowPerfKey)) {
                tg.notifyLowEfficiency(r, remainingMs, efficiency).then(() => notifiedAlerts.current.add(lowPerfKey)).catch(() => {});
              }
            }
          } else {
            timers.lowStart = 0;
            notifiedAlerts.current.delete(lowPerfKey);
          }

          const zeroHashKey = `${rentalId}_zero_5m`;
          if (currentHash === 0) {
            if (timers.zeroStart === 0) timers.zeroStart = now;
            if (now - timers.zeroStart >= 300000) {
              if (!notifiedAlerts.current.has(zeroHashKey)) {
                tg.notifyZeroHashrate(r, now - timers.zeroStart).then(() => notifiedAlerts.current.add(zeroHashKey)).catch(() => {});
              }
            }
          } else {
            timers.zeroStart = 0;
            notifiedAlerts.current.delete(zeroHashKey);
          }

          const startupKey = `${rentalId}_startup_50`;
          if (elapsedMs > 0 && elapsedMs < 3600000 && efficiency < 50 && efficiency > 0) {
            if (!notifiedAlerts.current.has(startupKey)) {
              tg.notifyStartupEfficiencyAlert(r, efficiency).then(() => notifiedAlerts.current.add(startupKey)).catch(() => {});
            }
          } else if (efficiency >= 70 || elapsedMs >= 3600000) {
            notifiedAlerts.current.delete(startupKey);
          }

          const completionKey = `${rentalId}_completion_70`;
          if (remainingMs > 0 && remainingMs < 3600000 && efficiency < 70 && efficiency > 0) {
            if (!notifiedAlerts.current.has(completionKey)) {
              tg.notifyCompletionEfficiencyAlert(r, efficiency).then(() => notifiedAlerts.current.add(completionKey)).catch(() => {});
            }
          } else if (efficiency >= 70 || remainingMs >= 3600000 || remainingMs <= 0) {
            notifiedAlerts.current.delete(completionKey);
          }

          const successKey = `${rentalId}_success_95`;
          if (remainingMs > 0 && remainingMs < 600000 && efficiency >= 95) {
            if (!notifiedAlerts.current.has(successKey)) {
              tg.notifyCompletionSuccess(r, efficiency).then(() => notifiedAlerts.current.add(successKey)).catch(() => {});
            }
          } else if (remainingMs >= 600000 || remainingMs <= 0 || efficiency < 95) {
            notifiedAlerts.current.delete(successKey);
          }

          conditionTimers.current.set(rentalId, timers);
        });

        newList.forEach((r) => knownRentalIds.current.add(String(r.id)));
        setRentals(newList);
      }
    } catch (err) {
      console.error("Auto Fetch Rentals Error:", err);
    } finally {
      fetchInFlightRef.current = false;
      setLoadingRentals(false);
    }
  }, [mrrClient, onCall, tg]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (mrrSummaryData && rentals && (mrrSummaryData.totalAll > 0 || rentals.length === 0)) {
        const currentRentals = rentals.filter(isCurrentRental);
        const rented24h = currentRentals.filter((r) => Date.now() - toUtcTimestamp(r.start) <= 86400000).length;
        tg.notifyHeartbeatSummary({ ...mrrSummaryData, rentedAll: currentRentals.length, rented24h });
        lastSummarySentTime.current = Date.now();
      }
    }, 900000);
    return () => clearInterval(interval);
  }, [mrrSummaryData, rentals, tg]);

  useEffect(() => {
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
    fetchActiveRentals();
    const interval = setInterval(fetchActiveRentals, 60000);
    return () => clearInterval(interval);
  }, [fetchActiveRentals]);

  const openManagementModal = async (type) => {
    setActiveModal(type);
    if (type === "list") return;
    if (!mrrClient) {
      setModalData({ success: false, message: "Please select a client first." });
      setModalLoading(false);
      return;
    }
    setModalLoading(true);
    setModalData(null);
    try {
      let path;
      let clientToUse = mrrClient;
      if (type === "list_all_rigs") path = "/api/v2/mrr/rig/all";
      else if (type === "rental") path = "/api/v2/mrr/rentals";
      else if (type === "rental_history") path = "/api/v2/mrr/rental/history";
      else if (type === "mrr_nh_compare") path = "/api/v2/mrr/compare";
      const result = await onCall(path, { query: { client: clientToUse }, silent: true });
      setModalData(result);
    } catch (err) {
      console.error("MRR Modal Error:", err);
      setModalData({ success: false, message: err.message || String(err) });
    } finally {
      setModalLoading(false);
    }
  };

  const handleForceHeartbeat = async (client) => {
    try {
      const result = await onCall("/api/v2/mrr/monitor/run", {
        method: "POST",
        body: { client: client || mrrClient },
        silent: true,
      });
      return result;
    } catch (err) {
      return { success: false, message: err.message };
    }
  };
  const [isCryptoRateModalOpen, setIsCryptoRateModalOpen] = useState(false);

  return (
    <div className="rig-section" style={{ 
      padding: "0 clamp(12px, 1.5vw, 24px)", 
      width: "100%",
      maxWidth: "none",
      margin: "0 auto",
      minHeight: "100vh",
      boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "16px", marginBottom: "20px", paddingBottom: "16px", borderBottom: '1px solid rgba(148, 163, 184, 0.15)' }}>
        {/* Left side of header */}
        <h2 className="section-title" style={{ margin: 0, fontSize: "clamp(1rem, 2vw, 1.25rem)" }}>
          ⛏️ Mining Rig Rentals
        </h2>
        <button className="btn-pro secondary" onClick={() => openManagementModal("list")} style={{ fontSize: "clamp(10px, 1vw, 12px)", padding: "4px 12px" }}>
            📋 Rigs
          </button>
          <button className="btn-pro secondary" onClick={() => setIsCryptoRateModalOpen(true)} style={{ fontSize: "clamp(10px, 1vw, 12px)", padding: "4px 12px" }}>
            🚦Update Nicehash Rates
          </button>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          {/* Right side of header */}
          
          <select
            className="select-pro"
            value={mrrClient || "VN"}
            onChange={(e) => setMrrClient(e.target.value)}
            style={{ fontSize: "clamp(10px, 1vw, 12px)", padding: "4px 8px", minWidth: "120px" }}
          >
            <option value="VN">🌐 All Clients</option>
            <option value="BT">BT</option>
            <option value="SL">SL</option>
            <option value="LN">LN</option>
            <option value="LUCKY">LUCKY</option>
          </select>
          

          
          {/* <button className="btn-pro secondary" onClick={() => onCall("/api/v2/mrr/balance", { query: { client: mrrClient }, showModal: true })} style={{ fontSize: "clamp(10px, 1vw, 12px)", padding: "4px 12px" }}>
            💰 Balance
          </button> */}
          {/* <TelegramManager onCall={onCall} mrrClient={mrrClient} /> */}
        </div>
      </div>

      {/* Quick Stats */}
      {/* <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "8px", marginBottom: "12px" }}>
        <div style={{ background: "rgba(255,255,255,0.03)", padding: "8px 12px", borderRadius: "6px", textAlign: "center" }}>
          <div style={{ fontSize: "10px", opacity: 0.5 }}>Active</div>
          <div style={{ fontSize: "clamp(16px, 2vw, 20px)", fontWeight: "bold", color: "#a78bfa" }}>{rentals.length}</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", padding: "8px 12px", borderRadius: "6px", textAlign: "center" }}>
          <div style={{ fontSize: "10px", opacity: 0.5 }}>Available</div>
          <div style={{ fontSize: "clamp(16px, 2vw, 20px)", fontWeight: "bold", color: "#10b981" }}>0</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", padding: "8px 12px", borderRadius: "6px", textAlign: "center" }}>
          <div style={{ fontSize: "10px", opacity: 0.5 }}>Offline</div>
          <div style={{ fontSize: "clamp(16px, 2vw, 20px)", fontWeight: "bold", color: "#f87171" }}>0</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", padding: "8px 12px", borderRadius: "6px", textAlign: "center" }}>
          <div style={{ fontSize: "10px", opacity: 0.5 }}>Workers</div>
          <div style={{ fontSize: "clamp(16px, 2vw, 20px)", fontWeight: "bold", color: "#60a5fa" }}>0</div>
        </div>
      </div> */}

      {/* New Rental Notification Modal */}
      <Modal isOpen={!!newRentalFound} onClose={() => setNewRentalFound(null)} title="🚀 New Rig Rented!" maxWidth="500px">
        <div style={{ textAlign: "center", padding: "20px" }}>
          <div style={{ width: "60px", height: "60px", background: "rgba(16,185,129,0.2)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: "#10b981", fontSize: "24px" }}>✔</div>
          <h3 style={{ margin: "0 0 10px 0" }}>{newRentalFound?.name || `Rental #${newRentalFound?.id}`}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "20px" }}>
            <div style={{ background: "rgba(255,255,255,0.05)", padding: "10px", borderRadius: "6px" }}>
              <div style={{ fontSize: "10px", opacity: 0.5 }}>ALGORITHM</div>
              <div style={{ fontWeight: "bold", color: "#60a5fa" }}>{newRentalFound?.algo || "N/A"}</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.05)", padding: "10px", borderRadius: "6px" }}>
              <div style={{ fontSize: "10px", opacity: 0.5 }}>DURATION</div>
              <div style={{ fontWeight: "bold", color: "#fbbf24" }}>{newRentalFound?.hours} Hours</div>
            </div>
          </div>
          <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", padding: "12px", borderRadius: "6px", color: "#34d399", fontSize: "13px", marginBottom: "20px" }}>
            This rig has been successfully added to your active rentals.
          </div>
          <div className="modal-actions" style={{ justifyContent: "center" }}>
            <button className="btn-pro primary" onClick={() => { setNewRentalFound(null); openManagementModal("rental"); }}>View All Rentals</button>
            <button className="btn-pro secondary" onClick={() => setNewRentalFound(null)}>Dismiss</button>
          </div>
        </div>
      </Modal>

      {/* Inline Quick View */}
      <div style={{ marginTop: "16px" }}>
        <ErrorBoundary name="MrrRigs (QuickView)">
          <MrrRigs
            onCall={onCall}
            mrrClient={mrrClient}
            algo={algorithm}
            onOpenPool={onOpenMrrPools}
            onOpenCompletionCalculator={onOpenCompletionCalculator}
            onSummaryUpdate={setMrrSummaryData}
            coinPrices={coinPrices}
            onInfo={(id) => onCall(`/api/v2/mrr/rig/${encodeURIComponent(id)}/info`, { query: { client: mrrClient } })}
          />
        </ErrorBoundary>
      </div>

      {/* Dedicated Management Modals */}
      <Modal isOpen={!!activeModal} onClose={() => setActiveModal(null)} title={activeModal === "list" ? "Rigs Manager" : activeModal === "mrr_nh_compare" ? "MRR Rigs vs NiceHash Market Price" : activeModal === "rental_history" ? "Rental History" : "Active Rentals"} maxWidth="100%" maxHeight="90vh">
        <div style={{ padding: "2px" }}>
          {activeModal === "list" && (
            <ErrorBoundary name="MrrRigs (Modal)">
              <MrrRigs
                onCall={onCall}
                mrrClient={mrrClient}
                algo={algorithm}
                onOpenPool={onOpenMrrPools}
                onOpenCompletionCalculator={onOpenCompletionCalculator}
                onInfo={(id) => onCall(`/api/v2/mrr/rig/${encodeURIComponent(id)}/info`, { query: { client: mrrClient } })}
              />
            </ErrorBoundary>
          )}
          {activeModal === "list_all_rigs" && (
            <MrrRigs
              onCall={onCall}
              mrrClient={mrrClient}
              endpoint="/rig"
              algo={algorithm}
              onOpenPool={onOpenMrrPools}
              onOpenCompletionCalculator={onOpenCompletionCalculator}
              onInfo={(id) => onCall(`/api/v2/mrr/rig/${encodeURIComponent(id)}/info`, { query: { client: mrrClient } })}
            />
          )}
          {activeModal === "mrr_nh_compare" && (
            <>
              {modalLoading && <div style={{ textAlign: "center", padding: "40px" }}>Fetching MRR rigs and NiceHash prices...</div>}
              {!modalLoading && modalData && (
                <div style={{ maxHeight: "75vh", overflowY: "auto" }}>
                  {modalData.data && modalData.data.length > 0 ? (
                    <div className="table-responsive" style={{ overflowX: "auto" }}>
                      <table className="pro-table" style={{ width: "100%", minWidth: "700px", fontSize: "12px" }}>
                        <thead>
                          <tr>
                            <th>Rig Name</th>
                            <th>Algo</th>
                            <th>MRR Price</th>
                            <th>NH Algo</th>
                            <th>NH Fixed Price</th>
                            <th>NH Standard Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {modalData.data.map((item, index) => {
                            const nhData = item.nicehashPrice?.price || item.nicehashPrice;
                            return (
                              <tr key={item.mrrRig.id || index}>
                                <td>{item.mrrRig.name}</td>
                                <td>{item.mrrRig.algo}</td>
                                <td>{item.mrrRig.price} {item.mrrRig.currency}</td>
                                <td>{nhData?.algorithm || "N/A"}</td>
                                <td>{nhData?.fixedPrice ? `${nhData.fixedPrice} ${nhData.currency}/${nhData.speedUnit}` : "N/A"}</td>
                                <td>{nhData?.standardPrice?.fast ? `${nhData.standardPrice.fast} ${nhData.currency}/${nhData.speedUnit}` : "N/A"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ padding: "30px", textAlign: "center", opacity: 0.5 }}>No MRR rigs found for comparison or failed to fetch data.</div>
                  )}
                </div>
              )}
            </>
          )}
          {modalLoading && <div style={{ textAlign: "center", padding: "40px" }}>Loading data from MiningRigRentals...</div>}
          {!modalLoading && (activeModal === "rental" || activeModal === "rental_history") && (
            <div style={{ maxHeight: "75vh", overflowY: "auto" }}>
              <MrrRentalsTable data={modalData} onOpenPools={onOpenMrrPools} onNotice={tg.sendManualNotice} mrrClient={mrrClient} />
            </div>
          )}
        </div>
        <div className="modal-actions" style={{ marginTop: "20px", textAlign: "right" }}>
          <button className="btn-pro secondary" onClick={() => setActiveModal(null)}>Close</button>
        </div>
      </Modal>
    </div>
  );
}