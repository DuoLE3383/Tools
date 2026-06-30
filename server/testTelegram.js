// test-telegram.js
import 'dotenv/config';
// ✅ Import the real functions from the application
import { 
  sendTelegramInternal, 
  getTelegramHealth 
} from './monitor.js';

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

async function testBot(botKey, health) {
  const botConfig = BOTS[botKey];
  const botHealth = botKey === 'MAIN' ? health.mainBot : health.mineBot;

  console.log(`\n--- Testing: ${botConfig.name} ---`);
  console.log(`  Token: ${botHealth.tokenPresent ? '✓ Present' : '✗ Missing'}`);
  console.log(`  Chat ID: ${botHealth.chatIdPresent ? '✓ Present' : '✗ Missing'}`);

  if (!botHealth.configured) {
    console.log('  ❌ Skipping test due to missing credentials.');
    return false;
  }

  try {
    // The send function now handles token verification implicitly.
    process.stdout.write('  1. Sending test message... ');
    const msg = `✅ <b>Telegram Test: ${botConfig.name}</b>\n━━━━━━━━━━━━━━━━━━\nThis bot is working correctly.\nTime: ${new Date().toLocaleString()}`;

    // ✅ Use the actual application function
    await sendTelegramInternal(msg, `${botKey}_BOT`);

    console.log('✅ Sent!');
    return true;
  } catch (err) {
    console.log(`❌ Failed: ${err.message}`);
    if (err.message.includes('chat not found')) {
      console.log('     Tip: Ensure the bot has been added to the chat/group.');
    }
    return false;
  }
}

async function runAllTests() {
  console.log('=== Telegram Notifier Debugger ===');
  const health = await getTelegramHealth();
  let allOk = true;
  for (const key of Object.keys(BOTS)) {
    const result = await testBot(key, health);
    if (!result) allOk = false;
  }
  console.log(`\n--- Finished ---`);
  console.log(allOk ? '✅ All configured bots are working.' : '⚠️ Some bots have issues.');
}

runAllTests();