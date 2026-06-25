// src/core/marketApi.js
import { getNiceHashPriceValue } from "../../core/mrrUtils.js";

/**
 * Fetches the market price for a given algorithm from the backend API.
 * @param {function} callApi - The API call function from the app context.
 * @param {string} algorithm - The algorithm to fetch the price for (e.g., 'X16R').
 * @param {string} market - The market to check (e.g., 'USA', 'EU').
 * @param {string} nhClient - The NiceHash client to use for the request.
 * @returns {Promise<{value: number, unit: string}>} - The price value and its unit.
 */
export async function fetchMarketPrice(callApi, algorithm, market, nhClient) {
  if (!callApi || !algorithm || !market || !nhClient) {
    return { value: 0, unit: "N/A" };
  }

  try {
    const data = await callApi("/api/v2/hashpower/order/price", {
      query: {
        algorithm,
        market,
        client: nhClient,
      },
      silent: true,
    });

    const price = getNiceHashPriceValue(data);
    return { value: price, unit: data?.speedUnit || "N/A" };
  } catch (error) {
    console.warn(`[marketApi] Failed to fetch price for ${algorithm}:`, error);
    return { value: 0, unit: "N/A" };
  }
}