// PoolMonitor.jsx — "Pool Monitor" dashboard panel.
// Dark ops-terminal card: pool + coin selectors, Add monitor, Profitable-only
// filter, Refresh, and a row of colored headline stats. Reuses the mining
// workspace data so the numbers are live.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMiningWorkspace } from "./MiningWorkspaceProvider";
import {
  ChartIcon,
  ChevronDownIcon,
  CloseIcon,
  PlusIcon,
  RefreshIcon,
} from "./Icons.jsx";

// Shared palette
const C = {
  panel: "rgba(11,18,32,0.72)",
  panelSolid: "#0b1220",
  panelBorder: "rgba(148,163,184,0.12)",
  muted: "#64748b",
  faint: "#94a3b8",
  text: "#e2e8f0",
  textH: "#f1f5f9",
  selection: "rgba(59,130,246,0.18)",
  selectionText: "#93c5fd",
  cyan: "#22d3ee",
  positive: "#34d399",
  warning: "#fbbf24",
  purple: "#a78bfa",
};

const POOL_OPTIONS = ["HeroMiners", "Kryptex", "2Miners", "Ezil", "Flexpool"];

// ── Custom dropdown ─────────────────────────────
function CustomSelect({ value, options, onChange, placeholder = "Select...", width }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", flex: "1 1 0", minWidth: "180px", maxWidth: width || "none" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          padding: "10px 14px",
          borderRadius: "8px",
          cursor: "pointer",
          background: C.panelSolid,
          border: "1px solid rgba(148,163,184,0.18)",
          color: value ? C.textH : C.faint,
          fontSize: "14px",
          fontWeight: 600,
          textAlign: "left",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || placeholder}
        </span>
        <ChevronDownIcon size={14} color={C.faint} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 40,
            background: "#0f172a",
            border: "1px solid rgba(148,163,184,0.18)",
            borderRadius: "8px",
            overflow: "hidden",
            boxShadow: "0 20px 40px -20px rgba(0,0,0,0.8)",
            maxHeight: "260px",
            overflowY: "auto",
          }}
        >
          {options.length === 0 && (
            <div style={{ padding: "12px 14px", color: C.muted, fontSize: "12px" }}>No options</div>
          )}
          {options.map((opt) => {
            const selected = opt === value;
            return (
              <button
                type="button"
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = C.selection;
                  e.currentTarget.style.color = "#fff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = selected ? C.selection : "transparent";
                  e.currentTarget.style.color = selected ? C.selectionText : C.text;
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  background: selected ? C.selection : "transparent",
                  color: selected ? C.selectionText : C.text,
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  border: "none",
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Headline stat card ──────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div
      style={{
        border: "1px solid rgba(148,163,184,0.10)",
        borderRadius: "8px",
        background: "rgba(11,18,32,0.55)",
        padding: "10px 14px",
        minWidth: "150px",
        flex: "1 1 150px",
      }}
    >
      <div
        style={{
          color: C.muted,
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color,
          fontSize: "18px",
          fontWeight: 800,
          marginTop: "4px",
          fontFamily: "'SFMono-Regular', Consolas, Menlo, monospace",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ── Main panel ──────────────────────────────────
export default function PoolMonitor() {
  const {
    opportunities,
    loading,
    error,
    lastUpdated,
    refresh,
  } = useMiningWorkspace();

  const [selectedPool, setSelectedPool] = useState("HeroMiners");
  const [selectedCoin, setSelectedCoin] = useState("CFX");
  const [onlyProfitable, setOnlyProfitable] = useState(true);
  const [wallets, setWallets] = useState([]);
  const [seconds, setSeconds] = useState(0);

  // Live session timer (matches the "02:03:13" style subtitle)
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Coin options derived from discovered routes, CFX always included
  const coinOptions = useMemo(() => {
    const set = new Set(["CFX"]);
    (opportunities || []).forEach((row) => {
      (row.heroCoins || []).forEach((c) => set.add(c));
    });
    return Array.from(set).filter(Boolean).sort();
  }, [opportunities]);

  const formatElapsed = (s) => {
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  const updatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString("en-GB", { hour12: false })
    : "--:--:--";

  const bestRow = opportunities[0] || null;
  const profitableCount = (opportunities || []).filter(
    (r) => (r.bestSpreadPercent ?? 0) > 0,
  ).length;
  const trackedCount = opportunities?.length || 0;

  const handleAdd = useCallback(() => {
    if (!selectedPool || !selectedCoin) return;
    setWallets((prev) => {
      const exists = prev.some(
        (w) => w.pool === selectedPool && w.coin === selectedCoin,
      );
      if (exists) return prev;
      return [...prev, { pool: selectedPool, coin: selectedCoin }];
    });
  }, [selectedPool, selectedCoin]);

  const handleRemove = useCallback((index) => {
    setWallets((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleRefresh = useCallback(() => {
    refresh(true);
  }, [refresh]);

  return (
    <section
      style={{
        width: "100%",
        border: `1px solid ${C.panelBorder}`,
        borderRadius: "12px",
        background: C.panel,
        padding: "16px 18px",
        display: "grid",
        gap: "14px",
      }}
    >
      {/* Header */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <ChartIcon size={16} color="#f87171" />
          <h2
            style={{
              margin: 0,
              color: C.textH,
              fontSize: "16px",
              fontWeight: 700,
              letterSpacing: "0.01em",
            }}
          >
            Pool Monitor
          </h2>
        </div>
        <div style={{ color: C.muted, fontSize: "12px", marginTop: "4px" }}>
          {wallets.length} wallets - Manual - {formatElapsed(seconds)}
        </div>
      </div>

      {/* Selectors */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <CustomSelect
          value={selectedPool}
          options={POOL_OPTIONS}
          onChange={setSelectedPool}
        />
        <CustomSelect
          value={selectedCoin}
          options={coinOptions}
          onChange={setSelectedCoin}
        />
      </div>

      {/* Add (full width) */}
      <button
        type="button"
        onClick={handleAdd}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          width: "100%",
          padding: "10px 14px",
          borderRadius: "8px",
          cursor: "pointer",
          background: "rgba(148,163,184,0.08)",
          border: "1px solid rgba(148,163,184,0.18)",
          color: C.textH,
          fontSize: "13px",
          fontWeight: 600,
        }}
      >
        <PlusIcon size={14} color="currentColor" />
        Add
      </button>

      {/* Added wallet monitors */}
      {wallets.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {wallets.map((w, i) => (
            <span
              key={`${w.pool}-${w.coin}-${i}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "5px 8px 5px 12px",
                borderRadius: "999px",
                background: "rgba(59,130,246,0.10)",
                border: "1px solid rgba(59,130,246,0.22)",
                color: "#bfdbfe",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              {w.pool} · {w.coin}
              <button
                type="button"
                aria-label={`Remove ${w.pool} ${w.coin}`}
                onClick={() => handleRemove(i)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  border: "none",
                  cursor: "pointer",
                  background: "rgba(148,163,184,0.14)",
                  color: C.faint,
                }}
              >
                <CloseIcon size={10} color="currentColor" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            color: C.faint,
            fontSize: "13px",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={onlyProfitable}
            onChange={(e) => setOnlyProfitable(e.target.checked)}
            style={{ accentColor: "#3b82f6", width: "15px", height: "15px", cursor: "pointer" }}
          />
          Profitable only
        </label>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "7px 10px",
            borderRadius: "8px",
            cursor: loading ? "default" : "pointer",
            background: "rgba(148,163,184,0.08)",
            border: "1px solid rgba(148,163,184,0.18)",
            color: C.faint,
            fontSize: "12px",
            fontWeight: 600,
            opacity: loading ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          <RefreshIcon size={14} color="currentColor" spinning={loading} />
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div style={{ color: "#f87171", fontSize: "12px" }}>{error}</div>
      )}

      {/* Headline stats */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <StatCard label="Best algorithm" value={bestRow?.label || "—"} color={C.cyan} />
        <StatCard label="Positive spread" value={profitableCount} color={C.positive} />
        <StatCard label="Algorithms tracked" value={trackedCount} color={C.warning} />
        <StatCard label="Updated" value={updatedLabel} color={C.purple} />
      </div>
    </section>
  );
}
