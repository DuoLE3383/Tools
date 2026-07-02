// index.js - Minimal NiceHash Pool Verifier
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// ============================================
// CONFIGURATION
// ============================================
const NICEHASH_API_KEY = process.env.NICEHASH_API_KEY;
const NICEHASH_API_SECRET = process.env.NICEHASH_API_SECRET;
const NICEHASH_ORG_ID = process.env.NICEHASH_ORG_ID;

// ============================================
// NICEHASH API HELPERS
// ============================================
class NiceHashClient {
  constructor(apiKey, apiSecret, orgId) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.orgId = orgId;
    this.baseUrl = 'https://api2.nicehash.com';
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'X-Api-Key': this.apiKey,
      'X-Organization-Id': this.orgId,
      'Content-Type': 'application/json',
    };

    try {
      const response = await axios({
        method: options.method || 'GET',
        url,
        headers,
        params: options.params,
        data: options.data,
        timeout: 10000,
      });
      return response.data;
    } catch (error) {
      console.error(`[API Error] ${endpoint}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async getMyOrders() {
    const endpoint = '/api/v2/hashpower/orders';
    return this.request(endpoint, {
      params: { op: 'LE', limit: 100 }
    });
  }

  async getOrder(orderId) {
    const endpoint = `/api/v2/hashpower/orders/${orderId}`;
    return this.request(endpoint);
  }

  async getRigs() {
    const endpoint = '/api/v2/hashpower/rigs';
    return this.request(endpoint);
  }

  async getRigPools(rigId) {
    const endpoint = `/api/v2/hashpower/rigs/${rigId}/pools`;
    return this.request(endpoint);
  }
}

// ============================================
// POOL VERIFICATION
// ============================================
async function verifyPools(client) {
  console.log('\n🔍 Verifying NiceHash Pools...\n');

  try {
    // Get all rigs
    const rigsData = await client.getRigs();
    const rigs = rigsData.list || rigsData.rigs || [];

    if (rigs.length === 0) {
      console.log('❌ No rigs found in the organization');
      return;
    }

    console.log(`📊 Found ${rigs.length} rigs\n`);

    // Get orders
    const ordersData = await client.getMyOrders();
    const orders = ordersData.list || ordersData.orders || [];

    console.log(`📊 Found ${orders.length} active orders\n`);

    // Verify each rig's pool
    for (const rig of rigs) {
      const rigId = rig.id || rig.rigId;
      const rigName = rig.name || rigId;

      console.log(`🖥️  Rig: ${rigName} (${rigId})`);
      console.log(`   Status: ${rig.status || 'Unknown'}`);
      console.log(`   Algorithm: ${rig.algorithm || rig.algo || 'Unknown'}`);

      try {
        const poolsData = await client.getRigPools(rigId);
        const pools = poolsData.list || poolsData.pools || [];

        if (pools.length === 0) {
          console.log('   ⚠️  No pools configured');
        } else {
          console.log(`   📡 Pools (${pools.length}):`);
          pools.forEach((pool, idx) => {
            const priority = pool.priority || pool.prio || idx + 1;
            const host = pool.host || pool.server || 'N/A';
            const port = pool.port || pool.portNumber || 'N/A';
            const user = pool.user || pool.username || pool.worker || 'N/A';

            console.log(`      ${priority}. ${host}:${port}`);
            console.log(`         User: ${user}`);
            
            // Check if pool is valid
            if (host === 'N/A' || host === '') {
              console.log(`         ⚠️  Invalid pool configuration`);
            }
          });
        }
      } catch (error) {
        console.log(`   ❌ Failed to fetch pools: ${error.message}`);
      }

      console.log('');
    }

    // Verify orders
    console.log('📋 Active Orders:');
    orders.forEach(order => {
      const id = order.id || order.orderId;
      const algo = order.algorithm || order.algo || 'Unknown';
      const price = order.price || order.fixedPrice || order.marketPrice || 0;
      const status = order.status || 'Unknown';

      console.log(`   ${id}: ${algo} @ ${price} BTC - ${status}`);
    });

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  }
}

// ============================================
// MAIN
// ============================================
async function main() {
  console.log('🚀 NiceHash Pool Verifier\n');

  if (!NICEHASH_API_KEY || !NICEHASH_API_SECRET || !NICEHASH_ORG_ID) {
    console.error('❌ Missing required environment variables:');
    console.error('   NICEHASH_API_KEY');
    console.error('   NICEHASH_API_SECRET');
    console.error('   NICEHASH_ORG_ID');
    console.log('\n💡 Create a .env file with these variables');
    process.exit(1);
  }

  const client = new NiceHashClient(
    NICEHASH_API_KEY,
    NICEHASH_API_SECRET,
    NICEHASH_ORG_ID
  );

  await verifyPools(client);
}

main().catch(console.error);