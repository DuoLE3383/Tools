import {
  getClientBadgeStyle,
  getStatusClass,
  getRoiColor,
} from "../../core/mrrUtils.js";

export const RigHeader = ({
  idLabel,
  displayId,
  rig,
  isMine,
  statusStr,
  displayAlgo,
  asicBoostBadge,
  paidLabel,
  roiLabel,
  roiPercent,
}) => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "8px",
        flexWrap: "wrap",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          minWidth: 0,
          flex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              background: isMine
                ? "rgba(37, 99, 235, 0.18)"
                : "rgba(255,255,255,0.08)",
              color: "white",
              fontSize: "8px",
              padding: "2px 6px",
              borderRadius: "999px",
              fontWeight: "700",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {idLabel}: #{displayId}
          </span>
          {rig.mrrClient && (
            <span
              style={{
                ...getClientBadgeStyle(rig.mrrClient),
                fontSize: "8px",
                padding: "2px 6px",
                borderRadius: "999px",
                fontWeight: "700",
              }}
            >
              {rig.mrrClient.toUpperCase()}
            </span>
          )}
          {/* <span
            style={{
              fontSize: "8px",
              padding: "2px 6px",
              borderRadius: "999px",
              fontWeight: "700",
              ...getStatusClass(rig.status),
            }}
          >
            {statusStr.toUpperCase()}
          </span> */}
        </div>
        <strong
          title={rig.name}
          style={{
            fontSize: "13px",
            lineHeight: 1.15,
            color: "#f8fafc",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {rig.name && rig.name.length > 12
            ? `${rig.name.substring(0, 12)}...`
            : rig.name}
        </strong>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            color: "#94a3b8",
            fontSize: "9px",
            gap: "4px",
          }}
        >
          <span
            style={{
              fontSize: "14px",
              fontWeight: 900,
              color: "#38bdf8",
              textShadow: "0 0 18px rgba(56, 189, 248, 0.22)",
            }}
          >
            {displayAlgo}
            {/* {asicBoostBadge} */}
          </span>

          {/* <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
            {paidLabel && (
              <span
                style={{ color: "#fbbf24", fontWeight: 900, fontSize: "11px" }}
              >
                Paid {paidLabel}
              </span>
            )}
          </div> */}
        </div>
      </div>

      {/* ROI Badge - Top Right */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          minWidth: "90px",
          flexShrink: 0,
          alignSelf: "flex-start",
          marginTop: "3px",
        }}
      >
        <div
          style={{
            padding: "6px 10px",
            borderRadius: "10px",
            background:
              roiPercent === null
                ? "rgba(255,255,255,0.04)"
                : roiPercent >= 0
                  ? "rgba(16,185,129,0.10)"
                  : "rgba(239,68,68,0.10)",
            border: `1px solid ${roiPercent === null ? "rgba(255,255,255,0.08)" : roiPercent >= 0 ? "rgba(16,185,129,0.22)" : "rgba(239,68,68,0.22)"}`,
          }}
        >
          <div
            style={{
              fontSize: "8px",
              opacity: 0.6,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              textAlign: "center",
            }}
          >
            PNL
          </div>
          <div
            style={{
              fontSize: "18px",
              lineHeight: 1.2,
              fontWeight: 900,
              color: getRoiColor(roiPercent ?? 0),
              textAlign: "center",
            }}
          >
            {roiLabel}
          </div>
        </div>
      </div>
    </div>
  );
};