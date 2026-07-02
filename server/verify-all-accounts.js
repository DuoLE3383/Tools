import 'dotenv/config';
import { initNhConfigs, nhConfigs, resolveNhClient, getNiceHashApp } from './nh.js';

/**
 * Script to automatically verify all stratum pools for ALL configured NiceHash accounts.
 * Handles accounts like BT, PH, and numbered extras (2, 3, 4, 5...) from .env.
 * Runs in an infinite loop and handles 429 Rate Limit retries.
 * 
 * Usage: node server/verify-all-accounts.js
 */
async function run() {
  // Initialize configurations from environment variables
  initNhConfigs(process.env);

  // Get all unique client keys that have the necessary credentials
  const accountNames = Object.keys(nhConfigs).filter(name => 
    nhConfigs[name].apiKey && nhConfigs[name].apiSecret && nhConfigs[name].orgId
  );

  if (accountNames.length === 0) {
    console.error(`[Error] No NiceHash clients are fully configured in .env (Missing API Key, Secret, or Org ID).`);
    process.exit(1);
  }

  const sessionStartTime = Date.now();

  while (true) {
    let loopPoolCount = 0;
    const loopStartTime = Date.now();

    console.log(`\n🚀 Starting Global Pool Auto-Verification`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Found ${accountNames.length} Accounts: ${accountNames.join(', ')}`);
    console.log(`Start Time:     ${new Date().toLocaleString()}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    for (let cIdx = 0; cIdx < accountNames.length; cIdx++) {
      const name = accountNames[cIdx];
      const { client, clientName } = resolveNhClient(name);

      // If resolveNhClient fell back to BT, and this wasn't BT, it means initialization failed
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
        // ✅ FIX: The getMyOrders endpoint requires algorithm and market.
        // Providing empty algorithm and a default market fetches all orders.
        // Also adding a limit, as it's often required.
        // ✅ FIX 2: Omit the algorithm key entirely if you want all algorithms.
        const orderRes = await nhApp.hashpower.getMyOrders({
          market: 'USA',
          op: 'LE', // ✅ FIX: Add the required 'op' (operator) parameter
          limit: '100',
          ts: Date.now().toString()
        });
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
              const poolId = String(pool.id || pool.poolId || '');

              // ✅ Correctly check if the pool ID is in the set of active pool IDs
              if (poolId && activePoolIds.has(poolId)) {
                console.log(`⏭️  SKIPPED (In Use by Active Order)`);
                continue;
              }
              if (poolName && seenPoolAlgos.has(nameAlgoKey)) {
                console.log(`⏭️  SKIPPED (Duplicate)`);
                continue;
              }
              if (poolName) seenPoolAlgos.add(nameAlgoKey);

              let details = pool;

              // Mapping fields correctly from full details
              const stratumHost = details.stratumHostname || details.stratumHost || details.host || '';
              const stratumPort = Number(details.port || details.stratumPort || 0);
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
              // Retry loop for 429 errors
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

            loopPoolCount++;
            // 2.5-second base delay between pools
            await new Promise(resolve => setTimeout(resolve, 2500));
          }
        }
      } catch (err) {
        console.error(`   ❌ Critical Account Error: ${err.message}`);
      }
      console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    }

    const loopEndTime = Date.now();
    const cycleDuration = Math.floor((loopEndTime - loopStartTime) / 1000);
    const totalRunTime = Math.floor((loopEndTime - sessionStartTime) / 1000);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✨ Global Cycle Finished`);
    console.log(`Total Pools Verified: ${loopPoolCount}`);
    console.log(`Cycle Duration:       ${cycleDuration}s`);
    console.log(`Total Session Run:    ${totalRunTime}s`);
    console.log(`Last Finish Time:     ${new Date().toLocaleString()}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    console.log(`\nRestarting in 2s...`);
    await new Promise(resolve => setTimeout(resolve, 2000)); 
  }
}

run();