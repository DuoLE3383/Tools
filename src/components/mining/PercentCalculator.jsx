import { useState } from "react";

const DEFAULT_RATE = 0.35;

const C = {
  panel: "rgba(15,23,42,0.72)",
  panelBorder: "rgba(148,163,184,0.12)",
  muted: "#64748b",
  faint: "#94a3b8",
  text: "#e2e8f0",
  accent: "#38bdf8",
  positive: "#34d399",
  negative: "#f87171",
};

function formatNumber(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

export default function PercentCalculator({
  label = "Mining fee",
  rate = DEFAULT_RATE,
}) {
  const [value, setValue] = useState("");

  const trimmed = value.trim();
  const parsed = parseFloat(trimmed);
  const valid = Number.isFinite(parsed) && trimmed !== "";

  const deducted = valid ? parsed * rate : null;
  const after = valid ? parsed * (1 - rate) : null;
  const percent = Math.round(rate * 100);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "12px",
        padding: "10px 14px",
        borderRadius: "10px",
        border: `1px solid ${C.panelBorder}`,
        background: C.panel,
      }}
    >
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          color: C.text,
          fontSize: "13px",
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: C.accent,
            boxShadow: `0 0 8px ${C.accent}66`,
          }}
        />
        {label} −{percent}%
      </label>

      <input
        type="number"
        inputMode="decimal"
        placeholder="Enter amount"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{
          width: "160px",
          padding: "8px 10px",
          borderRadius: "8px",
          border: `1px solid ${C.panelBorder}`,
          background: "rgba(2,6,23,0.6)",
          color: C.text,
          fontSize: "13px",
          fontFamily: "monospace",
          outline: "none",
          textAlign: "right",
        }}
      />

      {valid ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ color: C.negative, fontSize: "12px", fontFamily: "monospace", whiteSpace: "nowrap" }}>
            −{formatNumber(deducted)}
          </span>
          <span style={{ color: C.muted, fontSize: "12px" }}>→</span>
          <span
            style={{
              color: C.positive,
              fontSize: "13px",
              fontWeight: 700,
              fontFamily: "monospace",
              whiteSpace: "nowrap",
            }}
          >
            {formatNumber(after)}
          </span>
        </div>
      ) : (
        <span style={{ color: C.muted, fontSize: "12px" }}>Enter a number</span>
      )}
    </div>
  );
}
