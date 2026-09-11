// Simple runner to invoke the monitor once for debugging notifications
import 'dotenv/config';
import { runRentalMonitor, getTelegramHealth } from './monitor.js';
import { initMrrConfigs, initNonces, syncMrrClock } from './mrr.js';

async function main() {
  console.log('Initializing MRR configs from environment...');
  initMrrConfigs(process.env);
  await initNonces();
  await syncMrrClock();

  console.log('Running monitor test (forceNotify=true) for client BT');
  const health = await getTelegramHealth();
  console.log('Telegram health:', health);
  try {
    const res = await runRentalMonitor(true, 'BT');
    console.log('Monitor run completed:', { notifications: res.notifications?.length || 0, summary: res.summary || null });
  } catch (err) {
    console.error('Monitor run failed:', err);
  }
}

main().catch(err => {
  console.error('RunMonitorTest error:', err);
  process.exit(1);
});
