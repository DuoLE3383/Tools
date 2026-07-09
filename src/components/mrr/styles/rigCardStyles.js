export const getEfficiencyAccent = (efficiency) => {
  if (!Number.isFinite(efficiency)) return "rgba(148, 163, 184, 0.18)";
  if (efficiency >= 98) return "rgba(197, 34, 238, 0.3)";
  if (efficiency >= 70) return "rgba(23, 185, 131, 0.3)";
  if (efficiency >= 50) return "rgba(255, 183, 0, 0.3)";
  if (efficiency >= 20) return "rgba(251, 36, 36, 0.3)";
  return "rgba(239, 68, 68, 0.30)";
};

export const getRoiColor = (value) => {
  if (value >= 0) return "#10b981";
  return "#ef4444";
};

export const getRigStyles = (efficiency) => {
  const accent = getEfficiencyAccent(efficiency);
  
  return {
    shell: {
      background: `radial-gradient(circle at top right, ${accent} 0%, transparent 88%)`,
      border: `1.5px solid ${accent}`,
      borderTop: `2px solid ${getRoiColor(efficiency)}`,
      borderRight: `3px solid ${getRoiColor(efficiency)}`,
      borderBottom: `2px solid ${getRoiColor(efficiency)}`,
      borderLeft: `1px solid ${getRoiColor(efficiency)}`,
      borderRadius: "16px",
      padding: "8px",
      position: "relative",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      boxShadow: "0 10px 22px rgba(0, 0, 0, 0.16)",
      overflow: "hidden",
    },
    section: {
      background: "rgba(255,255,255,0.035)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "8px",
      padding: "2px",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "1fr 0.85fr",
      gap: "6px",
    },
    accent
  };
};