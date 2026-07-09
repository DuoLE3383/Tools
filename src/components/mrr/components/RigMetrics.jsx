import React from 'react';
import { CountdownTimer } from "../MiningRigRental.jsx";

const MetricDisplay = ({ label, value, unit, color, isBehind }) => (
  <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "9px", padding: "6px" }}>
    <div style={{ opacity: 0.6, textTransform: "uppercase", fontSize: "8px" }}>{label}</div>
    <div style={{ color: color || "#f8fafc", fontWeight: 800, marginTop: "3px" }}>
      {value}
      {unit && <span style={{ opacity: 0.5, fontSize: "8px" }}> {unit}</span>}
      {isBehind && <span style={{ color: '#f87171', fontSize: '8px', marginLeft: '4px' }} title="Below advertised rate to complete on time"> (Behind)</span>}
    </div>
  </div>
);

export const RigMetrics = ({
  efficiency,
  progress,
  currentHashrate,
  averageHashrate,
  advertisedHashrate,
  targetHashrate,
  isBehind,
  hashUnit,
  endTime,
}) => {
  const getEfficiencyColor = (eff) => {
    if (eff >= 100) return "#10b981"; // green-500
    if (eff >= 95) return "#34d399"; // green-400
    if (eff >= 70) return "#60a5fa"; // blue-400
    if (eff < 50) return "#f87171"; // red-400
    return "#f59e0b"; // amber-500
  };

  return (
    <section style={{
      background: "rgba(255,255,255,0.035)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "8px",
      padding: "8px",
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }}>
      {/* Efficiency & Progress */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "9px", padding: "6px" }}>
          <div style={{ opacity: 0.6, textTransform: "uppercase", fontSize: "8px" }}>Efficiency</div>
          <div style={{ color: getEfficiencyColor(efficiency), fontWeight: 900, fontSize: '16px', marginTop: "3px" }}>
            {efficiency.toFixed(2)}%
          </div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "9px", padding: "6px" }}>
          <div style={{ opacity: 0.6, textTransform: "uppercase", fontSize: "8px" }}>Time Progress</div>
          <div style={{ color: '#a78bfa', fontWeight: 900, fontSize: '16px', marginTop: "3px" }}>
            {progress.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Hashrates */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px", fontSize: "9px" }}>
        <MetricDisplay label="Current" value={currentHashrate} unit={hashUnit} />
        <MetricDisplay label="Average" value={averageHashrate} unit={hashUnit} />
        <MetricDisplay label="Advertised" value={advertisedHashrate} unit={hashUnit} color="#34d399" />
        <MetricDisplay label="Target" value={targetHashrate > 0 ? targetHashrate.toFixed(2) : '0.00'} unit={hashUnit} color={isBehind ? '#f87171' : '#fbbf24'} isBehind={isBehind} />
      </div>

      {/* Time Remaining */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '10px',
        color: '#94a3b8',
        padding: '3px 0',
        marginTop: '2px'
      }}>
        <span>⏳ Remaining:</span>
        <CountdownTimer endTime={endTime} />
      </div>
    </section>
  );
};