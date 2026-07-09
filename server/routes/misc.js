// routes/misc.js - UPDATED WITH TELEGRAM SUPPORT

import { asyncHandler } from "../utils.js";
import { 
  sendTelegramInternal, 
  getTelegramStatus, 
  setTelegramStatus,
  getTelegramHealth 
} from "../monitor.js";
import { saveMiningTrainingSnapshot } from "../miningTrainingDb.js";
import { db } from "../db.js";
import { saveToDatabase } from "./_helpers.js";
import fs from "fs/promises";
import path from "path";
import { scanMiningOpportunities } from "../miningOpportunityNotifier.js";

const DATA_DIR = path.resolve(process.cwd(), "data");

// ✅ Check both main and mining bot configurations
const hasMainToken = !!process.env.TELEGRAM_BOT_TOKEN;
const hasMainChatId = !!process.env.TELEGRAM_CHAT_ID;
const hasMineToken = !!process.env.TELEGRAM_MINE_BOT_TOKEN;
const hasMineChatId = !!process.env.TELEGRAM_GROUP_ID;
const isMainConfigured = hasMainToken && hasMainChatId;
const isMineConfigured = hasMineToken && hasMineChatId;

export function registerMiscRoutes(app) {
  // ─── Telegram ──────────────────────────────────────────────────
  
  // ✅ Main bot endpoint (for MRR/monitor notifications)
  app.post("/api/v2/notify/telegram", asyncHandler(async (req, res) => {
    const { message } = req.body;
    try {
      const data = await sendTelegramInternal(message, 'MAIN_BOT');
      res.json(data);
    } catch (err) {
      console.warn(`[telegram:main] ${err.message}`);
      res.status(400).json({ success: false, error: err.message });
    }
  }));

  // ✅ Mining bot endpoint (for mining page notifications)
  app.post("/api/v2/telegram/send-mine", asyncHandler(async (req, res) => {
    const { message } = req.body;
    try {
      // ✅ Use the centralized sender from monitor.js
      const data = await sendTelegramInternal(message, 'MINE_BOT');
      res.json(data);
    } catch (err) {
      console.warn(`[telegram:mine] ${err.message}`);
      res.status(400).json({ success: false, error: err.message });
    }
  }));

  // ─── Coin Prices ─────────────────────────────────────────────
  app.get("/api/v2/prices/db/:coinId", asyncHandler(async (req, res) => {
    const { coinId } = req.params;
    if (!coinId) {
      return res.status(400).json({ success: false, error: "Coin ID is required." });
    }

    try {
      db.get(
        `SELECT * FROM coin_prices WHERE coin_id = ? ORDER BY captured_at DESC LIMIT 1`,
        [coinId],
        (err, row) => {
          if (err) return res.status(500).json({ success: false, error: err.message });
          if (!row) return res.status(404).json({ success: false, error: "Price not found in database." });
          res.json({ success: true, data: row });
        }
      );
    } catch (err) {
      res.status(500).json({ success: false, error: `Database query failed: ${err.message}` });
    }
  }));

  // ─── Manual Price Update ───────────────────────────────────
  app.post("/api/v2/prices/update", asyncHandler(async (req, res) => {
    try {
      console.log("[Prices] Manual price update triggered from frontend");
      const result = await scanMiningOpportunities(true);
      res.json({ success: true, message: "Mining opportunities scan and price update completed.", ...result });
    } catch (err) {
      console.error("[Prices] Manual update failed:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }));

  // ─── Telegram Status ─────────────────────────────────────────
  app.get("/api/v2/notify/telegram/status", asyncHandler(async (req, res) => {
    const status = await getTelegramStatus();
    res.json(status);
  }));

  app.post("/api/v2/notify/telegram/status", asyncHandler(async (req, res) => {
    const { enabled } = req.body;
    const result = await setTelegramStatus(enabled);
    res.json(result);
  }));

  // ✅ Updated health check with both bots
  app.get("/api/v2/notify/telegram/health", asyncHandler(async (req, res) => {
    const health = await getTelegramHealth();
    res.json({
      success: isMainConfigured || isMineConfigured,
      configured: isMainConfigured || isMineConfigured,
      tokenPresent: hasMainToken || hasMineToken,
      chatIdPresent: hasMainChatId || hasMineChatId,
      // ✅ Detailed status for both bots
      mainBot: {
        configured: isMainConfigured,
        tokenPresent: hasMainToken,
        chatIdPresent: hasMainChatId,
      },
      mineBot: {
        configured: isMineConfigured,
        tokenPresent: hasMineToken,
        chatIdPresent: hasMineChatId,
      }
    });
  }));

  // ─── Test ─────────────────────────────────────────────────────
  app.post("/api/v2/test/rented-notice", asyncHandler(async (req, res) => {
    const msg = `🚀 <b>[New Rental]</b>\n<b>Account:</b> <code>TEST_BT</code>\n━━━━━━━━━━━━━━\n<b>Rig:</b> Test-Rig-Notice (<code>123456</code>)\n<b>Algo:</b> <code>SHA256</code>\n<b>Time:</b> 2024-01-01 12:00:00 - 2024-01-02 12:00:00\n━━━━━━━━━━━━━━\n<b>Paid:</b> <code>0.00045000 BTC</code>\n<b>Efficiency:</b> <b>100.0%</b>\n<b>Remaining:</b> 24.00h\n<b>Target to 100%:</b> 1.23 TH/s\n<i>This is a simulated rental notice.</i>`;
    try {
      const tgRes = await sendTelegramInternal(msg, 'MAIN_BOT');
      res.json({ success: true, message: "Test notice sent", telegram: tgRes });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }));

  // ─── Monitor Snapshot ────────────────────────────────────────
  app.get("/api/v2/mrr/monitor/snapshot", asyncHandler(async (req, res) => {
    db.all(`SELECT * FROM rentals ORDER BY last_updated DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      saveToDatabase("monitor_snapshot.csv", rows);
      res.json({ success: true, data: rows });
    });
  }));

  app.delete("/api/v2/mrr/monitor/snapshot/:id", asyncHandler(async (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM rentals WHERE id = ?`, [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    });
  }));

  app.patch("/api/v2/mrr/monitor/snapshot/:id", asyncHandler(async (req, res) => {
    const { id } = req.params;
    const fields = Object.keys(req.body).filter(k => k !== 'id').map(k => `${k} = ?`).join(', ');
    if (!fields) return res.status(400).json({ success: false, error: 'No fields provided for update' });
    const values = [...Object.keys(req.body).filter(k => k !== 'id').map(k => req.body[k]), id];
    db.run(`UPDATE rentals SET ${fields} WHERE id = ?`, values, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    });
  }));

  // ─── Extracted Pools ─────────────────────────────────────────
  app.get("/api/v2/extracted-pools", asyncHandler(async (req, res) => {
    const filePath = path.resolve(process.cwd(), "extracted_pools.json");
    try {
      await fs.access(filePath);
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content || "[]");
      res.json(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err.code === "ENOENT") return res.json([]);
      res.status(500).json({ success: false, error: `Error reading extracted pools: ${err.message}` });
    }
  }));

  // ─── Mining Training Snapshot ───────────────────────────────
  app.post("/api/v2/mining/training-snapshot", asyncHandler(async (req, res) => {
    try {
      const result = await saveMiningTrainingSnapshot(req.body || {});
      res.json({ success: true, data: result });
    } catch (err) {
      console.error("[mining-training] Failed to save snapshot:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }));

  // ─── Mining Opportunities Scan ──────────────────────────────
  app.get("/api/v2/mining/opportunities/scan", asyncHandler(async (req, res) => {
    const { handleMiningOpportunityScan } = await import("../miningOpportunityNotifier.js");
    await handleMiningOpportunityScan(req, res);
  }));
}
