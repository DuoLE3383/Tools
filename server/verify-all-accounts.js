// server/verify-all-accounts.js - Cleaned up version
import 'dotenv/config';
import { initNhConfigs, nhConfigs, resolveNhClient, getNiceHashApp } from './nh.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  clients: null,        // Specific clients to verify
  loops: 0,             // Number of loops (0 = infinite)
  interval: 2,         // Interval between loops in seconds
  delay: 2000,          // Delay between pools in ms
  verbose: false,       // Enable verbose logging
  export: false,        // Export results to JSON
  preserveOrder: true,  // Process clients in specified order
};

// ============================================
// PARSE COMMAND LINE ARGUMENTS
// ============================================
function parseArgs() {
  const args = process.argv.slice(2);
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--client=')) {
      const clients = arg.split('=')[1].toUpperCase();
      CONFIG.clients = clients.split(',').map(c => c.trim());
    } else if (arg === '--client' && i + 1 < args.length) {
      const clients = args[++i].toUpperCase();
      CONFIG.clients = clients.split(',').map(c => c.trim());
    } else if (arg.startsWith('--loops=') || arg.startsWith('--loop=')) {
      CONFIG.loops = parseInt(arg.split('=')[1]) || 1;
    } else if ((arg === '--loops' || arg === '--loop') && i + 1 < args.length) {
      CONFIG.loops = parseInt(args[++i]) || 1;
    } else if (arg.startsWith('--interval=')) {
      CONFIG.interval = parseInt(arg.split('=')[1]) || 30;
    } else if (arg === '--interval' && i + 1 < args.length) {
      CONFIG.interval = parseInt(args[++i]) || 30;
    } else if (arg.startsWith('--delay=')) {
      CONFIG.delay = parseInt(arg.split('=')[1]) || 2000;
    } else if (arg === '--delay' && i + 1 < args.length) {
      CONFIG.delay = parseInt(args[++i]) || 2000;
    } else if (arg === '--verbose' || arg === '-v') {
      CONFIG.verbose = true;
    } else if (arg === '--export' || arg === '-e') {
      CONFIG.export = true;
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
    } else if (arg === '--no-preserve-order') {
      CONFIG.preserveOrder = false;
    }
  }
}

// ============================================
// HELP
// ============================================
function showHelp() {
  console.log(`
🔍 NiceHash Pool Verification

Usage:
  node server/verify-all-accounts.js [options]

Options:
  --client=<CLIENT1,CLIENT2>  Clients to verify (comma-separated)
  --loops=<N>                 Number of loops (default: 1, 0 = infinite)
  --interval=<S>              Interval between loops in seconds (default: 30)
  --delay=<MS>                Delay between pools in ms (default: 2000)
  --verbose, -v               Enable verbose logging
  --export, -e                Export results to JSON file
  --no-preserve-order         Process clients alphabetically
  --help, -h                  Show this help

Examples:
  # Verify BT and PH clients
  node server/verify-all-accounts.js --client=BT,PH --verbose --export
  
  # Infinite loop with 60s interval
  node server/verify-all-accounts.js --client=BT,PH --loops=0 --interval=60
  
  # Process in alphabetical order
  node server/verify-all-accounts.js --client=PH,BT --no-preserve-order
  `);
  process.exit(0);
}

// ============================================
// RESULTS
// ============================================
let results = {
  verified: 0,
  success: 0,
  failed: 0,
  skipped: 0,
  loops: 0,
  details: [],
};

// ============================================
// UTILITIES
// ============================================
function colorize(text, color) {
  const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    reset: '\x1b[0m',
  };
  return `${colors[color] || ''}${text}${colors.reset || ''}`;
}

function writeResults() {
  if (!CONFIG.export) return;
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(__dirname, '../data');
  const filename = path.join(dir, `verify-results-${timestamp}.json`);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const data = {
    timestamp: new Date().toISOString(),
    config: {
      clients: CONFIG.clients || 'ALL',
      loops: CONFIG.loops,
      interval: CONFIG.interval,
      delay: CONFIG.delay,
      preserveOrder: CONFIG.preserveOrder,
    },
    summary: {
      loops: results.loops,
      verified: results.verified,
      success: results.success,
      failed: results.failed,
      skipped: results.skipped,
    },
    details: results.details,
  };
  
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`📊 Results exported to: ${filename}`);
}

// ============================================
// VERIFY POOL
// ============================================
async function verifyPool(nhApp, pool, name, poolIndex, totalPools) {
  const poolLabel = pool.name || pool.id || `Pool-${poolIndex}`;
  process.stdout.write(`   [${poolIndex + 1}/${totalPools}] ${String(poolLabel).padEnd(35)} `);

  try {
    const poolName = (pool.name || '').trim();
    const poolAlgo = pool.miningAlgorithm || pool.algorithm || '';
    const poolId = String(pool.id || pool.poolId || '');

    // Skip if missing data
    const stratumHost = pool.stratumHostname || pool.stratumHost || pool.host || '';
    const stratumPort = Number(pool.port || pool.stratumPort || 0);

    if (!stratumHost || !stratumPort) {
      console.log(`⚠️  SKIPPED (Missing host/port)`);
      results.skipped++;
      return { success: false, skipped: true, reason: 'Missing host/port' };
    }

    const payload = {
      poolVerificationServiceLocation: pool.serviceLocation || pool.location || 'ANY',
      miningAlgorithm: poolAlgo,
      stratumHost: stratumHost,
      stratumPort: stratumPort,
      username: pool.username || pool.user || '',
      password: pool.password || pool.pass || 'x'
    };

    // Verify with retry
    let result = null;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        result = await nhApp.pools.verifyPool(payload);
        if (result?.status !== 429) break;
      } catch (err) {
        if (err.statusCode === 429 || String(err.message).includes('429')) {
          retryCount++;
          const waitTime = retryCount * 5000;
          process.stdout.write(`⏳ (429, retry ${retryCount}/${maxRetries} in ${waitTime/1000}s)... `);
          await new Promise(r => setTimeout(r, waitTime));
          continue;
        }
        throw err;
      }
    }

    const isValid = result && result.error === undefined && 
      (result.valid === true || result.success === true);

    if (isValid) {
      console.log(`${colorize('✅', 'green')} VALID`);
      results.success++;
    } else {
      const errorMsg = result?.message || result?.error || 'Invalid response';
      console.log(`${colorize('❌', 'red')} FAILED (${errorMsg})`);
      results.failed++;
    }

    results.verified++;
    results.details.push({
      account: name,
      pool: poolLabel,
      algorithm: poolAlgo,
      host: stratumHost,
      port: stratumPort,
      success: isValid,
      message: isValid ? 'Valid' : (result?.message || 'Invalid'),
      timestamp: new Date().toISOString(),
    });

    return { success: isValid, result };

  } catch (err) {
    console.log(`${colorize('❌', 'red')} ERROR (${err.message})`);
    results.failed++;
    results.details.push({
      account: name,
      pool: poolLabel,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
    return { success: false, error: err.message };
  }
}

// ============================================
// VERIFY ACCOUNT
// ============================================
async function verifyAccount(name, accountIndex, totalAccounts) {
  console.log(`${colorize('📂', 'cyan')} Account ${accountIndex + 1}/${totalAccounts}: ${colorize(name, 'magenta')}`);

  try {
    const { client, clientName } = resolveNhClient(name);
    if (clientName !== name && name !== 'BT') {
      console.warn(`   ⚠️ Skipping ${name}: Could not initialize client.`);
      return;
    }

    const nhApp = getNiceHashApp(client);

    process.stdout.write(`   📡 Fetching pools... `);
    const poolRes = await nhApp.pools.getPools();
    const pools = poolRes?.list || [];
    console.log(`✅ ${pools.length} pools found`);

    if (pools.length === 0) {
      console.log(`   ℹ️ No pools found for ${name}`);
      return;
    }

    // Process each pool
    const seenPoolAlgos = new Set();
    let poolIndex = 0;

    for (const pool of pools) {
      const poolName = (pool.name || '').trim();
      const poolAlgo = pool.miningAlgorithm || pool.algorithm || '';
      const nameAlgoKey = `${poolName}|${poolAlgo}`;

      // Skip duplicates
      if (poolName && seenPoolAlgos.has(nameAlgoKey)) {
        console.log(`   [${poolIndex + 1}/${pools.length}] ${String(poolName).padEnd(35)} ⏭️ SKIPPED (Duplicate)`);
        results.skipped++;
        poolIndex++;
        continue;
      }
      if (poolName) seenPoolAlgos.add(nameAlgoKey);

      await verifyPool(nhApp, pool, name, poolIndex, pools.length);
      poolIndex++;

      // Delay between pools
      if (poolIndex < pools.length) {
        await new Promise(r => setTimeout(r, CONFIG.delay));
      }
    }

    console.log(`   ${'━'.repeat(55)}`);

  } catch (err) {
    console.error(`   ${colorize('❌', 'red')} Account Error: ${err.message}`);
    if (CONFIG.verbose) console.error(err.stack);
  }
}

// ============================================
// RUN VERIFICATION
// ============================================
async function run() {
  console.log('🔍 NiceHash Pool Verification');
  console.log('='.repeat(2));
  console.log(`📅 Started: ${new Date().toLocaleString()}`);
  console.log(`👤 Clients: ${CONFIG.clients ? CONFIG.clients.join(', ') : 'ALL'}`);
  console.log(`🔄 Loops: ${CONFIG.loops === 0 ? '♾️ Infinite' : CONFIG.loops}`);
  console.log(`⏱️  Interval: ${CONFIG.interval}s`);
  console.log(`⏱️  Pool Delay: ${CONFIG.delay}ms`);
  console.log(`📋 Order: ${CONFIG.preserveOrder ? 'Specified' : 'Alphabetical'}`);
  console.log('='.repeat(2));

  // Init configs
  initNhConfigs(process.env);

  // Get clients
  let accountNames = Object.keys(nhConfigs).filter(name => 
    nhConfigs[name].apiKey && nhConfigs[name].apiSecret && nhConfigs[name].orgId
  );

  if (accountNames.length === 0) {
    console.error('❌ No NiceHash clients configured');
    process.exit(1);
  }

  // Filter by clients if specified
  if (CONFIG.clients) {
    const filtered = accountNames.filter(name => 
      CONFIG.clients.some(c => name.toUpperCase() === c.toUpperCase())
    );
    
    if (filtered.length === 0) {
      console.error(`❌ No specified clients found`);
      console.error(`   Available: ${accountNames.join(', ')}`);
      console.error(`   Requested: ${CONFIG.clients.join(', ')}`);
      process.exit(1);
    }

    // Preserve order
    if (CONFIG.preserveOrder) {
      const ordered = [];
      for (const client of CONFIG.clients) {
        const found = filtered.find(name => name.toUpperCase() === client.toUpperCase());
        if (found) ordered.push(found);
      }
      accountNames = ordered;
    } else {
      accountNames = filtered.sort();
    }
  }

  console.log(`✅ Processing ${accountNames.length} client(s): ${accountNames.join(' → ')}`);
  console.log('');

  const startTime = Date.now();

  // Main loop
  while (true) {
    if (CONFIG.loops > 0 && results.loops >= CONFIG.loops) {
      break;
    }

    results.loops++;
    const loopStart = Date.now();

    console.log(`\n🔄 LOOP #${results.loops}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    for (let i = 0; i < accountNames.length; i++) {
      await verifyAccount(accountNames[i], i, accountNames.length);
    }

    const loopDuration = Math.floor((Date.now() - loopStart) / 1000);
    const totalDuration = Math.floor((Date.now() - startTime) / 1000);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 LOOP #${results.loops} SUMMARY`);
    console.log(`   ✅ Success: ${results.success}`);
    console.log(`   ❌ Failed: ${results.failed}`);
    console.log(`   ⏭️  Skipped: ${results.skipped}`);
    console.log(`   ⏱️  Duration: ${loopDuration}s`);
    console.log(`   📊 Total: ${results.verified} verified (${results.success + results.failed} checked)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    if (CONFIG.export) writeResults();

    if (CONFIG.loops > 0 && results.loops >= CONFIG.loops) break;

    console.log(`\n⏳ Waiting ${CONFIG.interval}s before next loop...`);
    await new Promise(r => setTimeout(r, CONFIG.interval * 1000));
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('🏁 FINAL SUMMARY');
  console.log('='.repeat(60));
  console.log(`📋 Verified: ${results.verified}`);
  console.log(`✅ Success: ${results.success}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⏭️  Skipped: ${results.skipped}`);
  console.log(`🔄 Loops: ${results.loops}`);
  console.log(`⏱️  Runtime: ${Math.floor((Date.now() - startTime) / 60000)}m`);
  console.log('='.repeat(60));

  if (CONFIG.export) writeResults();
}

// ============================================
// START
// ============================================
parseArgs();
run().catch(err => {
  console.error(`${colorize('❌', 'red')} Fatal error:`, err);
  process.exit(1);
});