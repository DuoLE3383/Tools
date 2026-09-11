// MiningPanel.jsx — shared card shell for the mining dashboard.
// Every card (pool stats + wallet monitors) renders through this frame so they
// share identical padding, borders, header anatomy, action buttons and stat
// tiles. This is what removes the "mismatched / noob" look.

import { RefreshIcon, CloseIcon } from "./Icons.jsx";

// Shared panel tokens
export const PANEL = {
  background: "rgba(15,23,42,0.72)",
  border: "1px solid rgba(148,163,184,0.12)",
  radius: "14px",
  shadow: "0 18px 40px rgba(0,0,0,0.20)",
  cell: "rgba(0,0,0,0.22)",
  cellBorder: "1px solid rgba(148,163,184,0.08)",
};

// ── Icon action button (no emoji) ───────────────
export function IconButton({ icon, onClick, title, danger = false, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "26px",
        height: "26px",
        borderRadius: "8px",
        border: "1px solid rgba(148,163,184,0.18)",
        background: danger ? "rgba(248,113,113,0.10)" : "rgba(148,163,184,0.08)",
        color: danger ? "#f87171" : "#94a3b8",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition: "background 0.15s, border-color 0.15s",
        flexShrink: 0,
        padding: 0,
      }}
    >
      {icon}
    </button>
  );
}

// ── Refresh + Clear action cluster ──────────────
export function PanelActions({ autoRefresh, onToggleAuto, onRefresh, onClear, loading }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
      {autoRefresh !== undefined && (
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "10px",
            fontWeight: 600,
            color: autoRefresh ? "#34d399" : "#64748b",
            cursor: "pointer",
            userSelect: "none",
            whiteSpace: "nowrap",
          }}
        >
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={onToggleAuto}
            style={{ accentColor: "#34d399", width: "13px", height: "13px", cursor: "pointer" }}
          />
          Auto
        </label>
      )}
      <IconButton
        icon={<RefreshIcon size={13} color="currentColor" spinning={loading} />}
        onClick={onRefresh}
        title="Refresh"
        disabled={loading}
      />
      {onClear && (
        <IconButton icon={<CloseIcon size={12} color="currentColor" />} onClick={onClear} title="Clear" danger />
      )}
    </div>
  );
}

// ── Stat tile ───────────────────────────────────
export function StatTile({ label, value, sub, color = "#e2e8f0", accent }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: "8px",
        background: PANEL.cell,
        border: accent ? `1px solid ${accent}33` : PANEL.cellBorder,
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: "#64748b",
          fontSize: "9px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color,
          fontSize: "14px",
          fontWeight: 800,
          marginTop: "3px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ color: "#94a3b8", fontSize: "10px", marginTop: "2px" }}>{sub}</div>
      )}
    </div>
  );
}

// ── Stat tile grid ──────────────────────────────
export function StatGrid({ children, cols = 2 }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: "6px",
      }}
    >
      {children}
    </div>
  );
}

// ── Card shell ──────────────────────────────────
export default function MiningPanel({
  icon,
  accent,
  title,
  subtitle,
  actions,
  children,
  footer,
  bodyStyle,
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "11px",
        padding: "14px 16px",
        background: PANEL.background,
        border: PANEL.border,
        borderRadius: PANEL.radius,
        boxShadow: PANEL.shadow,
        height: "100%",
        minHeight: "100%",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              flexShrink: 0,
              background: `${accent}1f`,
              border: `1px solid ${accent}40`,
              color: accent,
            }}
          >
            {icon}
          </span>
          <div style={{ minWidth: 0 }}>
            <h4
              style={{
                margin: 0,
                color: "#f1f5f9",
                fontSize: "13.5px",
                fontWeight: 700,
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {title}
            </h4>
            {subtitle && (
              <div
                style={{
                  color: "#64748b",
                  fontSize: "10.5px",
                  marginTop: "2px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
        </div>
        {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          ...bodyStyle,
        }}
      >
        {children}
      </div>

      {footer}
    </div>
  );
}
