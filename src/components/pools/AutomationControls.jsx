// components/pools/AutomationControls.jsx - RESPONSIVE REDESIGN

import React from "react";

export function AutomationControls({
  running,
  playing,
  progress,
  runCount,
  currentRunElapsed,
  lastRunTime,
  nextRunCountdown,
  rateLimitStatus,
  verificationDelay,
  setVerificationDelay,
  automationInterval,
  setAutomationInterval,
  verifyFromFile,
  setVerifyFromFile,
  useExtractedPools,
  setUseExtractedPools,
  filePoolsLength,
  extractedPoolsLength,
  completedResultsLength,
  onStartRun,
  onStopAutomation,
  onLoadExtracted,
  onVerifyAll,
  onExportResults,
  onImportClick,
  onOpenInventory,
  onOpenConnectionManager,
  disabled,
}) {
  return (
    <div className="pool-automation-main">
      {/* Progress Bar */}
      {progress.total > 0 && (
        <div className="verify-progress-wrapper" style={{ marginBottom: "15px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "10px",
              marginBottom: "5px",
              opacity: 0.8,
              fontWeight: "bold",
            }}
          >
            <span>VERIFYING POOLS...</span>
            <span>
              {progress.current} / {progress.total} (
              {Math.round((progress.current / progress.total) * 100)}%)
            </span>
          </div>
          <div
            className="verify-progress-bar-container"
            style={{
              width: "100%",
              height: "12px",
              background: "rgba(255,255,255,0.05)",
              borderRadius: "10px",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              className="verify-progress-bar-fill"
              style={{
                width: `${(progress.current / progress.total) * 100}%`,
                height: "100%",
                background: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
                transition: "width 0.3s ease",
                borderRadius: "10px",
              }}
            />
          </div>
        </div>
      )}

      {/* Rate Limit Status */}
      {rateLimitStatus && (
        <div
          style={{
            color: "#fbbf24",
            fontSize: "12px",
            fontWeight: "bold",
            marginBottom: "10px",
            padding: "8px 12px",
            background: "rgba(251,191,36,0.1)",
            borderRadius: "6px",
            border: "1px solid rgba(251,191,36,0.2)",
          }}
        >
          ⚠️ {rateLimitStatus}
        </div>
      )}

      {/* Controls Grid - Responsive */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "16px",
          background: "rgba(255,255,255,0.03)",
          padding: "16px",
          borderRadius: "12px",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {/* Left Column - Settings & Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px",
            }}
          >
            <div className="field">
              <label className="label" style={{ fontSize: "10px", opacity: 0.7 }}>
                DELAY (ms)
              </label>
              <input
                type="number"
                className="input-pro"
                value={verificationDelay}
                onChange={(e) => setVerificationDelay(Number(e.target.value))}
                style={{ width: "100%", padding: "6px 8px" }}
              />
            </div>
            <div className="field">
              <label className="label" style={{ fontSize: "10px", opacity: 0.7 }}>
                INTERVAL (s)
              </label>
              <input
                type="number"
                className="input-pro"
                value={automationInterval}
                onChange={(e) => setAutomationInterval(Number(e.target.value))}
                style={{ width: "100%", padding: "6px 8px" }}
              />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: "8px",
              fontSize: "12px",
              fontWeight: "bold",
              alignItems: "center",
              minHeight: "40px",
              flexWrap: "wrap",
            }}
          >
            <button
              className="btn-pro primary"
              style={{ flex: "1 1 120px" }}
              onClick={onStartRun}
              disabled={playing || running || disabled}
            >
              {running ? "Running..." : "▶ Start Auto Run"}
            </button>
            {(playing || running) && (
              <button
                className="btn-pro"
                onClick={onStopAutomation}
                style={{ flex: "1 1 80px", background: "#ef4444", color: "white" }}
              >
                ⏹ Stop
              </button>
            )}
          </div>
        </div>

        {/* Middle Column - Sources */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <input
              type="checkbox"
              id="mainVerifySourceToggle"
              checked={verifyFromFile}
              onChange={(e) => setVerifyFromFile(e.target.checked)}
            />
            <label
              htmlFor="mainVerifySourceToggle"
              style={{
                fontSize: "12px",
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              📂 Verify from File ({filePoolsLength})
            </label>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
              alignItems: "center",
            }}
          >
            <button
              className="btn-pro secondary"
              onClick={onLoadExtracted}
              disabled={disabled || playing || running}
              style={{ fontSize: "11px", padding: "6px 10px" }}
            >
              📥 Load Extracted
            </button>
            <div
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              <input
                type="checkbox"
                id="useExtractedPoolsToggle"
                checked={useExtractedPools}
                onChange={(e) => setUseExtractedPools(e.target.checked)}
              />
              <label
                htmlFor="useExtractedPoolsToggle"
                style={{
                  fontSize: "12px",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                Use Extracted ({extractedPoolsLength})
              </label>
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))",
              gap: "6px",
            }}
          >
            <button className="btn-pro secondary" onClick={onImportClick} style={{ fontSize: "10px", padding: "4px 8px" }}>
              📊 Import XLSX
            </button>
            <button className="btn-pro secondary" onClick={onOpenInventory} style={{ fontSize: "10px", padding: "4px 8px" }}>
              📋 Inventory
            </button>
            <button className="btn-pro secondary" onClick={onOpenConnectionManager} style={{ fontSize: "10px", padding: "4px 8px" }}>
              🔗 Connect
            </button>
            <button
              className="btn-pro secondary"
              onClick={onExportResults}
              disabled={completedResultsLength === 0}
              style={{ fontSize: "10px", padding: "4px 8px" }}
            >
              📤 Export ({completedResultsLength})
            </button>
          </div>
          <button
            className="btn-pro secondary"
            onClick={onVerifyAll}
            disabled={playing || running || disabled}
            style={{ padding: "6px 12px", fontSize: "12px" }}
          >
            ✅ Verify All
          </button>
        </div>

        {/* Right Column - Status */}
        <div
          style={{
            fontSize: "12px",
            background: "rgba(0,0,0,0.25)",
            padding: "14px",
            borderRadius: "8px",
            border: "1px solid rgba(59, 130, 246, 0.2)",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            minWidth: "180px",
          }}
        >
          <div
            style={{
              color: running ? "#60a5fa" : "#94a3b8",
              fontWeight: "bold",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>🔄 Cycle Status</span>
            <span style={{ fontSize: "13px" }}>
              {running ? `Active #${runCount}` : "Idle"}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              opacity: 0.8,
              fontSize: "11px",
            }}
          >
            <span>⏱️ Total Time:</span>
            <span>
              {Math.floor(currentRunElapsed / 60)}m {currentRunElapsed % 60}s
            </span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              opacity: 0.8,
              fontSize: "11px",
              color: "#34d399",
            }}
          >
            <span>✅ Last Cycle:</span>
            <span>{lastRunTime ? `${lastRunTime}` : "N/A"}</span>
          </div>
          {nextRunCountdown !== null && running && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                color: "#fbbf24",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                paddingTop: "6px",
                marginTop: "4px",
                fontSize: "11px",
              }}
            >
              <span>⏳ Next cycle in:</span>
              <span style={{ fontWeight: "bold" }}>{nextRunCountdown}s</span>
            </div>
          )}
          {!running && !playing && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                opacity: 0.5,
                fontSize: "10px",
                color: "#64748b",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                paddingTop: "6px",
                marginTop: "4px",
              }}
            >
              <span>📊 Status:</span>
              <span>Ready</span>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Summary - visible only on small screens */}
      <div
        style={{
          display: "none",
          "@media (maxWidth: 768px)": {
            display: "flex",
          },
        }}
      >
        {/* Mobile-specific summary would go here if needed */}
      </div>
    </div>
  );
}