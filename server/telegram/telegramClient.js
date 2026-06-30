// server/telegram/telegramClient.js

// ✅ Import the centralized sender from monitor.js
import { sendTelegramInternal } from '../monitor.js';

/**
 * Sends a message to the mining-specific Telegram chat.
 * This is a convenience wrapper around the main sender function.
 * @param {string} message The message to send (HTML supported).
 * @returns {Promise<object|null>}
 */
export async function sendMineTelegram(message) {
  try {
    // ✅ Use the 'MINE_BOT' type to send through the correct bot
    return await sendTelegramInternal(message, 'MINE_BOT');
  } catch (err) {
    console.error(`[sendMineTelegram] Failed to send: ${err.message}`);
    return null;
  }
}