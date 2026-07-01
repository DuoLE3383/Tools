// server/helpers.js
import { db } from './db.js';

// ============================================================
// TELEGRAM MESSAGING (shared)
// ============================================================

export async function getTelegramStatus() {
  try {
    await new Promise((resolve, reject) => {
      db.run(
        "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)",
        (err) => (err ? reject(err) : resolve())
      );
    });
    const row = await new Promise((resolve, reject) => {
      db.get(
        "SELECT value FROM settings WHERE key = 'telegram_enabled'",
        (err, row) => (err ? reject(err) : resolve(row))
      );
    });
    return { enabled: row ? row.value === 'true' : true };
  } catch (err) {
    return { enabled: true };
  }
}

export async function sendTelegramInternal(message) {
  const status = await getTelegramStatus();
  if (!status.enabled) {
    console.log('[telegram] Notifications disabled.');
    return { ok: true };
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) throw new Error('Telegram credentials missing');
  const text = String(message || '').trim();
  if (!text) throw new Error('Message empty');
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
  });
  const data = await res.json();
  if (res.ok && data?.ok) return data;
  throw new Error(data?.description || `HTTP ${res.status}`);
}

// You can also export other shared utilities here if needed (e.g., db helpers, NH caching)