// miners/herominers-api.js
import fetch from 'node-fetch';

const DEFAULT_TIMEOUT = 30000;

/**
 * HeroMiners API Client
 */
export class HeroMinersAPI {
  constructor(options = {}) {
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.apiKey = options.apiKey || null;
  }

  /**
   * Make API request
   */
  async request(coin, endpoint, params = {}) {
    if (!coin) throw new Error('A coin must be provided for the API request.');

    const coinLower = coin.toLowerCase();
    const subdomain = coinLower === 'zeph' ? 'zephyr' : coinLower;
    const url = new URL(`https://${subdomain}.herominers.com${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, String(value));
      }
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const headers = {
        'Accept': 'application/json',
        'User-Agent': 'HeroMiners-Client/1.0'
      };

      if (this.apiKey) {
        headers['X-API-Key'] = this.apiKey;
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Get miner stats by address
   */
  async getMinerStats(address, coin) {
    const endpoint = `/api/stats_address`;
    return this.request(coin, endpoint, { address });
  }

  /**
   * Get miner hashrate history
   */
  async getMinerHashrateHistory(address, coin) {
    const endpoint = `/api/history`;
    return this.request(coin, endpoint, { address });
  }

  /**
   * Get miner payment history
   */
  async getMinerPayments(address, coin, limit = 50) {
    const endpoint = `/api/payments`;
    return this.request(coin, endpoint, { address, limit });
  }

  /**
   * Get pool stats
   */
  async getPoolStats(coin) {
    const endpoint = `/api/stats`;
    return this.request(coin, endpoint);
  }

  /**
   * Get network stats
   */
  async getNetworkStats(coin) {
    const endpoint = `/api/stats`; // Network stats are usually included in the main pool stats
    return this.request(coin, endpoint);
  }
}