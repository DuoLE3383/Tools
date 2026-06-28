// ==========================
//  LIB: TELEGRAM UTILITIES
//  Telegram formatting and sending
// ==========================

/**
 * Escape HTML entities
 */
export function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Build grouped telegram messages
 */
export function buildGroupedMessages(items, typeLabel, escape = escapeHtml) {
  const title = `📦 [${new Date().toLocaleTimeString()}]\n` +
    `━━━━━━━━━━━━━━\n` +
    `<b>Type:</b> ${escape(typeLabel)}\n` +
    `<b>Total:</b> ${items.length}\n\n`;
  
  const chunks = [];
  let current = title;
  const maxLength = 3500;

  items.forEach((item, index) => {
    const block = `<b>${index + 1}. ${escape(item.label)}</b>\n${item.message}\n\n━━━━━━━━━━━━━━\n`;
    if (current.length > title.length && current.length + block.length > maxLength) {
      chunks.push(current);
      current = title;
    }
    current += block;
  });

  if (current.length > title.length) chunks.push(current);
  return chunks;
}

/**
 * Build finished rental message
 */
export function buildFinishedMessage(rental, info, algo, ads, templates) {
  return templates.finished(rental, info, algo, ads);
}

/**
 * Build active rental line
 */
export function buildActiveRentalLine(perfEmoji, algo, name, remaining, efficiency, orderDiff, avgHash, advHash, speed, target, acct, info, templates) {
  return templates.activeRentalLine(
    perfEmoji, algo, name, remaining, efficiency,
    orderDiff, avgHash, advHash, speed, target, '', acct, info
  );
}