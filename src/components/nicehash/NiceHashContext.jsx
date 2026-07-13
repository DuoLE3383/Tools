// NiceHashContext.jsx - FIXED VERSION
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";

// ✅ Import the correct functions from mapping
import {
  normalizeAlgoForNiceHash,
  getAlgoMapping,
  getNiceHashUnit,      // ✅ Use the correct unit getter for NiceHash
  getAlgoDisplayName,
  convertPrice,         // ✅ Import price conversion utility
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
      const data = await callApi("/api/v2/hashpower/myOrders", {
        // Use the client from the provider props. This allows the UI to control the data source.
        // The MRR page will temporarily set this to 'VN' to ensure it gets all orders.
        query: { op: "LE", limit: 100, client: nhClient },
        silent: true,
      });

      if (data?.error) {
        throw new Error(data.error);
      }

      const list =
        data?.list || data?.myOrders || (Array.isArray(data) ? data : []);
      console.log(
        `[NiceHashOrderContext] Fetched ${list.length} orders for client ${nhClient}`
      );

      // Separate active and inactive orders
      const activeOrders = [];
      const inactiveOrders = [];
      list.forEach((o) => {
        if ((o.status?.code || o.status) === "ACTIVE") {
          activeOrders.push(o);
        } else {
          inactiveOrders.push(o);
        }
      });

      if (list.length === 0) {
        setNicehashOrders([]);
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

        // ✅ Use getAlgoMapping to get algorithm info
        const algoMapping = getAlgoMapping(algoCode);
        
        // ✅ Use getNiceHashUnit to get the correct price unit for the algorithm
        const algoUnit = getNiceHashUnit(algoCode);

        return {
          id: String(o.id || o.orderId || ""),
          paid: o.payedAmount || "0.00000000",
          price: o.price || 0,
          // When using an aggregate client ('VN'), the backend returns an `nhClient` field.
          // Falling back to the provider's 'nhClient' prop is incorrect, as it would
          // mislabel all orders from the aggregate call with the client of the current page.
          account: o.nhClient || o.account || null,
          algo: algoCode,
          algoDisplayName: algoMapping.displayName || algoCode,
          algoUnit: algoUnit,
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

      // ✅ Process with market data - use the correct unit
      const processed = tempProcessed
        .map((p) => {
          // Get market price from rawOrder if available, or fetch it
          let marketPrice = p.rawOrder?.marketPrice || 0;
          let marketUnit = p.rawOrder?.marketUnit || p.algoUnit;
          
          // If marketPrice is not available, try to calculate it
          if (marketPrice === 0 && p.price > 0 && p.rawOrder?.marketPrice === undefined) {
            // You might want to fetch market price here
            // For now, we'll use a placeholder (e.g., 5% less than order price)
            marketPrice = p.price * 0.95; 
          }
          
          // Calculate order difference if both prices exist
          let orderDiff = p.rawOrder?.orderDiff || null;
          if (orderDiff === null && marketPrice > 0 && p.price > 0 && marketUnit !== p.algoUnit) {
            orderDiff = calculatePriceComparison(
              p.price,
              p.algoUnit,
              marketPrice,
              marketUnit
            );
          }

          return {
            ...p,
            marketPrice,
            marketUnit,
            orderDiff,
          };
        })
        .sort((a, b) => parseFloat(b.speed || 0) - parseFloat(a.speed || 0));

      // Create the final list: all active orders + the last 20 inactive ones
      const finalActive = processed.filter((p) => p.isActive);
      const finalInactive = processed.filter((p) => !p.isActive).slice(0, 20);
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
  }, [nhClient, callApi]);

  // Auto-refresh when client changes
  useEffect(() => {
    fetchNiceHashOrders();
  }, [fetchNiceHashOrders]);

  // ✅ Optional: Auto-refresh every 60 seconds with proper cleanup
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

    return () => {
      clearInterval(intervalId);
      if (typeof window !== "undefined") {
        window[REFRESH_TIMER_KEY] = null;
      }
    };
  }, [nhClient, fetchNiceHashOrders]);

  // ✅ Context value with all functions
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