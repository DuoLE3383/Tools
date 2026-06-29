// components/pools/AutomationControls.jsx
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
                background: "#073681",
                transition: "width 0.3s ease",
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
          }}
        >
          ⚠️ {rateLimitStatus}
        </div>
      )}

      {/* Controls Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "15px",
          background: "rgba(255,255,255,0.03)",
          padding: "15px",
          borderRadius: "8px",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {/* Left Column - Settings */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px",
            }}
          >
            <div className="field">
              <label className="label" style={{ fontSize: "10px" }}>
                DELAY (ms)
              </label>
              <input
                type="number"
                className="input-pro"
                value={verificationDelay}
                onChange={(e) => setVerificationDelay(Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label className="label" style={{ fontSize: "10px" }}>
                INTERVAL (s)
              </label>
              <input
                type="number"
                className="input-pro"
                value={automationInterval}
                onChange={(e) => setAutomationInterval(Number(e.target.value))}
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
            }}
          >
            <button
              className="btn-pro primary"
              style={{ flex: 2 }}
              onClick={onStartRun}
              disabled={playing || running || disabled}
            >
              {running ? "Running..." : "Start Auto Run"}
            </button>
            {(playing || running) && (
              <button
                className="btn-pro"
                onClick={onStopAutomation}
                style={{ flex: 1, background: "#ef4444" }}
              >
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Middle Column - Sources */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              height: "32px",
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
              VERIFY FROM FILE ({filePoolsLength})
            </label>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}
          >
            <button
              className="btn-pro secondary"
              onClick={onLoadExtracted}
              disabled={disabled || playing || running}
            >
              Load Extracted
            </button>
            <div
              style={{ display: "flex", alignItems: "center", gap: "10px" }}
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
                USE EXTRACTED ({extractedPoolsLength})
              </label>
            </div>
          </div>
          <div
            style={{
              fontSize: "8px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(60px, 1fr))",
              gap: "6px",
            }}
          >
            <button className="btn-pro secondary" onClick={onImportClick}>
              Import XLSX
            </button>
            <button
              className="btn-pro secondary"
              onClick={onOpenInventory}
            >
              Inventory
            </button>
            <button
              className="btn-pro secondary"
              onClick={onOpenConnectionManager}
            >
              Connect Manager
            </button>
            <button
              className="btn-pro secondary"
              onClick={onExportResults}
              disabled={completedResultsLength === 0}
            >
              Export Results ({completedResultsLength})
            </button>
          </div>
          <button
            className="btn-pro secondary"
            onClick={onVerifyAll}
            disabled={playing || running || disabled}
          >
            Verify All
          </button>
        </div>

        {/* Right Column - Status */}
        <div
          style={{
            fontSize: "12px",
            background: "rgba(0,0,0,0.2)",
            padding: "12px",
            borderRadius: "6px",
            border: "1px solid rgba(59, 130, 246, 0.3)",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          <div
            style={{
              color: running ? "#3b82f6" : "#94a3b8",
              fontWeight: "bold",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Cycle Status:</span>
            <span>{running ? `Active (Cycle #${runCount})` : "Idle"}</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              opacity: 0.8,
            }}
          >
            <span>Total Time Run:</span>
            <span>
              {Math.floor(currentRunElapsed / 60)}m {currentRunElapsed % 60}s
            </span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              opacity: 0.8,
              color: "#10b981",
            }}
          >
            <span>Last Cycle End:</span>
            <span>{lastRunTime ? `${lastRunTime} (Local)` : "N/A"}</span>
          </div>
          {nextRunCountdown !== null && running && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                color: "#fbbf24",
                borderTop: "1px solid rgba(255,255,255,0.05)",
                paddingTop: "4px",
                marginTop: "2px",
              }}
            >
              <span>Next cycle in:</span>
              <span>{nextRunCountdown}s</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}