// RentedRigCard.jsx - CLEAN WORKING VERSION

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CountdownTimer } from "./MiningRigRental";
import {
  getClientBadgeStyle,
  formatRentalStartTime,
  getStatusClass,
  getRoiColor,
  getNiceHashPriceValue,
} from "../../core/mrrUtils.js";

// ✅ Import from central mapping
import {
  getAlgoDisplayName,
  normalizeAlgo,
  getAlgoMapping,
  getNiceHashUnit,
  getMrrUnit,
  convertNiceHashToMrr,
  HASHRATE_SUFFIXES,
  isAsicBoost,
} from '../../core/mapping.js';

// ============================================
// CONSTANTS & HELPERS
// ============================================

// Cache for MRR market rates
const mrrPriceCache = new Map();
const CACHE_TTL = 60 * 1000; // 60 seconds

const formatPrice = (value) => {
  if (!value || isNaN(value)) return '0.00000000';
  return parseFloat(value).toFixed(8);
};

const formatPercent = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "N/A";
  return `${num > 0 ? "+" : ""}${num.toFixed(2)}%`;
};

const cleanHashrateUnit = (unit) => {
  const match = String(unit || "").toUpperCase().match(/GSOL|MSOL|KSOL|SOL|E|P|T|G|M|K|H/);
  return match?.[0] || "H";
};

const formatHashrateWithUnit = (value, unit) => {
  if (!value || value <= 0) return "0H";
  const cleanUnit = cleanHashrateUnit(unit || "H");
  const multiplier = HASHRATE_SUFFIXES[cleanUnit] || 1;
  const rawH = value * multiplier;
  const units = ["H", "K", "M", "G", "T", "P", "E"];
  const mults = [1, 1e3, 1e6, 1e9, 1e12, 1e15, 1e18];
  let idx = 0;
  for (let i = mults.length - 1; i >= 0; i--) {
    if (rawH >= mults[i]) {
      idx = i;
      break;
    }
  }
  const val = rawH / mults[idx];
  return `${val.toFixed(2)}${units[idx]}`;
};

// ============================================
// MRR API KEY HELPER
// ============================================
const getMrrAlgoKey = (normalizedAlgo) => {
  if (!normalizedAlgo || normalizedAlgo === 'UNKNOWN') return null;
  
  const mapping = getAlgoMapping(normalizedAlgo);
  if (!mapping || !mapping.niceHash) return null;
  
  const niceHashAlgo = mapping.niceHash;
  
  const keyMap = {
    'SCRYPT': 'scrypt',
    'SHA256': 'sha256',
    'SHA256ASICBOOST': 'sha256ab',
    'RANDOMXMONERO': 'randomx',
    'KAWPOW': 'kawpow',
    'DAGGERHASHIMOTO': 'daggerhashimoto',
    'ETHASH': 'daggerhashimoto',
    'ETCHASH': 'etchash',
    'EQUIHASH': 'equihash',
    'CRYPTONIGHT': 'cryptonight',
    'CRYPTONIGHTV7': 'cryptonight',
    'CRYPTONIGHTV8': 'cryptonight',
    'CRYPTONIGHTR': 'cryptonight',
    'X11': 'x11',
    'X13': 'x13',
    'X15': 'x15',
    'X16R': 'x16r',
    'X16RV2': 'x16rv2',
    'LYRA2RE': 'lyra2re',
    'LYRA2REV2': 'lyra2rev2',
    'LYRA2REV3': 'lyra2rev3',
    'LYRA2Z': 'lyra2z',
    'SCRYPTN': 'scryptn',
    'NEOSCRYPT': 'neoscrypt',
    'BLAKE256R8': 'blake256r8',
    'BLAKE256R14': 'blake256r14',
    'BLAKE2S': 'blake2s',
    'KECCAK': 'keccak',
    'NIST5': 'nist5',
    'QUBIT': 'qubit',
    'QUARK': 'quark',
    'WHIRLPOOLX': 'whirlpoolx',
    'DECRED': 'decred',
    'SIA': 'sia',
    'LBRY': 'lbry',
    'PASCAL': 'pascal',
    'ZHASH': 'zhash',
    'BEAM': 'beam',
    'BEAMV2': 'beamv2',
    'BEAMV3': 'beamv3',
    'GRINCUCKAROO29': 'grincuckaroo29',
    'GRINCUCKATOO31': 'grincuckatoo31',
    'CUCKOOCYCLE': 'cuckoo',
    'HANDSHAKE': 'handshake',
    'AUTOLYKOS': 'autolykos',
    'OCTOPUS': 'octopus',
    'VERUSHASH': 'verushash',
    'KHEAVYHASH': 'kheavyhash',
    'KASPA': 'kheavyhash',
    'NEXAPOW': 'nexapow',
    'ALEPHIUM': 'alephium',
    'FISHHASH': 'fishhash',
    'IRONFISH': 'ironfish',
    'KARLSENHASH': 'karlsenhash',
    'PYRINHASH': 'pyrinhash',
    'EAGLESONG': 'eaglesong',
  };
  
  return keyMap[niceHashAlgo] || null;
};

// ============================================
// MAIN COMPONENT
// ============================================
const RentedRigCard = ({
  rig,
  info,
  algoName,
  isMine = false,
  nhOrders = [],
  coinPrices = {},
  mrrClient = 'VN',
  onOpenPool,
  onOpenCompletionCalculator,
  fetchRigDetailInfo,
  loadingInfoIds = new Set(),
  handleRigStatus,
  handlePriceChange,
  expandedPools = new Set(),
  togglePoolInfo,
  setEnrichedInfo,
}) => {
  // ── Basic state ──
  const statusStr = String(
    typeof rig.status === "object" ? rig.status.status : rig.status || "",
  ).toLowerCase();
  const rentalId = rig.rentalid || rig.current_rental_id || rig.rental_id;
  const isRented = statusStr.includes("rented") || statusStr.includes("active") || Boolean(rentalId);
  const displayId = isRented && rentalId ? rentalId : rig.id;
  const idLabel = isRented && rentalId ? "Rental" : "Rig";
  const [nowMs, setNowMs] = useState(0);
  
  // ── MRR rate state ──
  const [mrrRateData, setMrrRateData] = useState({ raw: 0, normalized: 0 });
  const [loadingRate, setLoadingRate] = useState(false);
  const [rateError, setRateError] = useState(null);

  // ── Algorithm & units ──
  const rawAlgo = info?.algo || rig.algo || rig.algorithm || rig.type || algoName || 'Unknown';
  const normalizedAlgo = normalizeAlgo(rawAlgo);
  const displayName = getAlgoDisplayName(normalizedAlgo);
  const mrrUnit = getMrrUnit(normalizedAlgo);
  const nhUnit = getNiceHashUnit(normalizedAlgo);
  const isAsicBoostAlgo = isAsicBoost(normalizedAlgo);

  // ── Timer ──
  useEffect(() => {
    if (!isRented) return undefined;
    const updateNow = () => setNowMs(Date.now());
    updateNow();
    const timer = setInterval(updateNow, 30000);
    return () => clearInterval(timer);
  }, [isRented]);

  // ── Fetch MRR rate ──
  useEffect(() => {
    if (!normalizedAlgo || normalizedAlgo === 'UNKNOWN') return;

    const fetchRate = async () => {
      setLoadingRate(true);
      setRateError(null);

      const mrrAlgoKey = getMrrAlgoKey(normalizedAlgo);
      if (!mrrAlgoKey) {
        setRateError('No MRR key for this algorithm');
        setLoadingRate(false);
        return;
      }

      // Check cache
      const cached = mrrPriceCache.get(mrrAlgoKey);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        setMrrRateData(cached.data);
        setLoadingRate(false);
        return;
      }

      try {
        const url = `/api/v2/mrr/market/algos/${mrrAlgoKey}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        let rawRate = 0;
        
        if (data.success && data.data) {
          rawRate = data.data.suggested_price?.amount || 
                    data.data.stats?.prices?.lowest?.price ||
                    data.data.price || 0;
        } else if (data.price) {
          rawRate = data.price;
        }

        if (rawRate > 0) {
          const normalizedRate = convertNiceHashToMrr(rawRate, normalizedAlgo);
          const rateData = { raw: rawRate, normalized: normalizedRate };
          setMrrRateData(rateData);
          mrrPriceCache.set(mrrAlgoKey, { data: rateData, timestamp: Date.now() });
        } else {
          setRateError("No rate available");
        }
      } catch (err) {
        console.error('Failed to fetch MRR rate:', err);
        setRateError(err.message);
      } finally {
        setLoadingRate(false);
      }
    };

    fetchRate();
  }, [normalizedAlgo]);

  // ── Get my order price ──
  const myPrice = useMemo(() => {
    if (!nhOrders || nhOrders.length === 0) return 0;
    return getNiceHashPriceValue(nhOrders[0]?.price || nhOrders[0]?.rawOrder?.price || nhOrders[0]);
  }, [nhOrders]);

  // ── Calculate spread ──
  const spread = useMemo(() => {
    if (myPrice > 0 && mrrRateData.normalized > 0) {
      return ((mrrRateData.normalized - myPrice) / myPrice) * 100;
    }
    return null;
  }, [myPrice, mrrRateData.normalized]);

  const isProfitable = spread !== null && spread > 0;

  // ── Get hashrate values ──
  const adsVal = useMemo(() => {
    return info?.rawAds || 
           parseFloat(rig.hashrate?.advertised?.hash || rig.hashrate?.advertised || rig.advertised || 0) || 0;
  }, [info, rig]);

  const avgVal = useMemo(() => {
    return info?.rawAvg || 
           parseFloat(rig.hashrate?.average || rig.average || rig.hash || 0) || 0;
  }, [info, rig]);

  // ── Get start/end times ──
  const rentalStartTime = info?.startTime || rig.start;
  const rentalEndTime = info?.endTime || rig.end || (typeof rig.status === "object" ? rig.status.end : null);
  
  const startT = useMemo(() => {
    if (!rentalStartTime) return 0;
    return new Date(rentalStartTime + (String(rentalStartTime).endsWith("UTC") ? "" : " UTC")).getTime();
  }, [rentalStartTime]);

  const endT = useMemo(() => {
    if (!rentalEndTime) return 0;
    return new Date(rentalEndTime + (String(rentalEndTime).endsWith("UTC") ? "" : " UTC")).getTime();
  }, [rentalEndTime]);

  const totalMs = useMemo(() => {
    if (!startT || !endT) return 0;
    return Math.max(0, endT - startT);
  }, [startT, endT]);

  // ── Progress ──
  const elapsedMs = useMemo(() => {
    if (!nowMs || !totalMs) return 0;
    return Math.max(0, Math.min(nowMs - startT, totalMs));
  }, [nowMs, startT, totalMs]);

  const timeProgress = totalMs > 0 ? (elapsedMs / totalMs) * 100 : 0;

  // ── Efficiency ──
  const effNum = useMemo(() => {
    if (adsVal > 0) {
      return (avgVal / adsVal) * 100;
    }
    return 0;
  }, [avgVal, adsVal]);

  const eff = Number.isFinite(effNum) ? effNum.toFixed(2) : "0.00";

  // ── Target hashrate ──
  const targetHashrate = useMemo(() => {
    const remainingMs = totalMs - elapsedMs;
    if (remainingMs > 0) {
      return ((adsVal * totalMs / 1000) - (avgVal * elapsedMs / 1000)) / (remainingMs / 1000);
    }
    return 0;
  }, [adsVal, avgVal, totalMs, elapsedMs]);

  const isBehind = targetHashrate > adsVal;
  const hSuffix = info?.hashrate?.suffix || rig.hashrate?.advertised?.type || nhUnit || mrrUnit || "";

  // ── Styles ──
  const shellStyle = {
    background: `radial-gradient(circle at top right, ${isProfitable ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.1)'} 0%, transparent 80%)`,
    border: `1.5px solid ${isProfitable ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.15)'}`,
    borderRadius: "16px",
    padding: "12px",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    boxShadow: "0 10px 22px rgba(0, 0, 0, 0.16)",
    overflow: "hidden",
  };

  const sectionStyle = {
    background: "rgba(255,255,255,0.035)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "8px",
    padding: "2px",
  };

  return (
    <article className="rig-card" style={shellStyle}>
      {/* ─── Header ─── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
            <span style={{
              background: isMine ? "rgba(37, 99, 235, 0.18)" : "rgba(255,255,255,0.08)",
              color: "white",
              fontSize: "8px",
              padding: "2px 6px",
              borderRadius: "999px",
              fontWeight: "700",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}>
              {idLabel}: #{displayId}
            </span>
            {rig.mrrClient && (
              <span style={{
                ...getClientBadgeStyle(rig.mrrClient),
                fontSize: "8px",
                padding: "2px 6px",
                borderRadius: "999px",
                fontWeight: "700",
              }}>
                {rig.mrrClient.toUpperCase()}
              </span>
            )}
            <span style={{
              fontSize: "8px",
              padding: "2px 6px",
              borderRadius: "999px",
              fontWeight: "700",
              ...getStatusClass(rig.status),
            }}>
              {String(typeof rig.status === "object" ? rig.status.status : rig.status || "").toUpperCase()}
            </span>
          </div>
          <strong title={rig.name} style={{
            fontSize: "13px",
            lineHeight: 1.15,
            color: "#f8fafc",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {rig.name || 'Unknown Rig'}
          </strong>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap", color: "#94a3b8", fontSize: "9px" }}>
            <span style={{
              fontSize: "14px",
              fontWeight: 900,
              color: "#38bdf8",
              textShadow: "0 0 18px rgba(56, 189, 248, 0.22)",
            }}>
              {displayName}
              {isAsicBoostAlgo && (
                <span style={{
                  background: "rgba(245, 158, 11, 0.2)",
                  color: "#fbbf24",
                  fontSize: "7px",
                  padding: "1px 6px",
                  borderRadius: "999px",
                  fontWeight: "700",
                  marginLeft: "4px",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                }}>
                  ASIC Boost
                </span>
              )}
            </span>
          </div>
        </div>

        {/* ROI Badge */}
        <div style={{
          display: "flex",
          gap: "4px",
          minWidth: "142px",
          textAlign: "right",
          marginLeft: "auto",
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}>
          <div style={{
            padding: "6px 8px",
            borderRadius: "10px",
            background: spread === null ? "rgba(255,255,255,0.04)" : spread >= 0 ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)",
            border: `1px solid ${spread === null ? "rgba(255,255,255,0.08)" : spread >= 0 ? "rgba(16,185,129,0.22)" : "rgba(239,68,68,0.22)"}`,
          }}>
            <div style={{ fontSize: "8px", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.06em" }}>ROI</div>
            <div style={{
              fontSize: "18px",
              lineHeight: 1,
              fontWeight: 900,
              color: spread === null ? '#94a3b8' : spread >= 0 ? '#34d399' : '#f87171',
            }}>
              {loadingRate ? '...' : spread !== null ? formatPercent(spread) : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Main Grid ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 0.85fr", gap: "6px" }}>
        {/* ─── Left Column: Price & Rates ─── */}
        <section style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "6px", marginBottom: "4px" }}>
            <div style={{ fontSize: "8px", color: "#94a3b8" }}>
              {loadingRate ? "Loading MRR API..." : rateError ? "MRR Error" : "MRR Market Rate"}
            </div>
            {loadingRate && <span style={{ fontSize: "7px", color: "#60a5fa" }}>loading...</span>}
          </div>

          {/* MRR Rate Display */}
          <div style={{
            marginBottom: "6px",
            padding: "7px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, rgba(245, 158, 11, 0.16), rgba(16, 185, 129, 0.10))",
            border: "1px solid rgba(251, 191, 36, 0.20)",
          }}>
            <div style={{ opacity: 0.72, textTransform: "uppercase", fontSize: "8px", letterSpacing: "0.08em" }}>
              MRR Market Price
            </div>
            <div style={{ color: "#fbbf24", fontWeight: 900, fontSize: "11px", lineHeight: 1.1, marginTop: "3px" }}>
              {loadingRate ? '...' : rateError ? 'N/A' : formatPrice(mrrRateData.raw)} BTC/{mrrUnit}/Day
            </div>
            {mrrRateData.normalized > 0 && (
              <div style={{ color: "#86efac", fontWeight: 700, fontSize: "9px", marginTop: "3px" }}>
                ~ {formatPrice(mrrRateData.normalized)} BTC/{nhUnit}/Day (normalized)
              </div>
            )}
          </div>

          {/* My Order Price */}
          <div style={{
            padding: "7px",
            borderRadius: "10px",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}>
            <div style={{ opacity: 0.72, textTransform: "uppercase", fontSize: "8px", letterSpacing: "0.08em" }}>
              My Order Price
            </div>
            <div style={{ color: "#60a5fa", fontWeight: 900, fontSize: "11px", lineHeight: 1.1, marginTop: "3px" }}>
              {formatPrice(myPrice)} BTC/{nhUnit}/Day
            </div>
            {spread !== null && (
              <div style={{
                color: spread >= 0 ? '#34d399' : '#f87171',
                fontWeight: 700,
                fontSize: "9px",
                marginTop: "3px",
              }}>
                {spread >= 0 ? '✅' : '⚠️'} {spread >= 0 ? 'Profitable' : 'Not profitable'} ({formatPercent(spread)})
              </div>
            )}
          </div>
        </section>

        {/* ─── Right Column: Efficiency & Hashrates ─── */}
        <section style={sectionStyle}>
          <div style={{ display: "grid", gap: "4px" }}>
            {/* Efficiency Bar */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "8px", marginBottom: "2px" }}>
                <span style={{ opacity: 0.55, textTransform: "uppercase" }}>Efficiency</span>
                <span style={{
                  fontSize: "16px",
                  fontWeight: 800,
                  color: effNum >= 100 ? "#22d3ee" : effNum > 90 ? "#10b981" : effNum > 50 ? "#fbbf24" : "#ef4444",
                }}>
                  {eff}%
                </span>
              </div>
              <div style={{ width: "100%", height: "4px", background: "rgba(255,255,255,0.08)", borderRadius: "999px", overflow: "hidden" }}>
                <div style={{
                  width: `${Math.min(100, Math.max(0, effNum || 0))}%`,
                  height: "100%",
                  background: effNum >= 100 ? "#22d3ee" : effNum > 90 ? "#10b981" : effNum > 50 ? "#fbbf24" : "#ef4444",
                  borderRadius: "999px",
                }} />
              </div>
            </div>

            {/* Progress Bar */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "8px", marginBottom: "2px" }}>
                <span style={{ opacity: 0.55, textTransform: "uppercase" }}>Progress</span>
                <span style={{ fontSize: "16px", fontWeight: 800, color: timeProgress > 90 ? "#f87171" : "#8b5cf6" }}>
                  {timeProgress.toFixed(2)}%
                </span>
              </div>
              <div style={{ width: "100%", height: "4px", background: "rgba(255,255,255,0.08)", borderRadius: "999px", overflow: "hidden" }}>
                <div style={{
                  width: `${Math.min(100, Math.max(0, timeProgress || 0))}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
                  borderRadius: "999px",
                }} />
              </div>
            </div>

            {/* Hashrates Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", marginTop: "4px" }}>
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "6px", padding: "4px 6px" }}>
                <div style={{ opacity: 0.55, textTransform: "uppercase", fontSize: "7px" }}>Current</div>
                <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: "10px" }}>
                  {info?.current || (cur > 0 ? formatHashrateWithUnit(cur, rig.hashrate?.suffix || rig.hashrate?.current?.type || "H") : "0 H/s")}
                </div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "6px", padding: "4px 6px" }}>
                <div style={{ opacity: 0.55, textTransform: "uppercase", fontSize: "7px" }}>Average</div>
                <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: "10px" }}>
                  {info?.average || (avgVal > 0 ? formatHashrateWithUnit(avgVal, rig.hashrate?.suffix || rig.hashrate?.average?.type || "H") : "0 N/A")}
                </div>
              </div>
              <div style={{ background: "rgba(63, 82, 255, 0.34)", borderRadius: "6px", padding: "4px 6px" }}>
                <div style={{ opacity: 0.55, textTransform: "uppercase", fontSize: "7px" }}>Advertised</div>
                <div style={{ color: "#ffca1d", fontWeight: 700, fontSize: "11px" }}>
                  {info?.advertised || (adsVal > 0 ? formatHashrateWithUnit(adsVal, rig.hashrate?.suffix || rig.hashrate?.advertised?.type || "H") : "0 N/A")}
                </div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "6px", padding: "4px 6px" }}>
                <div style={{ opacity: 0.55, textTransform: "uppercase", fontSize: "7px" }}>Target</div>
                <div style={{ color: isBehind ? "#f87171" : "#34d399", fontWeight: 700, fontSize: "10px" }}>
                  {Math.max(0, targetHashrate).toFixed(2)} <small style={{ opacity: 0.5, fontSize: "8px" }}>{String(hSuffix).toUpperCase()}</small>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ─── Time Info ─── */}
      {(rentalStartTime || rentalEndTime) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8', padding: '3px 0' }}>
          {rentalStartTime && <span>🕐 Started: {formatRentalStartTime(rentalStartTime)}</span>}
          {rentalEndTime && <span><CountdownTimer endTime={rentalEndTime} /></span>}
        </div>
      )}

      {/* ─── Buttons ─── */}
      <div style={{ display: "flex", gap: "8px", marginTop: "auto", flexWrap: "wrap" }}>
        {(isMine || isRented) && (
          <button
            className="btn-pro secondary"
            style={{
              flex: "1 1 120px",
              fontSize: "10px",
              background: isRented ? "rgba(139, 92, 246, 0.16)" : "rgba(255,255,255,0.05)",
              color: isRented ? "#a78bfa" : "#94a3b8",
            }}
            onClick={() => {
              togglePoolInfo?.(rig.id);
              onOpenPool?.(rig, info);
            }}
          >
            {expandedPools.has(rig.id) ? "Hide Pools" : "Pools"}
          </button>
        )}
        {isMine && !isRented && (
          <>
            <button
              className="btn-pro secondary"
              style={{ flex: "1 1 90px", fontSize: "10px", color: statusStr === "disabled" ? "#10b981" : "#f87171" }}
              onClick={() => handleRigStatus?.(rig, statusStr === "disabled" ? "available" : "disabled")}
            >
              {statusStr === "disabled" ? "Enable" : "Disable"}
            </button>
            <button
              className="btn-pro secondary"
              style={{ flex: "1 1 90px", fontSize: "10px" }}
              onClick={() => handlePriceChange?.(rig)}
            >
              Price
            </button>
          </>
        )}
        {isRented && info && onOpenCompletionCalculator && (
          <button
            className="btn-pro secondary"
            style={{ flex: "1 1 90px", fontSize: "10px" }}
            onClick={() => onOpenCompletionCalculator(rig, info)}
          >
            Calc
          </button>
        )}
        <button
          className="btn-pro"
          style={{ flex: "1 1 90px", fontSize: "10px" }}
          onClick={() => fetchRigDetailInfo?.(rig)}
          disabled={loadingInfoIds.has(rig.id)}
        >
          {loadingInfoIds.has(rig.id) ? "..." : "More"}
        </button>
        <button
          className="btn-pro secondary"
          style={{
            width: "36px",
            fontSize: "12px",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => {
            setEnrichedInfo?.((prev) => {
              const next = { ...prev };
              delete next[rig.id];
              return next;
            });
            fetchRigDetailInfo?.(rig);
          }}
          disabled={loadingInfoIds.has(rig.id)}
          title="Reload Rig Details"
        >
          {loadingInfoIds.has(rig.id) ? "..." : "↻"}
        </button>
      </div>
    </article>
  );
};

export default RentedRigCard;