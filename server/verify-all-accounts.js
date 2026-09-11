import 'dotenv/config';
import { initNhConfigs, nhConfigs, resolveNhClient, getNiceHashApp } from './nh.js';

/**
 * Script to automatically verify stratum pools for configured NiceHash accounts.
 * Handles accounts like BT, PH, and numbered extras (2, 3, 4, 5...) from .env.
 * Runs in an INFINITE LOOP and handles 429 Rate Limit retries.
 * 
 * Usage:
 *   node server/verify-all-accounts.js               # Verify all accounts
 *   node server/verify-all-accounts.js BT             # Verify only BT
 *   node server/verify-all-accounts.js BT,PH,LN       # Verify specific accounts
 */
async function run() {
  // Initialize configurations from environment variables
  initNhConfigs(process.env);

  // Parse CLI filter argument (comma-separated account names, optional)
  const filterArg = process.argv[2];
  const filterList = filterArg ? filterArg.toUpperCase().split(',').map(s => s.trim()) : null;

  // Get all unique client keys that have the necessary credentials
  let accountNames = Object.keys(nhConfigs).filter(name => 
    nhConfigs[name].apiKey && nhConfigs[name].apiSecret && nhConfigs[name].orgId
  );

  // Apply filter if provided
  if (filterList) {
    accountNames = accountNames.filter(name => filterList.includes(name));
    if (accountNames.length === 0) {
      console.error(`[Error] None of the specified accounts match configured clients.`);
      console.error(`Available accounts: ${Object.keys(nhConfigs).filter(n => nhConfigs[n].apiKey && nhConfigs[n].apiSecret && nhConfigs[n].orgId).join(', ')}`);
      process.exit(1);
    }
  }

  if (accountNames.length === 0) {
    console.error(`[Error] No NiceHash clients are fully configured in .env (Missing API Key, Secret, or Org ID).`);
    process.exit(1);
  }

  const sessionStartTime = Date.now();
  let totalPoolsVerified = 0;
  let cycleCount = 0;

  // ====================================================
  // INFINITE LOOP - Keeps running forever
  // ====================================================
  while (true) {
    cycleCount++;
    const cycleStartTime = Date.now();
    let cyclePoolCount = 0;

    console.log(`\n🔄 Cycle #${cycleCount} - ${new Date().toLocaleString()}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Accounts: ${accountNames.join(', ')}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    for (let cIdx = 0; cIdx < accountNames.length; cIdx++) {
        const name = accountNames[cIdx];
        const { client, clientName } = resolveNhClient(name);

        if (clientName !== name && name !== 'BT') {
          console.warn(`⚠️ Skipping ${name}: Could not initialize client instance.`);
          continue;
        }

        const nhApp = getNiceHashApp(client);
        console.log(`📂 Processing: Account [${name}]`);

        try {
          process.stdout.write(`   📡 Fetching pools... `);
          const poolRes = await nhApp.pools.getPools();
          const pools = poolRes?.list || [];
          
          process.stdout.write(`Fetching active orders... `);
          const orderRes = await nhApp.hashpower.getMyOrders({ ts: Date.now().toString() });
          const activeOrders = orderRes?.list || orderRes?.myOrders || (Array.isArray(orderRes) ? orderRes : []);
          
          const activePoolIds = new Set(
            activeOrders
              .filter(o => (o.status?.code || o.status) === 'ACTIVE')
              .map(o => String(o.pool?.id || o.pool?.poolId || ''))
              .filter(Boolean)
          );

          console.log(`Done (${pools.length} pools, ${activePoolIds.size} active orders)`);

          if (pools.length === 0) {
            console.log(`   ℹ️ No pools found.`);
          } else {
            const seenPoolAlgos = new Set();
            for (let i = 0; i < pools.length; i++) {
              const pool = pools[i];
              const poolLabel = pool.name || pool.id;
              
              process.stdout.write(`   [${i + 1}/${pools.length}] ${String(poolLabel).padEnd(35)} `);

              try {
                const poolName = (pool.name || '').trim();
                const poolAlgo = pool.miningAlgorithm || pool.algorithm || '';
                const nameAlgoKey = `${poolName}|${poolAlgo}`;
                const poolId = pool.id || pool.poolId;

                if (poolName.toLowerCase() === 'active') {
                  console.log(`⏭️  SKIPPED (Active Name)`);
                  continue;
                }
                if (poolId && activePoolIds.has(String(poolId))) {
                  console.log(`⏭️  SKIPPED (In Use)`);
                  continue;
                }
                if (poolName && seenPoolAlgos.has(nameAlgoKey)) {
                  console.log(`⏭️  SKIPPED (Duplicate)`);
                  continue;
                }
                if (poolName) seenPoolAlgos.add(nameAlgoKey);

                let details = pool;
                if (poolId) {
                  let detailsFetched = false;
                  while (!detailsFetched) {
                    try {
                      const detailRes = await nhApp.pools.getPoolDetails(poolId);
                      if (detailRes?.status === 429) {
                        throw { statusCode: 429 };
                      }
                      details = detailRes;
                      detailsFetched = true;
                    } catch (dErr) {
                      if (dErr.statusCode === 429 || String(dErr.message).includes('429')) {
                        process.stdout.write(`⏳ (429 details, wait 3s)... `);
                        await new Promise(r => setTimeout(r, 3000));
                        continue;
                      }
                      throw dErr;
                    }
                  }
                }

                const stratumHost = details.stratumHost || details.stratumHostname || details.host || '';
                const stratumPort = Number(details.stratumPort || details.port || 0);
                const miningAlgorithm = details.miningAlgorithm || details.algorithm || '';
                const poolLocation = details.serviceLocation || details.poolVerificationServiceLocation || details.location || 'ANY';
                const username = details.username || details.user || '';
                const password = details.password || details.pass || 'x';

                const payload = {
                  poolVerificationServiceLocation: poolLocation,
                  miningAlgorithm: miningAlgorithm,
                  stratumHost: stratumHost,
                  stratumPort: stratumPort,
                  username: username,
                  password: password
                };

                let result;
                let verified = false;
                while (!verified) {
                  try {
                    result = await nhApp.pools.verifyPool(payload);
                    
                    if (result?.status === 429) {
                      throw { statusCode: 429, message: 'Rate limit hit' };
                    }
                    
                    verified = true;
                  } catch (vErr) {
                    if (vErr.statusCode === 429 || String(vErr.message).includes('429')) {
                      process.stdout.write(`⏳ (429 hit, wait 2.5s)... `);
                      await new Promise(r => setTimeout(r, 2500));
                      continue;
                    }
                    throw vErr;
                  }
                }

                if (result && result.error === undefined && (result.valid === true || result.success === true)) {
                  console.log(`✅ VALID`);
                } else {
                  console.log(`❌ FAILED (${result?.message || 'Invalid'})`);
                }
              } catch (err) {
                console.log(`⚠️ ERROR (${err.message})`);
              }

              cyclePoolCount++;
              totalPoolsVerified++;
              await new Promise(resolve => setTimeout(resolve, 2500));
            }
          }
        } catch (err) {
          console.error(`   ❌ Critical Account Error: ${err.message}`);
        }
        console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    }

    const cycleEndTime = Date.now();
    const cycleDuration = Math.floor((cycleEndTime - cycleStartTime) / 1000);
    const totalRunTime = Math.floor((cycleEndTime - sessionStartTime) / 1000);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✨ Cycle #${cycleCount} Complete`);
    console.log(`Pools This Cycle:  ${cyclePoolCount}`);
    console.log(`Total Pools:       ${totalPoolsVerified}`);
    console.log(`Cycle Duration:    ${cycleDuration}s`);
    console.log(`Total Runtime:     ${Math.floor(totalRunTime / 60)}m ${totalRunTime % 60}s`);
    console.log(`Next Cycle:        3 seconds...`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Wait 3 seconds before next cycle (adjust as needed)
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

run();