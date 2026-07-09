// NiceHashContex.jsx
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";

// ─── Debug helper exposed globally for diagnosing ───
let _lastOrderStatuses = [];
export function getLastOrderStatuses() { return _lastOrderStatuses; }
import {
  normalizeAlgoForNiceHash,
  calculatePriceComparison,
  getAlgorithmUnit,
} from "../../core/mapping.js";
import { fetchMarketPrice } from "../../core/marketApi.js";
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
  const [marketPrices, setMarketPrices] = useState({}); // algo:market -> { value, unit }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [showPriceLookupModal, setShowPriceLookupModal] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);

  // Derived: selected order from the list
  const selectedOrder = useMemo(
    () =>
      nicehashOrders.find((order) => order.id === String(selectedOrderId)) ||
      null,
    [nicehashOrders, selectedOrderId],
  );

  // Helper: Get price by order ID
  const getOrderPrice = useCallback(
    (orderId) => {
      const order = nicehashOrders.find((o) => o.id === String(orderId));
      return order?.price ?? null;
    },
    [nicehashOrders],
  );

  // Helper: Get market price by order ID
  const getMarketPrice = useCallback(
    (orderId) => {
      const order = nicehashOrders.find((o) => o.id === String(orderId));
      return order?.marketPrice ?? null;
    },
    [nicehashOrders],
  );

  // Helper: Get price difference by order ID
  const getOrderDiff = useCallback(
    (orderId) => {
      const order = nicehashOrders.find((o) => o.id === String(orderId));
      return order?.orderDiff ?? null;
    },
    [nicehashOrders],
  );

  // Helper: Get complete order info by ID
  const getOrderById = useCallback(
    (orderId) => {
      return nicehashOrders.find((o) => o.id === String(orderId)) || null;
    },
    [nicehashOrders],
  );

  // Main fetch function
  const fetchNiceHashOrders = useCallback(async () => {
    if (!nhClient || !callApi) {
      console.warn("[NiceHashOrderContext] Missing nhClient or callApi");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch orders from NiceHash
      const data = await callApi("/api/v2/hashpower/myOrders", {
        query: { op: "LE", limit: 100, client: nhClient },
        silent: true,
        timeout: 60000, // Increase timeout to 60 seconds for this slow endpoint
      });

      if (data?.error) {
        throw new Error(data.error);
      }

      const list =
        data?.list || data?.myOrders || (Array.isArray(data) ? data : []);
      console.log(
        `[NiceHashOrderContext] Fetched ${list.length} orders for client ${nhClient}`,
      );

      // ── Debug: log the actual status values ──
      const statuses = list.map(o => ({ id: String(o.id || '').slice(0, 8), status: o.status?.code || o.status }));
      const uniqueStatuses = [...new Set(list.map(o => o.status?.code || o.status))];
      console.log(`[NiceHashOrderContext] Unique statuses: ${JSON.stringify(uniqueStatuses)}`, statuses.slice(0, 5));
      _lastOrderStatuses = { count: list.length, uniqueStatuses, sample: statuses.slice(0, 10) };

      // Separate active and inactive orders — also check for status being uppercase 'ACTIVE' string or object with code 'ACTIVE'
      const activeOrders = [];
      const inactiveOrders = [];
      list.forEach((o) => {
        const rawStatus = o.status?.code || o.status;
        const isActive = String(rawStatus).toUpperCase() === "ACTIVE";
        if (isActive) {
          activeOrders.push(o);
        } else {
          inactiveOrders.push(o);
        }
      });

      if (list.length === 0) {
        setNicehashOrders([]); // Clear if no orders at all
        setSummary({ totalPaid: "0.00000000", count: 0 });
        setLoading(false);
        return;
      }

      // Process all orders to get basic info
      const tempProcessed = list.map((o) => {
        const rawAlgo =
          typeof o.algorithm === "object"
            ? o.algorithm.algorithm || o.algorithm.displayName
            : o.algorithm;
        const algoCode = (rawAlgo || "").toUpperCase();
        const rawMarket = String(
          typeof o.market === "object" ? o.market.id : o.market || "",
        ).toUpperCase();
        const marketCode = ["USA", "EU"].includes(rawMarket)
          ? rawMarket
          : "USA";

        return {
          id: String(o.id || o.orderId || ""),
          paid: o.payedAmount || "0.00000000",
          price: o.price || 0,
          account: o.nhClient || nhClient,
          algo: algoCode,
          market: marketCode,
          speed: o.acceptedCurrentSpeed || 0,
          poolName:
            o.pool?.name ||
            o.pool?.stratumHostname ||
            o.title ||
            o.name ||
            "N/A",
          // Raw data for debugging
          rawOrder: o,
          isActive: (o.status?.code || o.status) === "ACTIVE",
        };
      });

      // Process with market data
      const processed = tempProcessed
        .map((p) => {
          // The server now provides marketPrice, marketUnit, and orderDiff directly
          // in the rawOrder object if available.
          const marketPrice = p.rawOrder?.marketPrice || 0;
          const marketUnit =
            p.rawOrder?.marketUnit ||
            getAlgorithmUnit(normalizeAlgoForNiceHash(p.algo));
          const orderDiff = p.rawOrder?.orderDiff || null;

          return {
            ...p,
            marketPrice,
            marketUnit,
            orderDiff,
          };
        })
        .sort((a, b) => parseFloat(b.speed || 0) - parseFloat(a.speed || 0));

      // Create the final list: all active orders + inactive orders from the last 30 days (up to 50)
      const finalActive = processed.filter((p) => p.isActive);
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const finalInactive = processed
        .filter((p) => {
          // Exclude active orders (already in finalActive) to prevent duplicates
          if (p.isActive) return false;
          // Only include inactives stopped within the last 30 days
          const orderTs = p.rawOrder?.ts || p.rawOrder?.updatedTs || p.rawOrder?.lastUpdated || 0;
          // Parse endTime or updatedAt from rawOrder if available
          const rawStatus = p.rawOrder?.status;
          const endTime = rawStatus?.endTime || rawStatus?.end || p.rawOrder?.endTime || 0;
          const orderAge = endTime > 0 ? Number(endTime) : (orderTs > 0 ? Number(orderTs) : 0);
          return orderAge > 0 ? (orderAge > thirtyDaysAgo) : true; // include if we can't determine age
        })
        .slice(0, 50);
      const combinedList = [...finalActive, ...finalInactive];

      // Calculate total paid
      const totalPaid = activeOrders
        .reduce((sum, o) => sum + parseFloat(o.payedAmount || 0), 0)
        .toFixed(8);

      setNicehashOrders(combinedList);
      setSummary({ totalPaid, count: finalActive.length });
      setLastRefreshTime(new Date().toISOString());

      console.log(
        `[NiceHashOrderContext] Updated ${combinedList.length} orders`,
      );
    } catch (err) {
      console.error("[NiceHashOrderContext] Error fetching orders:", err);
      setError(err.message || "Failed to fetch NiceHash orders");
      setNicehashOrders([]);
      setSummary({ totalPaid: "0.00000000", count: 0 });
    } finally {
      setLoading(false);
    }
  }, [nhClient, callApi]); // Dependency array is correct

  // Auto-refresh when client changes
  useEffect(() => {
    fetchNiceHashOrders();
  }, [fetchNiceHashOrders]);

  // Optional: Auto-refresh every 60 seconds
  useEffect(() => {
    if (!nhClient) return;

    clearSharedRefreshTimer();

    const intervalId = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      console.log("[NiceHashOrderContext] Auto-refreshing orders...");
      fetchNiceHashOrders();
    }, 60000); // 1 minute

    if (typeof window !== "undefined") {
      window[REFRESH_TIMER_KEY] = intervalId;
    }

    return () => clearInterval(intervalId);
  }, [nhClient, fetchNiceHashOrders]);

  // Context value
  const value = {
    // Core data
    nicehashOrders,
    marketPrices,
    summary,
    loading,
    error,
    lastRefreshTime,

    // Selected order
    selectedOrder,
    selectedOrderId,
    setSelectedOrderId,

    // Helper functions
    getOrderPrice,
    getMarketPrice,
    getOrderDiff,
    getOrderById,

    // Refresh
    refresh: fetchNiceHashOrders,

    // Modal control
    showPriceLookupModal,
    setShowPriceLookupModal,

    // Utility
    isReady: !loading && !error && nicehashOrders.length > 0,
  };

  return (
    <NiceHashOrderContext.Provider value={value}>
      {children}
    </NiceHashOrderContext.Provider>
  );
}

// Custom hook with error handling
export const useNiceHashOrders = () => {
  const context = useContext(NiceHashOrderContext);
  if (!context) {
    throw new Error(
      "useNiceHashOrders must be used within a NiceHashOrderProvider",
    );
  }
  return context;
};
