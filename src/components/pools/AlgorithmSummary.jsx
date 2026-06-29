// components/pools/AlgorithmSummary.jsx
import React from "react";
import { getAlgoDisplayName } from "../../core/poolUtils";

export function AlgorithmSummary({
  algorithmGroups,
  onVerifyAlgorithm,
  disabled,
}) {
  return (
    <div className="pool-algorithm-summary" style={{ marginTop: 0 }}>
      <div className="response-header compact">
        <h3>Algorithm Summary</h3>
        <span>
          {algorithmGroups.length} types / {algorithmGroups.reduce((sum, [_, count]) => sum + count, 0)} pools
        </span>
      </div>
      {algorithmGroups.length > 0 ? (
        <div
          className="algorithm-grid"
          style={{
            maxHeight: "650px",
            overflowY: "auto",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(255,255,255,0.1) transparent",
          }}
        >
          {algorithmGroups.map(([algorithm, count]) => (
            <div className="algorithm-row" key={algorithm}>
              <span>{getAlgoDisplayName(algorithm)}</span>
              <strong style={{ marginLeft: 3 }}>{count}</strong>
              <button
                type="button"
                className="btn-pro secondary"
                onClick={() => onVerifyAlgorithm(algorithm)}
                disabled={disabled}
              >
                Verify
              </button>
            </div>
          ))}
        </div>
      ) : (
        <pre className="response-body compact">No pools loaded.</pre>
      )}
    </div>
  );
}