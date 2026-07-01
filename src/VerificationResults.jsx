import React from "react";
import { poolHelpers as ph } from "./core/poolUtils";
import { ALGO_MAPPING } from "./core/mapping";
/**
 * Extracts a display-friendly message from a verification result object.
 * This function is designed to handle various response structures from the backend verification process.
 *
 * @param {object} result - The result object from a verification call.
 * @returns {string} A user-friendly status message.
 */
const getVerifyMessage = (result) => {
  const data = result?.data || result;
  if (!data) return "No response";
  if (data.error) return data.error;

  // ✅ Prioritize "Skipped" message to avoid incorrect "Verified" status
  if (typeof data.message === 'string' && data.message.includes("Skipped")) return data.message;

  // Prioritize success/fail check over generic messages
  if (poolHelpers.isVerifySuccess(result)) return "Verified";

  if (data.stopped) return data.message || "Stopped";
  if (data.message) return data.message;

  if (Array.isArray(data.logs) && data.logs.length > 0) {
    return data.logs[data.logs.length - 1]?.message || "Completed with logs";
  }
  // Final fallback based on success status
  return poolHelpers.isVerifySuccess(result) ? "Verified" : "Verification failed";
};
export default function VerificationResults({
  verifyResults,
  verifyFromFile,
  filePoolsCount,
  poolsCount,
  lastRunSummary,
  setInspectData,
  openPoolEditor,
}) {
  const getAlgoCountsSummary = (results) => {
    const counts = results.reduce((acc, item) => {
      const algorithm = ph.getVerifyAlgo(item.result);
      acc[algorithm] = (acc[algorithm] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([algo, count]) => `${ALGO_MAPPING(algo)}: ${count}`)
      .join(", ");
  };

  if (verifyResults.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "20px", opacity: 0.5 }}>
        No verification results yet. Start a manual "Verify All" or "Auto Run"
        to begin monitoring.
      </div>
    );
  }

  const completedResults = verifyResults.filter(
    (item) => !item.result?.pending,
  );
  const skippedResults = completedResults.filter((item) =>
    item.result?.data?.message?.includes("Skipped"),
  );
  const successResults = completedResults.filter(
    (item) =>
      ph.isVerifySuccess(item.result) &&
      !item.result?.data?.message?.includes("Skipped"),
  );
  const failResults = completedResults.filter(
    (item) =>
      !ph.isVerifySuccess(item.result) &&
      !item.result?.data?.message?.includes("Skipped"),
  );

  const verifiedSummary = getAlgoCountsSummary(completedResults);
  const successSummary = getAlgoCountsSummary(successResults);
  const failSummary = getAlgoCountsSummary(failResults);
  const skippedSummary = getAlgoCountsSummary(skippedResults);

  const lastRunVerified = lastRunSummary
    ? ` (Last: ${lastRunSummary.verified})`
    : "";
  const lastRunSuccess = lastRunSummary
    ? ` (Last: ${lastRunSummary.success})`
    : "";
  const lastRunFailed = lastRunSummary
    ? ` (Last: ${lastRunSummary.failed})`
    : "";
  const lastRunSkipped = lastRunSummary
    ? ` (Last: ${lastRunSummary.skipped})`
    : "";

  return (
    <div className="horizon-algorithm-panel" style={{ marginTop: 0 }}>
      {/* Header */}
      <div className="horizon-panel-header">
        <div className="horizon-header-left">
          <div className="horizon-header-icon">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 7L12 3L20 7L12 11L4 7Z" />
              <path d="M4 12L12 16L20 12" />
              <path d="M4 17L12 21L20 17" />
            </svg>
          </div>
          <div>
            <h3 className="horizon-panel-title">Algorithm Summary</h3>
            <span className="horizon-panel-subtitle">
              {algorithmGroups.length} types ·{" "}
              {algorithmGroups.reduce((sum, [_, count]) => sum + count, 0)}{" "}
              pools
            </span>
          </div>
        </div>
        <div className="horizon-header-badge">
          <span className="horizon-badge-dot"></span>
          Live
        </div>
      </div>

      {/* Content */}
      {algorithmGroups.length > 0 ? (
        <div className="horizon-algorithm-list">
          {algorithmGroups.map(([algorithm, count], index) => (
            <div
              className="horizon-algorithm-item"
              key={algorithm}
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <div className="horizon-item-left">
                <div className="horizon-algorithm-icon">
                  <span className="horizon-icon-emoji">
                    {getAlgorithmEmoji(algorithm)}
                  </span>
                </div>
                <div className="horizon-algorithm-info">
                  <span className="horizon-algorithm-name">
                    {getAlgoDisplayName(algorithm)}
                  </span>
                  <div className="horizon-algorithm-meta">
                    <span className="horizon-pool-count">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect
                          x="2"
                          y="7"
                          width="20"
                          height="14"
                          rx="2"
                          ry="2"
                        />
                        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                      </svg>
                      {count} pool{count !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="horizon-verify-btn"
                onClick={() => onVerifyAlgorithm(algorithm)}
                disabled={disabled}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                Verify
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="horizon-empty-state">
          <div className="horizon-empty-icon">📊</div>
          <p className="horizon-empty-text">No pools available</p>
          <span className="horizon-empty-subtext">
            Add a pool to get started
          </span>
        </div>
      )}
    </div>
  );
}
