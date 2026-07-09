export const RigPoolSection = ({
  rig,
  info,
  expandedPools,
  onOpenPool,
}) => {
  if (!expandedPools.has(rig.id)) return null;
  if (!info && !rig.host) return null;

  return (
    <div
      className="rig-pool-summary"
      style={{
        background: "rgba(255,255,255,0.04)",
        padding: "10px",
        borderRadius: "12px",
        fontSize: "10px",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          marginBottom: "8px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            opacity: 0.55,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Current Pool
        </div>
        <button
          className="text-button"
          style={{ fontSize: "10px", color: "#60a5fa", padding: 0 }}
          onClick={() => onOpenPool?.(rig, info)}
        >
          Edit
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "6px",
        }}
      >
        <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          <span style={{ opacity: 0.65 }}>Host:</span>{" "}
          {rig.host || info?.stratumHost || "N/A"}
        </div>
        <div>
          <span style={{ opacity: 0.65 }}>Port:</span>{" "}
          {rig.port || info?.stratumPort || "N/A"}
        </div>
        <div
          style={{
            gridColumn: "span 2",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <span style={{ opacity: 0.65 }}>User:</span>{" "}
          {rig.user || info?.username || "N/A"}
        </div>
      </div>
    </div>
  );
};