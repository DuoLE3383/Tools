// src/utils/apiWrapper.js
import { createApiClient } from '../../server/api-client.js';

// Create API client with rate limiting config
const apiClient = createApiClient({
  USER_API: {
    RATE_LIMIT: 60,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
  },
  COINGECKO: {
    RATE_LIMIT: 30, // CoinGecko free tier: 30 calls/min
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000,
  },
  NICEHASH: {
    RATE_LIMIT: 60,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
  },
  MRR: {
    RATE_LIMIT: 60,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
  },
});

// Frontend wrapper that handles errors and shows modals
export function createApiWrapper(showModal, getToken) {
  return async function callApi(endpoint, options = {}) {
    const { 
      method = 'GET', 
      body, 
      query, 
      silent = false,
      showModal: showErrorModal = true,
      source = 'USER_API',
      token = getToken?.() || null,
    } = options;

    try {
      // Build URL with query params
      let url = endpoint;
      if (query) {
        const params = new URLSearchParams();
        Object.entries(query).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            params.append(key, String(value));
          }
        });
        const queryString = params.toString();
        if (queryString) {
          url += (url.includes('?') ? '&' : '?') + queryString;
        }
      }

      // Determine the request options
      const fetchOptions = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        token,
      };

      if (body) {
        fetchOptions.body = JSON.stringify(body);
      }

      // Make the API call
      const response = await apiClient.fetchJson(source, url, fetchOptions);

      // Check for error in response
      if (response && response.success === false) {
        const errorMsg = response.error || response.message || 'API request failed';
        if (!silent && showErrorModal) {
          showModal?.({
            title: 'API Error',
            message: errorMsg,
            type: 'error',
          });
        }
        throw new Error(errorMsg);
      }

      return response;
    } catch (error) {
      if (!silent && showErrorModal) {
        showModal?.({
          title: 'Error',
          message: error.message || 'An unexpected error occurred',
          type: 'error',
        });
      }
      throw error;
    }
  };
}