// NiceHashContext.jsx - FINAL UPGRADED VERSION
// Fetches orders, market prices, and computes orderDiff accurately.

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";

import {
  normalizeAlgoForNiceHash,
  getAlgoMapping,
  getNiceHashUnit,
  getAlgoDisplayName,
  calculatePriceComparison,
} from "../../core/mapping.js";

export const NiceHashOrderContext = createContext();

const REFRESH_TIMER_KEY = "__nicehashOrdersRefreshTimer";

function clearSharedRefreshTimer() {
  if (typeof window === "undefined") return;
  const timer = window[REFRESH_TIMER_KEY];
  if (timer) {
    clearInterval(timer);
    window[REFRESH_TIMER_KEY] = null;
  }
}

export function NiceHashOrderProvider({ children, nhClient, callApi }) {
  // Core state
  const [nicehashOrders, setNicehashOrders] = useState([]);
  const [summary, setSummary] = useState({ totalPaid: "0.00000000", count: 0 });
  const [marketPrices, setMarketPrices] = useState({}); // algo -> { price, unit }
  const [loading, setLoading] = useState(false);
  const isLoadingRef = React.useRef(false);
  const [error, setError] = useState(null);
  const [partialErrors, setPartialErrors] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [showPriceLookupModal, setShowPriceLookupModal] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);

  const selectedOrder = useMemo(
    () => nicehashOrders.find((o) => o.id === String(selectedOrderId)) || null,
    [nicehashOrders, selectedOrderId]
  );

  const getOrderPrice = useCallback(
    (orderId) => {
      const order = nicehashOrders.find((o) => o.id === String(orderId));
      return order?.price ?? null;
    },
    [nicehashOrders]
  );

  const getMarketPrice = useCallback(
    (orderId) => {
      const order = nicehashOrders.find((o) => o.id === String(orderId));
      return order?.marketPrice ?? null;
    },
    [nicehashOrders]
  );

  const getOrderDiff = useCallback(
    (orderId) => {
      const order = nicehashOrders.find((o) => o.id === String(orderId));
      return order?.orderDiff ?? null;
    },
    [nicehashOrders]
  );

  const getOrderById = useCallback(
    (orderId) => nicehashOrders.find((o) => o.id === String(orderId)) || null,
    [nicehashOrders]
  );

  // ─── Main fetch function ──────────────────────────────────────────
  const fetchNiceHashOrders = useCallback(async () => {
    if (isLoadingRef.current) {
      console.warn("[NH Context] Refresh skipped – fetch in progress.");
      return;
    }
    if (!nhClient || !callApi) return;

    isLoadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch orders
      const data = await callApi("/api/v2/hashpower/myOrders", {
        query: { op: "LE", limit: 100, client: nhClient },
        silent: true,
      });

      if (data?.error) throw new Error(data.error);

      // Capture partial per-client failures (e.g. one account with invalid
      // credentials returns "Invalid session (1010)") so the UI can surface
      // them without discarding the successful data from the other accounts.
      setPartialErrors(Array.isArray(data?.errors) ? data.errors : []);

      const list = data?.list || data?.myOrders || (Array.isArray(data) ? data : []);
      console.log(`[NH Context] Fetched ${list.length} orders for ${nhClient}`);

      if (list.length === 0) {
        setNicehashOrders([]);
        setSummary({ totalPaid: "0.00000000", count: 0 });
        setLoading(false);
        return;
      }

      // 2. Extract unique algorithms to fetch market prices
      const uniqueAlgos = new Set();
      list.forEach((o) => {
        const rawAlgo =
          typeof o.algorithm === "object"
            ? o.algorithm.algorithm || o.algorithm.displayName
            : o.algorithm;
        const algoCode = normalizeAlgoForNiceHash(rawAlgo);
        if (algoCode && algoCode !== "UNKNOWN") uniqueAlgos.add(algoCode);
      });

      // 3. Fetch market prices for each algorithm (using aggregated endpoint)
      const marketPricePromises = Array.from(uniqueAlgos).map(async (algo) => {
        try {
          const priceData = await callApi("/api/v2/mrr/nicehash/price", {
            query: { algorithm: algo, market: "USA" },
            silent: true,
            background: true,
          });
          if (priceData?.success) {
            return {
              algo,
              price: parseFloat(priceData.price) || 0,
              unit: priceData.unit || getNiceHashUnit(algo) || "TH",
            };
          }
        } catch (e) {
          console.warn(`[NH Context] Failed to fetch market price for ${algo}`, e);
        }
        return null;
      });

      const marketResults = (await Promise.all(marketPricePromises)).filter(
        (r) => r && r.price > 0
      );
      const newMarketPrices = {};
      marketResults.forEach((r) => {
        newMarketPrices[r.algo] = { price: r.price, unit: r.unit };
      });
      setMarketPrices((prev) => ({ ...prev, ...newMarketPrices }));

      // 4. Process orders
      const processed = list.map((o) => {
        const rawAlgo =
          typeof o.algorithm === "object"
            ? o.algorithm.algorithm || o.algorithm.displayName
            : o.algorithm;
        const algoCode = normalizeAlgoForNiceHash(rawAlgo);
        const algoMapping = getAlgoMapping(algoCode);
        const algoUnit = getNiceHashUnit(algoCode) || "TH";
        const market = typeof o.market === "object" ? o.market.id : o.market || "USA";

        const orderPrice = parseFloat(o.price || 0);
        const marketInfo = newMarketPrices[algoCode] || null;
        let marketPrice = marketInfo?.price || 0;
        let marketUnit = marketInfo?.unit || algoUnit;

        // If no market price from aggregated endpoint, fallback to raw order's marketPrice if present
        if (!marketPrice && o.marketPrice) {
          marketPrice = parseFloat(o.marketPrice);
          marketUnit = o.marketUnit || algoUnit;
        }

        let orderDiff = null;
        if (orderPrice > 0 && marketPrice > 0) {
          // Calculate percentage difference: (orderPrice / marketPrice - 1) * 100
          // But need unit conversion if units differ
          // Use calculatePriceComparison which handles unit conversion
          orderDiff = calculatePriceComparison(
            orderPrice,
            algoUnit,
            marketPrice,
            marketUnit
          );
        }

        return {
          id: String(o.id || o.orderId || ""),
          paid: o.payedAmount || "0.00000000",
          price: orderPrice,
          account: o.nhClient || o.account || null,
          algo: algoCode,
          algoDisplayName: algoMapping.displayName || algoCode,
          algoUnit,
          market,
          speed: parseFloat(o.acceptedCurrentSpeed || 0),
          poolName: o.pool?.name || o.pool?.stratumHostname || o.title || o.name || "N/A",
          rawOrder: o,
          isActive: (o.status?.code || o.status) === "ACTIVE",
          marketPrice,
          marketUnit,
          orderDiff,
        };
      });

      // 5. Sort: active first, then by speed descending
      processed.sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return (b.speed || 0) - (a.speed || 0);
      });

      // 6. Separate active/inactive for summary
      const activeOrders = processed.filter((p) => p.isActive);
      const inactiveOrders = processed.filter((p) => !p.isActive).slice(0, 100);
      const combinedList = [...activeOrders, ...inactiveOrders];

      const totalPaid = activeOrders
        .reduce((sum, o) => sum + parseFloat(o.paid || 0), 0)
        .toFixed(8);

      setNicehashOrders(combinedList);
      setSummary({ totalPaid, count: activeOrders.length });
      setLastRefreshTime(new Date().toISOString());

      console.log(`[NH Context] Updated ${combinedList.length} orders`);
    } catch (err) {
      console.error("[NH Context] Error fetching orders:", err);
      setError(err.message || "Failed to fetch NiceHash orders");
      setNicehashOrders([]);
      setSummary({ totalPaid: "0.00000000", count: 0 });
      setPartialErrors([]);
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
    }
  }, [nhClient, callApi]);

  // ─── Auto‑refresh on client change ──────────────────────────────
  useEffect(() => {
    fetchNiceHashOrders();
  }, [fetchNiceHashOrders]);

  // ─── Periodic refresh (every 60s) ──────────────────────────────
  useEffect(() => {
    if (!nhClient) return;

    clearSharedRefreshTimer();

    const intervalId = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      console.log("[NH Context] Auto-refreshing orders...");
      fetchNiceHashOrders();
    }, 60000);

    if (typeof window !== "undefined") {
      window[REFRESH_TIMER_KEY] = intervalId;
    }

    return () => {
      clearInterval(intervalId);
      if (typeof window !== "undefined") {
        window[REFRESH_TIMER_KEY] = null;
      }
    };
  }, [nhClient, fetchNiceHashOrders]);

  // ─── Context value ──────────────────────────────────────────────
  const value = {
    nicehashOrders,
    marketPrices,
    summary,
    loading,
    error,
    partialErrors,
    lastRefreshTime,
    selectedOrder,
    selectedOrderId,
    setSelectedOrderId,
    getOrderPrice,
    getMarketPrice,
    getOrderDiff,
    getOrderById,
    refresh: fetchNiceHashOrders,
    showPriceLookupModal,
    setShowPriceLookupModal,
    isReady: !loading && !error && nicehashOrders.length > 0,
  };

  return (
    <NiceHashOrderContext.Provider value={value}>
      {children}
    </NiceHashOrderContext.Provider>
  );
}

export const useNiceHashOrders = () => {
  const context = useContext(NiceHashOrderContext);
  if (!context) {
    throw new Error(
      "useNiceHashOrders must be used within a NiceHashOrderProvider"
    );
  }
  return context;
};
