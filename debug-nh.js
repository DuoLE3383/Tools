import 'dotenv/config';
import { initNhConfigs, nhConfigs, resolveNhClient, getNiceHashApp } from './server/nh.js';

initNhConfigs(process.env);

async function testOne(name) {
  console.log(`\n--- Testing Account: ${name} ---`);
  const cfg = nhConfigs[name];
  console.log(`Config: apiKey=${cfg?.apiKey?.substring(0,10)}..., orgId=${cfg?.orgId?.substring(0,10)}..., apiSecret set=${!!cfg?.apiSecret}`);

  const { client, clientName } = resolveNhClient(name);
  console.log(`Resolved: client=${!!client}, clientName=${clientName}`);

  if (!client) {
    console.log(`SKIP - no client`);
    return;
  }

  // Test 1: getServerTime
  try {
    const time = await client.getServerTime();
    console.log(`getServerTime OK: ${time}`);
  } catch (e) {
    console.log(`getServerTime FAIL: ${e.message}`);
  }

  // Test 2: pools
  try {
    const res = await client.call({ method: 'GET', path: '/main/api/v2/pools', query: { page: '0', size: '10' } });
    console.log(`pools OK: list length = ${res?.list?.length || 0}`);
  } catch (e) {
    console.log(`pools FAIL: status=${e.statusCode}, message=${e.message}`);
  }

  // Test 3: myOrders
  try {
    const res = await client.call({ method: 'GET', path: '/main/api/v2/hashpower/myOrders', query: { ts: Date.now().toString() } });
    console.log(`myOrders OK: list length = ${res?.list?.length || 0}`);
  } catch (e) {
    console.log(`myOrders FAIL: status=${e.statusCode}, message=${e.message}`);
  }
}

const names = Object.keys(nhConfigs).filter(n => nhConfigs[n].apiKey && nhConfigs[n].apiSecret && nhConfigs[n].orgId);
console.log(`Accounts: ${names.join(', ')}`);

(async () => {
  for (const name of names) {
    await testOne(name);
  }
})();
