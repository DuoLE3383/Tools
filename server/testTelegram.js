// test-telegram.js
import 'dotenv/config';
import { request } from 'undici';

const BOTS = {
  MAIN: {
    name: 'Main Bot (Monitor)',
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },
  MINE: {
    name: 'Mining Bot (Workspace)',
    token: process.env.TELEGRAM_MINE_BOT_TOKEN,
    chatId: process.env.TELEGRAM_GROUP_ID,
  },
};

async function testBot(botKey) {
  const bot = BOTS[botKey];
  console.log(`\n--- Testing: ${bot.name} ---`);

  console.log(`  Token: ${bot.token ? '✓ Present' : '✗ Missing'}`);
  console.log(`  Chat ID: ${bot.chatId ? '✓ Present' : '✗ Missing'}`);

  if (!bot.token || !bot.chatId) {
    console.log('  ❌ Skipping test due to missing credentials.');
    return false;
  }

  try {
    // Test bot token
    process.stdout.write('  1. Verifying token... ');
    const meRes = await request(`https://api.telegram.org/bot${bot.token}/getMe`);
    const meData = await meRes.body.json();

    if (meRes.statusCode !== 200 || !meData.ok) {
      console.log(`❌ Invalid: ${meData.description}`);
      return false;
    }
    console.log(`✅ OK (@${meData.result.username})`);

    // Test send message
    process.stdout.write('  2. Sending test message... ');
    const msg = `✅ <b>Telegram Test: ${bot.name}</b>\n━━━━━━━━━━━━━━━━━━\nThis bot is working correctly.\nTime: ${new Date().toLocaleString()}`;

    const sendRes = await request(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: bot.chatId,
        text: msg,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const sendData = await sendRes.body.json();

    if (sendRes.statusCode !== 200 || !sendData.ok) {
      console.log(`❌ Failed: ${sendData.description}`);
      console.log('     Tip: Ensure the bot has been added to the chat/group and can send messages.');
      return false;
    }

    console.log('✅ Sent!');
    return true;
  } catch (err) {
    console.error('  ❌ Network or fetch error:', err.message);
    return false;
  }
}

async function runAllTests() {
  console.log('=== Telegram Notifier Debugger ===');
  let allOk = true;
  for (const key of Object.keys(BOTS)) {
    const result = await testBot(key);
    if (!result) allOk = false;
  }
  console.log(`\n--- Finished ---`);
  console.log(allOk ? '✅ All configured bots are working.' : '⚠️ Some bots have issues.');
}

runAllTests();