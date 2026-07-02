// server/verify-all-accounts.js - With client order control
import 'dotenv/config';
import { initNhConfigs, nhConfigs, resolveNhClient, getNiceHashApp } from './nh.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    clients: null,
    loops: 0,
    interval: 30,
    delay: 2500,
    verbose: false,
    export: false,
    help: false,
    preserveOrder: true, // NEW: Process clients in the order specified
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--client=')) {
      const clients = arg.split('=')[1].toUpperCase();
      config.clients = clients.split(',').map(c => c.trim());
    } else if (arg === '--client' && i + 1 < args.length) {
      const clients = args[++i].toUpperCase();
      config.clients = clients.split(',').map(c => c.trim());
    } else if (arg.startsWith('--loops=') || arg.startsWith('--loop=')) {
      const val = parseInt(arg.split('=')[1]) || 0;
      config.loops = val;
    } else if ((arg === '--loops' || arg === '--loop') && i + 1 < args.length) {
      config.loops = parseInt(args[++i]) || 0;
    } else if (arg.startsWith('--interval=')) {
      config.interval = parseInt(arg.split('=')[1]) || 30;
    } else if (arg === '--interval' && i + 1 < args.length) {
      config.interval = parseInt(args[++i]) || 30;
    } else if (arg.startsWith('--delay=')) {
      config.delay = parseInt(arg.split('=')[1]) || 2500;
    } else if (arg === '--delay' && i + 1 < args.length) {
      config.delay = parseInt(args[++i]) || 2500;
    } else if (arg === '--verbose' || arg === '-v') {
      config.verbose = true;
    } else if (arg === '--export' || arg === '-e') {
      config.export = true;
    } else if (arg === '--help' || arg === '-h') {
      config.help = true;
    } else if (arg === '--no-preserve-order') {
      config.preserveOrder = false;
    }
  }
  return config;
}

const CONFIG = parseArgs();

// Show help
if (CONFIG.help) {
  console.log(`
🔍 NiceHash Pool Verification - Multiple Clients

Usage:
  node server/verify-all-accounts.js [options]

Options:
  --client=<CLIENT1,CLIENT2>  Clients to verify (comma-separated)
  --loops=<N>                 Number of loops (0 = infinite)
  --interval=<S>              Interval between loops in seconds (default: 30)
  --delay=<MS>                Delay between pools in ms (default: 2500)
  --verbose, -v               Enable verbose logging
  --export, -e                Export results to JSON file
  --no-preserve-order         Process clients in alphabetical order instead of specified order
  --help, -h                  Show this help

Examples:
  # Process PH first, then BT
  node server/verify-all-accounts.js --client=PH,BT --verbose --export --loops=0
  
  # Process BT first, then PH (default order)
  node server/verify-all-accounts.js --client=BT,PH --verbose --export --loops=0
  
  # Process in alphabetical order (BT, PH)
  node server/verify-all-accounts.js --client=PH,BT --no-preserve-order --loops=0
  `);
  process.exit(0);
}

// Results storage
let allResults = [];
let totalVerified = 0;
let totalSuccess = 0;
let totalFailed = 0;
let totalSkipped = 0;
let loopCount = 0;

// Helper function to write results to file
function writeResults() {
  if (!CONFIG.export) return;
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(__dirname, '../data', `verify-results-${timestamp}.json`);
  
  const dir = path.dirname(filename);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const data = {
    timestamp: new Date().toISOString(),
    clients: CONFIG.clients || 'ALL',
    loopCount: loopCount,
    totalVerified: totalVerified,
    totalSuccess: totalSuccess,
    totalFailed: totalFailed,
    totalSkipped: totalSkipped,
    results: allResults,
  };
  
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`📊 Results exported to: ${filename}`);
}

// Print colored output
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

// Main verification function
async function run() {
  console.log('🔍 NiceHash Pool Verification');
  console.log('='.repeat(60));
  console.log(`📅 Started: ${new Date().toLocaleString()}`);
  console.log(`👤 Client Filter: ${CONFIG.clients ? CONFIG.clients.join(', ') : 'ALL'}`);
  console.log(`🔄 Loops: ${CONFIG.loops === 0 ? '♾️ Infinite' : CONFIG.loops}`);
  console.log(`⏱️  Interval: ${CONFIG.interval}s`);
  console.log(`⏱️  Pool Delay: ${CONFIG.delay}ms`);
  console.log(`🔊 Verbose: ${CONFIG.verbose ? '✅ Yes' : '❌ No'}`);
  console.log(`📊 Export: ${CONFIG.export ? '✅ Yes' : '❌ No'}`);
  console.log(`📋 Order: ${CONFIG.preserveOrder ? 'Specified order' : 'Alphabetical'}`);
  console.log('='.repeat(60));
  console.log('');

  // Initialize configurations from environment variables
  initNhConfigs(process.env);

  // Get all unique client keys that have the necessary credentials
  let accountNames = Object.keys(nhConfigs).filter(name => 
    nhConfigs[name].apiKey && nhConfigs[name].apiSecret && nhConfigs[name].orgId
  );

  if (accountNames.length === 0) {
    console.error(`❌ No NiceHash clients are fully configured in .env`);
    console.error(`   Missing API Key, Secret, or Org ID for any client.`);
    process.exit(1);
  }

  // Filter by clients if specified
  if (CONFIG.clients && CONFIG.clients.length > 0) {
    const filtered = accountNames.filter(name => 
      CONFIG.clients.some(c => name.toUpperCase() === c.toUpperCase())
    );
    if (filtered.length === 0) {
      console.error(`❌ None of the specified clients found or configured`);
      console.error(`   Available clients: ${accountNames.join(', ')}`);
      console.error(`   Requested clients: ${CONFIG.clients.join(', ')}`);
      process.exit(1);
    }
    
    // Preserve the order specified in --client
    if (CONFIG.preserveOrder) {
      // Reorder filtered to match the order in CONFIG.clients
      const ordered = [];
      for (const client of CONFIG.clients) {
        const found = filtered.find(name => name.toUpperCase() === client.toUpperCase());
        if (found) {
          ordered.push(found);
        }
      }
      accountNames = ordered;
    } else {
      accountNames = filtered.sort();
    }
    
    console.log(`✅ Filtered to ${accountNames.length} client(s): ${accountNames.join(', ')}`);
    console.log(`📋 Processing order: ${accountNames.join(' → ')}`);
    console.log('');
  }

  const sessionStartTime = Date.now();

  // Infinite loop
  while (true) {
    if (CONFIG.loops > 0 && loopCount >= CONFIG.loops) {
      console.log(`\n✅ Completed ${loopCount} loops, stopping...`);
      break;
    }

    loopCount++;
    let loopPoolCount = 0;
    let loopSuccess = 0;
    let loopFailed = 0;
    let loopSkipped = 0;
    const loopStartTime = Date.now();

    console.log(`\n🔄 LOOP #${loopCount}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📋 Accounts: ${accountNames.join(', ')}`);
    console.log(`⏰ Started: ${new Date().toLocaleString()}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    for (let cIdx = 0; cIdx < accountNames.length; cIdx++) {
      const name = accountNames[cIdx];
      const { client, clientName } = resolveNhClient(name);

      if (clientName !== name && name !== 'BT') {
        console.warn(`⚠️ Skipping ${name}: Could not initialize client instance.`);
        continue;
      }

      const nhApp = getNiceHashApp(client);
      
      // Show which client we're processing with counter
      console.log(`${colorize('📂', 'cyan')} Account ${cIdx + 1}/${accountNames.length}: ${colorize(name, 'magenta')} (${client})`);

      try {
        process.stdout.write(`   📡 Fetching pools... `);
        const poolRes = await nhApp.pools.getPools();
        const pools = poolRes?.list || [];
        
        process.stdout.write(`Fetching active orders... `);
        const orderRes = await nhApp.hashpower.getMyOrders({
          market: 'USA',
          op: 'LE',
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

        console.log(`✅ Done (${pools.length} pools, ${activePoolIds.size} active orders)`);

        if (pools.length === 0) {
          console.log(`   ℹ️ No pools found for ${name}`);
        } else {
          const seenPoolAlgos = new Set();
          
          for (let i = 0; i < pools.length; i++) {
            const pool = pools[i];
            const poolLabel = pool.name || pool.id || `Pool-${i}`;
            
            process.stdout.write(`   [${i + 1}/${pools.length}] ${String(poolLabel).padEnd(35)} `);

            try {
              const poolName = (pool.name || '').trim();
              const poolAlgo = pool.miningAlgorithm || pool.algorithm || '';
              const nameAlgoKey = `${poolName}|${poolAlgo}`;
              const poolId = String(pool.id || pool.poolId || '');

              if (poolId && activePoolIds.has(poolId)) {
                console.log(`⏭️  SKIPPED (Active Order)`);
                loopSkipped++;
                totalSkipped++;
                continue;
              }
              
              if (poolName && seenPoolAlgos.has(nameAlgoKey)) {
                console.log(`⏭️  SKIPPED (Duplicate)`);
                loopSkipped++;
                totalSkipped++;
                continue;
              }
              if (poolName) seenPoolAlgos.add(nameAlgoKey);

              let details = pool;
              const stratumHost = details.stratumHostname || details.stratumHost || details.host || '';
              const stratumPort = Number(details.port || details.stratumPort || 0);
              const miningAlgorithm = details.miningAlgorithm || details.algorithm || '';
              const poolLocation = details.serviceLocation || details.poolVerificationServiceLocation || details.location || 'ANY';
              const username = details.username || details.user || '';
              const password = details.password || details.pass || 'x';

              if (!stratumHost || !stratumPort) {
                console.log(`⚠️  SKIPPED (Missing host/port)`);
                loopSkipped++;
                totalSkipped++;
                continue;
              }

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
              let retryCount = 0;
              const maxRetries = 3;
              
              while (!verified && retryCount < maxRetries) {
                try {
                  result = await nhApp.pools.verifyPool(payload);
                  
                  if (result?.status === 429) {
                    throw { statusCode: 429, message: 'Rate limit hit' };
                  }
                  
                  verified = true;
                } catch (vErr) {
                  if (vErr.statusCode === 429 || String(vErr.message).includes('429')) {
                    retryCount++;
                    const waitTime = retryCount * 5000;
                    process.stdout.write(`⏳ (429, retry ${retryCount}/${maxRetries} in ${waitTime/1000}s)... `);
                    await new Promise(r => setTimeout(r, waitTime));
                    continue;
                  }
                  throw vErr;
                }
              }

              const isSuccess = result && result.error === undefined && 
                (result.valid === true || result.success === true);
              
              if (isSuccess) {
                console.log(`${colorize('✅', 'green')} VALID`);
                loopSuccess++;
                totalSuccess++;
              } else {
                const errorMsg = result?.message || result?.error || 'Invalid response';
                console.log(`${colorize('❌', 'red')} FAILED (${errorMsg})`);
                loopFailed++;
                totalFailed++;
              }

              allResults.push({
                account: name,
                pool: poolLabel,
                algorithm: miningAlgorithm,
                host: stratumHost,
                port: stratumPort,
                success: isSuccess,
                message: isSuccess ? 'Valid' : (result?.message || 'Invalid'),
                timestamp: new Date().toISOString()
              });

              loopPoolCount++;
              totalVerified++;

            } catch (err) {
              console.log(`${colorize('❌', 'red')} ERROR (${err.message})`);
              loopFailed++;
              totalFailed++;
            }

            if (i < pools.length - 1) {
              await new Promise(resolve => setTimeout(resolve, CONFIG.delay));
            }
          }
        }
      } catch (err) {
        console.error(`   ${colorize('❌', 'red')} Account Error: ${err.message}`);
        if (CONFIG.verbose) {
          console.error(err.stack);
        }
      }
      
      console.log(`   ${'━'.repeat(55)}`);
    }

    const loopEndTime = Date.now();
    const cycleDuration = Math.floor((loopEndTime - loopStartTime) / 1000);
    const totalRunTime = Math.floor((loopEndTime - sessionStartTime) / 1000);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 LOOP #${loopCount} SUMMARY`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📋 Total Pools:  ${loopPoolCount}`);
    console.log(`${colorize('✅', 'green')} Success:      ${loopSuccess}`);
    console.log(`${colorize('❌', 'red')} Failed:      ${loopFailed}`);
    console.log(`⏭️  Skipped:     ${loopSkipped}`);
    console.log(`⏱️  Duration:    ${cycleDuration}s`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 TOTAL (All Loops):`);
    console.log(`   Verified: ${totalVerified} | ${colorize('✅', 'green')} ${totalSuccess} | ${colorize('❌', 'red')} ${totalFailed} | ⏭️ ${totalSkipped}`);
    console.log(`   Total Runtime: ${Math.floor(totalRunTime / 60)}m ${totalRunTime % 60}s`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    if (CONFIG.export) {
      writeResults();
    }

    if (CONFIG.loops > 0 && loopCount >= CONFIG.loops) {
      console.log(`\n✅ Completed ${loopCount} loops, stopping...`);
      break;
    }

    console.log(`\n⏳ Waiting ${CONFIG.interval}s before next loop...`);
    console.log(`   Press Ctrl+C to stop`);
    await new Promise(resolve => setTimeout(resolve, CONFIG.interval * 1000));
  }

  console.log('\n' + '='.repeat(60));
  console.log('🏁 FINAL SUMMARY');
  console.log('='.repeat(60));
  console.log(`📋 Total Verified: ${totalVerified}`);
  console.log(`✅ Success: ${totalSuccess}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`⏭️  Skipped: ${totalSkipped}`);
  console.log(`🔄 Total Loops: ${loopCount}`);
  console.log(`⏱️  Total Runtime: ${Math.floor((Date.now() - sessionStartTime) / 60000)}m`);
  console.log('='.repeat(60));

  if (CONFIG.export) {
    writeResults();
  }
}

run().catch(error => {
  console.error(`${colorize('❌', 'red')} Fatal error:`, error);
  process.exit(1);
});