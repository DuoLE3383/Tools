// components/pools/VerificationResults.jsx
import React from "react";
import { getAlgoDisplayName } from "../../core/poolUtils";

export function VerificationResults({
  verifyResults,
  completedResults,
  successResults,
  failResults,
  skippedResults,
  lastRunSummary,
  onInspect,
  onOpenErrorModal,
  poolCount,
}) {
  const successCount = successResults.length;
  const failCount = failResults.length;
  const skippedCount = skippedResults.length;

  const getAlgoCountsSummary = (results) => {
    const counts = results.reduce((acc, item) => {
      const algorithm = item.algorithm || item.result?.poolDetails?.miningAlgorithm || "Unknown";
      acc[algorithm] = (acc[algorithm] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([algo, count]) => `${getAlgoDisplayName(algo)}: ${count}`)
      .join(", ");
  };

  const verifiedSummary = getAlgoCountsSummary(completedResults);
  const successSummary = getAlgoCountsSummary(successResults);
  const failSummary = getAlgoCountsSummary(failResults);
  const skippedSummary = getAlgoCountsSummary(skippedResults);

  const lastRunVerified = lastRunSummary ? ` (Last: ${lastRunSummary.verified})` : "";
  const lastRunSuccess = lastRunSummary ? ` (Last: ${lastRunSummary.success})` : "";
  const lastRunFailed = lastRunSummary ? ` (Last: ${lastRunSummary.failed})` : "";
  const lastRunSkipped = lastRunSummary ? ` (Last: ${lastRunSummary.skipped})` : "";

  if (verifyResults.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "40px",
          opacity: 0.5,
        }}
      >
        No verification results yet. Start a manual "Verify All" or "Auto Run" to begin monitoring.
      </div>
    );
  }

  return (
    <div
      className="results-wrapper"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        gap: "15px",
      }}
    >
      {/* Summary */}
      <div
        className="verify-summary"
        style={{
          flexShrink: 0,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
          gap: "10px",
          paddingBottom: "10px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div>
          <span style={{ fontSize: "10px", opacity: 0.6 }}>Total:</span>{" "}
          <strong>{poolCount}</strong>
        </div>
        <div>
          <span style={{ fontSize: "10px", opacity: 0.6 }}>Verified:</span>{" "}
          <strong>{completedResults.length}</strong>
          <span style={{ fontSize: "10px", opacity: 0.6 }}>
            {" "}
            ({verifiedSummary}){lastRunVerified}
          </span>
        </div>
        <div>
          <span style={{ fontSize: "10px", color: "#34d399" }}>Success:</span>{" "}
          <strong>{successCount}</strong>
          <span style={{ fontSize: "10px", opacity: 0.6 }}>
            {" "}
            ({successSummary}){lastRunSuccess}
          </span>
        </div>
        <div>
          <span style={{ fontSize: "10px", color: "#f87171" }}>Error:</span>{" "}
          <strong
            style={{
              cursor: failCount > 0 ? "pointer" : "default",
              textDecoration: failCount > 0 ? "underline" : "none",
            }}
            onClick={() => failCount > 0 && onOpenErrorModal()}
          >
            {failCount}
          </strong>
          <span style={{ fontSize: "10px", opacity: 0.6 }}>
            {" "}
            ({failSummary}){lastRunFailed}
          </span>
        </div>
        <div>
          <span style={{ fontSize: "10px", color: "#f87171" }}>Skipped:</span>{" "}
          <strong>{skippedCount}</strong>
          <span style={{ fontSize: "10px", opacity: 0.6 }}>
            {" "}
            ({skippedSummary}){lastRunSkipped}
          </span>
        </div>
      </div>

      {/* Results List */}
      <div
        className="verify-list"
        style={{
          flex: 1,
          minHeight: "240px",
          maxHeight: "240px",
          overflowY: "auto",
          overflowX: "hidden",
          border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: "8px",
          background: "rgba(255,255,255,0.015)",
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255,255,255,0.15) transparent",
        }}
      >
        {verifyResults.map((item) => {
          const pending = item.result?.pending;
          const success = !pending && item.result?.ok;
          const algorithm = item.algorithm || item.result?.poolDetails?.miningAlgorithm || "Unknown";
          
          return (
            <div
              key={item.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "5px 5px",
                borderBottom: "2px solid rgba(102, 86, 104, 0.07)",
                fontSize: "10px",
                cursor: "pointer",
              }}
              onClick={() => onInspect(item.result)}
            >
              <div
                style={{
                  width: "80px",
                  textAlign: "center",
                  padding: "4px 0",
                  borderRadius: "4px",
                  fontWeight: 700,
                  fontSize: "10px",
                  flexShrink: 0,
                  background: pending
                    ? "rgba(59,130,246,.1)"
                    : success
                      ? "rgba(52,211,153,.1)"
                      : "rgba(248,113,113,.1)",
                  color: pending
                    ? "#3b82f6"
                    : success
                      ? "#34d399"
                      : "#f87171",
                  border: `1px solid ${
                    pending
                      ? "#3b82f644"
                      : success
                        ? "#34d39944"
                        : "#f8717144"
                  }`,
                }}
              >
                {pending ? "PENDING" : success ? "SUCCESS" : "ERROR"}
              </div>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontWeight: 600,
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  width: "60px",
                  flexShrink: 0,
                  opacity: 0.6,
                  fontFamily: "monospace",
                }}
              >
                {getAlgoDisplayName(algorithm)}
              </div>
              <div
                style={{
                  flex: 2,
                  minWidth: 0,
                  opacity: 0.8,
                  fontSize: "11px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {pending
                  ? "Waiting..."
                  : item.result?.data?.message || item.result?.data?.error || "No message"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}