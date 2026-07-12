import 'dotenv/config';
import { initNhConfigs, resolveNhClient, getNiceHashApp } from './server/nh.js';

initNhConfigs(process.env);

async function testViaApp(name) {
  console.log(`\n=== Testing Account: ${name} via getNiceHashApp ===`);
  const { client } = resolveNhClient(name);
  if (!client) { console.log('SKIP - no client'); return; }
  
  const app = getNiceHashApp(client);
  
  // Test pools
  try {
    const pools = await app.pools.getPools();
    console.log(`  pools OK: ${pools?.list?.length || 0} pools`);
  } catch (e) {
    console.log(`  pools FAIL: ${e.message}`);
  }
  
  // Test myOrders (this was the broken one)
  try {
    const orders = await app.hashpower.getMyOrders({ op: 'LE' });
    console.log(`  myOrders OK: ${orders?.list?.length || 0} orders`);
  } catch (e) {
    console.log(`  myOrders FAIL: status=${e.statusCode}, message=${e.message}`);
  }
}

const { BT } = resolveNhClient('BT');
console.log('Testing through getNiceHashApp path...');
testViaApp('BT').then(() => console.log('\nDone')).catch(console.error);
