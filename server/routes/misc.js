// routes/misc.js
import { asyncHandler } from "../utils.js";
import { sendTelegramInternal, runRentalMonitor, getTelegramStatus, setTelegramStatus } from "../monitor.js";
import { saveMiningTrainingSnapshot } from "../miningTrainingDb.js";
import { db } from "../db.js";
import { saveToDatabase } from "./_helpers.js";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const hasToken = !!process.env.TELEGRAM_BOT_TOKEN;
const hasChatId = !!process.env.TELEGRAM_CHAT_ID;

export function registerMiscRoutes(app) {
  // ─── Telegram ──────────────────────────────────────────────────
  app.post("/api/v2/notify/telegram", asyncHandler(async (req, res) => {
    const { message } = req.body;
    try {
      const data = await sendTelegramInternal(message);
      res.json(data);
    } catch (err) {
      console.warn(`[telegram] ${err.message}`);
      res.status(400).json({ success: false, error: err.message });
    }
  }));
  app.get("/api/v2/notify/telegram/status", asyncHandler(async (req, res) => res.json(await getTelegramStatus())));
  app.post("/api/v2/notify/telegram/status", asyncHandler(async (req, res) => {
    const { enabled } = req.body;
    res.json(await setTelegramStatus(enabled));
  }));
  app.get("/api/v2/notify/telegram/health", asyncHandler(async (req, res) => res.json({ success: hasToken && hasChatId, configured: hasToken && hasChatId, tokenPresent: hasToken, chatIdPresent: hasChatId })));

  // ─── Test ─────────────────────────────────────────────────────
  app.post("/api/v2/test/rented-notice", asyncHandler(async (req, res) => {
    const msg = `🚀 <b>[New Rental]</b>\n<b>Account:</b> <code>TEST_BT</code>\n━━━━━━━━━━━━━━\n<b>Rig:</b> Test-Rig-Notice (<code>123456</code>)\n<b>Algo:</b> <code>SHA256</code>\n<b>Time:</b> 2024-01-01 12:00:00 - 2024-01-02 12:00:00\n━━━━━━━━━━━━━━\n<b>Paid:</b> <code>0.00045000 BTC</code>\n<b>Efficiency:</b> <b>100.0%</b>\n<b>Remaining:</b> 24.00h\n<b>Target to 100%:</b> 1.23 TH/s\n<i>This is a simulated rental notice.</i>`;
    try {
      const tgRes = await sendTelegramInternal(msg);
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
<<<<<<< HEAD
<<<<<<< HEAD
    const { handleMiningOpportunityScan } = await import("../mining/miningOpportunities.js");
=======
    const { handleMiningOpportunityScan } = await import("../miningOpportunityNotifier.js");
>>>>>>> parent of 1db0535 (big update)
=======
    const { handleMiningOpportunityScan } = await import("../miningOpportunityNotifier.js");
>>>>>>> parent of 1db0535 (big update)
    await handleMiningOpportunityScan(req, res);
  }));
}