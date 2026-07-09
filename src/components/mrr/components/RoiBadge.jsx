import React from 'react';
import { getRoiColor } from "../../../core/mrrUtils.js";

const RoiBadge = ({ roiPercent, roiLabel }) => {
  return (
    <div
      style={{
        display: "flex",
        gap: "4px",
        minWidth: "142px",
        textAlign: "right",
        marginLeft: "auto",
        flexWrap: "wrap",
        justifyContent: "flex-end",
      }}
    >
      <div
        style={{
          padding: "6px 8px",
          borderRadius: "10px",
          background: roiPercent === null
            ? "rgba(255,255,255,0.04)"
            : roiPercent >= 0
              ? "rgba(16,185,129,0.10)"
              : "rgba(239,68,68,0.10)",
          border: `1px solid ${
            roiPercent === null
              ? "rgba(255,255,255,0.08)"
              : roiPercent >= 0
                ? "rgba(16,185,129,0.22)"
                : "rgba(239,68,68,0.22)"
          }`,
        }}
      >
        <div
          style={{
            fontSize: "8px",
            opacity: 0.7,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          ROI
        </div>
        <div
          style={{
            fontSize: "18px",
            lineHeight: 1,
            fontWeight: 900,
            color: getRoiColor(roiPercent ?? 0),
          }}
        >
          {roiLabel}
        </div>
      </div>
    </div>
  );
};

export default React.memo(RoiBadge);