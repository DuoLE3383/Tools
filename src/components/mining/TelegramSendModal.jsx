// mining/TelegramSendModal.jsx - FIXED VERSION

import React, { useState, useCallback, useEffect, useRef } from "react";
import Modal from "../Modal";
import { useTelegramMine } from "../mrr/TelegramMineContext";

export default function TelegramSendModal({
  isOpen,
  onClose,
  stats = null,
  coin = "QRL",
  onRefresh,
  onCall = null,
  loading = false,
}) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendStatus, setSendStatus] = useState("");
  const [isHeartbeatRunning, setIsHeartbeatRunning] = useState(false);
  const [lastHeartbeatTime, setLastHeartbeatTime] = useState(null);
  const [heartbeatCount, setHeartbeatCount] = useState(0);
  const [isForceRunning, setIsForceRunning] = useState(false);
  const heartbeatIntervalRef = useRef(null);
  const { notify } = useTelegramMine();

  // ✅ Build heartbeat message from stats
  const buildHeartbeatMessage = useCallback(
    (statsData, coinSymbol, isForce = false) => {
      if (!statsData) return "⛏️ Mining Heartbeat - No stats available";

      const {
        liveStats = {},
        paymentStats = {},
        shareStats = { total: {} },
        blockStats = {},
        miningDetails = {},
        workerStats = {},
      } = statsData;

      const totalShares = shareStats.total || {};
      const validShares = miningDetails.validShares ?? totalShares.valid ?? 0;
      const staleShares = miningDetails.staleShares ?? totalShares.stale ?? 0;
      const invalidShares =
        miningDetails.invalidShares ?? totalShares.invalid ?? 0;
      const efficiency =
        miningDetails.efficiency ??
        (totalShares.efficiency ? totalShares.efficiency + "%" : "0.00%");
      const blocksFound =
        miningDetails.blocksFound ?? blockStats.totalBlocks ?? 0;
      const roundContribution =
        miningDetails.roundContribution ??
        blockStats.roundContribution ??
        "0.00%";

      const hashrate15m = liveStats.avg15m || liveStats.hashrate15m || "0 H/s";
      const hashrate1h = liveStats.avg1h || liveStats.hashrate1h || "0 H/s";

      const pendingBalance = paymentStats.pendingBalance || "0.0000 QRL";
      const totalPaid = paymentStats.totalPaid || "0.0000 QRL";
      const paid24h = paymentStats.paid24h || "0.0000 QRL";

      const now = new Date();
      const timestamp = now.toLocaleString();

      const forceLabel = isForce ? "🚀 FORCE HEARTBEAT" : "15m";
      const emoji = isForce ? "🚀" : "⛏️";

      return `
${emoji} <b>Mining Heartbeat - ${forceLabel}</b>
🕐 <b>Time:</b> ${timestamp}
📊 <b>Heartbeat #${heartbeatCount + 1}</b>

📊 <b>Live Stats</b>
• Current Hashrate: <b>${liveStats.currentHashrate || "0 H/s"}</b>
• Avg 15m: <b>${hashrate15m}</b>
• Avg 1h: <b>${hashrate1h}</b>
• Workers: <b>${liveStats.workersOnline || 0}/${liveStats.workersTotal || 0}</b>
• Last Share: <b>${liveStats.lastShare || "N/A"}</b>

💰 <b>Payments</b>
• Pending: <b>${pendingBalance}</b>
• Total Paid: <b>${totalPaid}</b>
• 24h Paid: <b>${paid24h}</b>

⛏️ <b>Mining Details</b>
• Valid Shares: <b>${validShares.toLocaleString()}</b>
• Stale Shares: <b>${staleShares.toLocaleString()}</b>
• Invalid Shares: <b>${invalidShares.toLocaleString()}</b>
• Efficiency: <b>${efficiency}</b>
• Blocks Found: <b>${blocksFound}</b>
• Round Contribution: <b>${roundContribution}</b>

👷 <b>Workers</b>
• Total Workers: <b>${workerStats.total || 0}</b>
• Pool Workers: <b>${workerStats.pool || 0}</b>
• Solo Workers: <b>${workerStats.solo || 0}</b>
• Total Hashrate: <b>${workerStats.totalHashrate || "0 H/s"}</b>

🔗 <b>Coin:</b> ${coinSymbol}
    `.trim();
    },
    [heartbeatCount],
  );

  // ✅ Send heartbeat with monitor run
  const sendHeartbeat = useCallback(
    async (isForce = false) => {
      if (!stats) {
        setSendStatus("⚠️ No stats available to send");
        return;
      }

      setIsSending(true);
      setSendStatus(
        isForce ? "🚀 Sending force heartbeat..." : "🔄 Sending heartbeat...",
      );

      try {
        // Send initial notification
        const messageText = buildHeartbeatMessage(stats, coin, isForce);
        const result = await notify(messageText);

        if (!result?.ok) {
          throw new Error(
            result?.error || "Failed to send heartbeat notification.",
          );
        }

        // ✅ Trigger monitor run if onCall is provided
        if (onCall) {
          try {
            const monitorResult = await onCall("/api/v2/mrr/monitor/run", {
              method: "POST",
              body: { client: "ALL" },
              silent: true,
            });

            const summary = monitorResult?.summary?.totals || {};
            const monitorMessage = `
📊 <b>Monitor Run Complete</b>
• Rented: <b>${summary.rented || 0}</b>
• Ghosts: <b>${summary.ghost || 0}</b>
• Total: <b>${summary.rigs || 0}</b>
            `.trim();

            await notify(monitorMessage);
          } catch (monitorErr) {
            const errorMessage = monitorErr?.message || 'Unknown monitor error';
            console.error("Monitor run failed:", monitorErr);
            await notify(`⚠️ Monitor run failed: ${errorMessage}`);
          }
        }

        setHeartbeatCount((prev) => prev + 1);
        setLastHeartbeatTime(new Date());
        setSendStatus(
          isForce
            ? "✅ Force heartbeat sent successfully!"
            : "✅ Heartbeat sent successfully!",
        );
        setTimeout(() => setSendStatus(""), 3000);
      } catch (err) {
        setSendStatus(`❌ Error: ${err.message}`);
        console.error("Heartbeat error:", err);
      } finally {
        setIsSending(false);
        setIsForceRunning(false);
      }
    },
    [stats, coin, notify, buildHeartbeatMessage, onCall],
  );

  // ✅ Force heartbeat - manual trigger
  const handleForceHeartbeat = useCallback(async () => {
    if (isForceRunning || isSending) return;

    setIsForceRunning(true);
    setSendStatus("🚀 Force heartbeat triggered...");

    try {
      // Send initial notice
      await notify("🚀 Manual force heartbeat triggered for rental monitor...");

      // Run the heartbeat
      await sendHeartbeat(true);
    } catch (err) {
      await notify(`❌ Force heartbeat failed: ${err.message}`);
      setSendStatus(`❌ Error: ${err.message}`);
      setIsForceRunning(false);
    }
  }, [isForceRunning, isSending, notify, sendHeartbeat]);

  // ✅ Start/stop heartbeat interval
  const toggleHeartbeat = useCallback(() => {
    if (isHeartbeatRunning) {
      // Stop heartbeat
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      setIsHeartbeatRunning(false);
      setSendStatus("⏹️ Heartbeat stopped");
      setTimeout(() => setSendStatus(""), 2000);
    } else {
      // Start heartbeat
      if (!stats) {
        setSendStatus("⚠️ Please load stats first");
        return;
      }

      // Send immediately
      sendHeartbeat(false);

      // Then every 15 minutes
      const interval = setInterval(
        () => {
          sendHeartbeat(false);
        },
        15 * 60 * 1000,
      );

      heartbeatIntervalRef.current = interval;
      setIsHeartbeatRunning(true);
      setSendStatus("🔄 Heartbeat started (every 15m)");
      setTimeout(() => setSendStatus(""), 3000);
    }
  }, [isHeartbeatRunning, stats, sendHeartbeat]);

  // ✅ Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, []);

  // ✅ Reset heartbeat count when stats change
  useEffect(() => {
    setHeartbeatCount(0);
  }, [stats]);

  // ✅ Handle custom message send
  const handleSend = useCallback(async () => {
    if (!message.trim() || isSending) return;

    setIsSending(true);
    setSendStatus("Sending...");

    try {
      const result = await notify(message);
      if (result?.ok) {
        setSendStatus("✅ Message sent successfully!");
        setMessage("");
        setTimeout(() => {
          setSendStatus("");
          onClose();
        }, 1500);
      } else {
        throw new Error(result?.error || "Failed to send message.");
      }
    } catch (err) {
      const errorMessage = err?.message || 'An unknown error occurred.';
      setSendStatus(`❌ Error: ${errorMessage}`);
    } finally {
      setIsSending(false);
    }
  }, [message, isSending, notify, onClose]);

  // ✅ Format time since last heartbeat
  const getTimeSinceLastHeartbeat = () => {
    if (!lastHeartbeatTime) return "Never";
    const diff = Date.now() - lastHeartbeatTime.getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    if (minutes === 0) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ${seconds}s ago`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="📨 Telegram Mining Notifications"
      maxWidth="550px"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          padding: "8px",
        }}
      >
        {/* Heartbeat Controls */}
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(52,211,153,0.05)",
            border: "1px solid rgba(52,211,153,0.15)",
            borderRadius: "8px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "4px",
            }}
          >
            <span
              style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0" }}
            >
              💓 15-Minute Heartbeat
            </span>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span
                style={{
                  fontSize: "10px",
                  color: isHeartbeatRunning ? "#34d399" : "#94a3b8",
                  fontWeight: isHeartbeatRunning ? 600 : 400,
                }}
              >
                {isHeartbeatRunning ? "● Running" : "○ Stopped"}
              </span>
              <button
                className={`btn-${isHeartbeatRunning ? "danger" : "primary"}`}
                onClick={toggleHeartbeat}
                disabled={isSending || loading}
                style={{
                  padding: "4px 14px",
                  borderRadius: "12px",
                  fontSize: "11px",
                  border: "none",
                  cursor: isSending || loading ? "default" : "pointer",
                  background: isHeartbeatRunning
                    ? "rgba(248,113,113,0.2)"
                    : "rgba(52,211,153,0.2)",
                  color: isHeartbeatRunning ? "#f87171" : "#34d399",
                  opacity: isSending || loading ? 0.5 : 1,
                }}
              >
                {isHeartbeatRunning ? "⏹ Stop" : "▶ Start"}
              </button>
            </div>
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8" }}>
            {isHeartbeatRunning
              ? `📤 Sending mining stats + monitor run every 15 minutes (${heartbeatCount} sent)`
              : "📊 Click Start to send mining stats every 15 minutes"}
          </div>
          {isHeartbeatRunning && (
            <div
              style={{
                fontSize: "10px",
                color: "#64748b",
                marginTop: "4px",
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <span>🕐 Last: {getTimeSinceLastHeartbeat()}</span>
              <span>📊 #{heartbeatCount}</span>
              <span>⛏️ {stats?.liveStats?.currentHashrate || "0 H/s"}</span>
              <span>💰 {stats?.paymentStats?.pendingBalance || "0"}</span>
            </div>
          )}
        </div>

        {/* Force Heartbeat Button */}
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(251,191,36,0.05)",
            border: "1px solid rgba(251,191,36,0.15)",
            borderRadius: "8px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <span
              style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0" }}
            >
              🚀 Force Heartbeat
            </span>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>
              Manually trigger heartbeat + monitor run immediately
            </div>
          </div>
          <button
            className="btn-pro primary"
            onClick={handleForceHeartbeat}
            disabled={isForceRunning || isSending || loading || !stats}
            style={{
              padding: "6px 20px",
              borderRadius: "8px",
              fontSize: "12px",
              border: "none",
              background:
                isForceRunning || isSending || loading || !stats
                  ? "rgba(148,163,184,0.1)"
                  : "rgba(251,191,36,0.2)",
              color:
                isForceRunning || isSending || loading || !stats
                  ? "#64748b"
                  : "#fbbf24",
              cursor:
                isForceRunning || isSending || loading || !stats
                  ? "default"
                  : "pointer",
              opacity:
                isForceRunning || isSending || loading || !stats ? 0.5 : 1,
              fontWeight: 600,
            }}
          >
            {isForceRunning ? "⏳ Running..." : "⚡ Force Now"}
          </button>
        </div>

        {/* Divider */}
        <div
          style={{
            height: "1px",
            background: "rgba(148,163,184,0.1)",
            margin: "0 4px",
          }}
        />

        {/* Custom Message */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ fontSize: "13px", fontWeight: 500, color: "#e2e8f0" }}>
            ✏️ Custom Message
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your custom message here... HTML is supported."
            rows={4}
            style={{
              width: "100%",
              padding: "10px",
              background: "rgba(0,0,0,0.2)",
              border: "1px solid rgba(148,163,184,0.2)",
              borderRadius: "8px",
              color: "#e2e8f0",
              fontSize: "14px",
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              color: sendStatus.includes("✅")
                ? "#34d399"
                : sendStatus.includes("❌")
                  ? "#f87171"
                  : "#94a3b8",
            }}
          >
            {sendStatus || "Ready"}
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className="btn-pro secondary"
              onClick={() => sendHeartbeat(false)}
              disabled={isSending || !stats || loading}
              style={{
                padding: "6px 16px",
                borderRadius: "8px",
                fontSize: "12px",
                border: "1px solid rgba(148,163,184,0.2)",
                background:
                  isSending || !stats || loading
                    ? "rgba(148,163,184,0.05)"
                    : "rgba(148,163,184,0.1)",
                color: "#e2e8f0",
                cursor: isSending || !stats || loading ? "default" : "pointer",
                opacity: isSending || !stats || loading ? 0.5 : 1,
              }}
            >
              📤 Send Now
            </button>
            <button
              className="btn-pro primary"
              onClick={handleSend}
              disabled={isSending || !message.trim() || loading}
              style={{
                padding: "6px 16px",
                borderRadius: "8px",
                fontSize: "12px",
                border: "none",
                background:
                  message.trim() && !isSending && !loading
                    ? "rgba(52,211,153,0.2)"
                    : "rgba(148,163,184,0.1)",
                color:
                  message.trim() && !isSending && !loading
                    ? "#34d399"
                    : "#64748b",
                cursor:
                  isSending || !message.trim() || loading
                    ? "default"
                    : "pointer",
                opacity: isSending || !message.trim() || loading ? 0.5 : 1,
              }}
            >
              {isSending ? "⏳" : "📨 Send Message"}
            </button>
          </div>
        </div>

        {/* Stats Preview */}
        {stats && (
          <div
            style={{
              fontSize: "10px",
              color: "#64748b",
              padding: "8px 12px",
              background: "rgba(0,0,0,0.15)",
              borderRadius: "6px",
              maxHeight: "80px",
              overflow: "auto",
            }}
          >
            <div>📊 Current Stats:</div>
            <div>
              ⛏️ Hashrate: {stats.liveStats?.currentHashrate || "N/A"} | 15m:{" "}
              {stats.liveStats?.avg15m || "N/A"}
            </div>
            <div>
              💰 Pending: {stats.paymentStats?.pendingBalance || "N/A"} |
              Workers: {stats.liveStats?.workersOnline || 0}/
              {stats.liveStats?.workersTotal || 0}
            </div>
            <div>
              📈 Efficiency: {stats.shareStats?.total?.efficiency || "N/A"}% |
              Blocks: {stats.blockStats?.totalBlocks || 0}
            </div>
            {isHeartbeatRunning && (
              <div style={{ color: "#34d399" }}>
                🔄 Heartbeat active - next send in ~15m
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}