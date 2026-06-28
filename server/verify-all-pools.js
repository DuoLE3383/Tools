import 'dotenv/config';
import { initNhConfigs, nhConfigs, resolveNhClient, getNiceHashApp } from './nh.js';

/**
 * Script to automatically verify all stratum pools for ALL configured NiceHash accounts.
 * This keeps pools active across multiple accounts to prevent errors during automatic ordering.
 * 
 * Usage: node server/verify-all-pools.js
 */
async function run() {
  // Initialize configurations from environment variables
  initNhConfigs(process.env);

  // Get all unique client keys that have necessary credentials
  const clientNames = Object.keys(nhConfigs).filter(name => 
    nhConfigs[name].apiKey && nhConfigs[name].apiSecret && nhConfigs[name].orgId
  );

  if (clientNames.length === 0) {
    console.error(`[Error] No NiceHash clients are fully configured in .env (Missing API Key, Secret, or Org ID).`);
    process.exit(1);
  }

  console.log(`\n🚀 Starting Global Pool Auto-Verification`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Target Accounts: ${clientNames.join(', ')}`);
  console.log(`Start Time:      ${new Date().toLocaleString()}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  for (let cIdx = 0; cIdx < clientNames.length; cIdx++) {
    const name = clientNames[cIdx];
    const { client, clientName } = resolveNhClient(name);

    if (!client) {
      console.warn(`⚠️ Skipping ${name}: Could not resolve client instance.`);
      continue;
    }

    const nhApp = getNiceHashApp(client);
    console.log(`📂 Processing: ${clientName}`);

    try {
      process.stdout.write(`   📡 Fetching pools... `);
      const res = await nhApp.pools.getPools();
      const pools = res?.list || [];
      console.log(`Done (${pools.length} found)`);

      if (pools.length === 0) {
        console.log(`   ℹ️ No pools found.`);
        continue;
      }

      for (let i = 0; i < pools.length; i++) {
        const pool = pools[i];
        const poolLabel = pool.name || pool.id;
        
        process.stdout.write(`   [${i + 1}/${pools.length}] ${String(poolLabel).padEnd(35)} `);

        try {
          const payload = {
            poolVerificationServiceLocation: pool.serviceLocation || pool.poolVerificationServiceLocation || 'ANY',
            miningAlgorithm: pool.miningAlgorithm,
            stratumHost: pool.stratumHost || pool.stratumHostname,
            stratumPort: Number(pool.stratumPort),
            username: pool.username,
            password: pool.password
          };

          const result = await nhApp.pools.verifyPool(payload);

          // Success check based on NiceHash response shape
          if (result && (result.valid === true || result.success === true || !result.error)) {
            console.log(`✅ VALID`);
          } else {
            const msg = result?.message || result?.error || 'Invalid';
            console.log(`❌ FAILED (${msg})`);
          }
        } catch (err) {
          console.log(`⚠️ ERROR (${err.message})`);
        }

        // Wait to avoid rate limiting (3 seconds between requests)
        if (i < pools.length - 1 || cIdx < clientNames.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2500));
        }
      }
    } catch (err) {
      console.error(`   ❌ Critical Account Error: ${err.message}`);
    }
    console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  console.log(`\n✨ Finished global verification cycle.\n`);
}

run();