import React from 'react';
import { getClientBadgeStyle, getStatusClass } from "../../../core/mrrUtils.js";

const RigHeader = ({ 
  rig, 
  isMine, 
  isRented, 
  rentalId, 
  displayId, 
  displayAlgo, 
  paidLabel,
  statusStr 
}) => {
  const idLabel = isRented && rentalId ? "Rental" : "Rig";
  
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "8px",
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          minWidth: 0,
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
          <span
            style={{
              fontSize: "8px",
              padding: "2px 6px",
              borderRadius: "999px",
              fontWeight: "700",
              ...getStatusClass(rig.status),
            }}
          >
            {statusStr.toUpperCase()}
          </span>
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
          {rig.name.length > 20 ? rig.name.substring(0, 20) + "..." : rig.name}
        </strong>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            flexWrap: "wrap",
            color: "#94a3b8",
            fontSize: "9px",
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
          </span>
          |
          {paidLabel && (
            <span
              style={{ color: "#fbbf24", fontWeight: 900, fontSize: "11px" }}
            >
              Paid {paidLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(RigHeader);