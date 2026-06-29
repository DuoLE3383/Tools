// MiningWorkspaceProvider.jsx - FIXED price fetching

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchMiningStats } from "./miningStatsFetcher";
import {
  buildOpportunityRows,
  mergeMiningRoutes,
  normalizeHeroRows,
  normalizeMrrMarketRows,
  normalizeMiningDutchRows,
} from "./miningWorkspaceData";
import { getNiceHashPriceValue } from "../../core/mrrUtils";

const MiningWorkspaceContext = createContext(null);

export function MiningWorkspaceProvider({ children, onCall, nhClient = "VN" }) {
  const [heroStats, setHeroStats] = useState(null);
  const [dutchStats, setDutchStats] = useState(null);
  const [mrrMarketStats, setMrrMarketStats] = useState(null);
  const [niceHashPrices, setNiceHashPrices] = useState({});

  // ✅ Separate loading/error states for each data source
  const [heroLoading, setHeroLoading] = useState(false);
  const [dutchLoading, setDutchLoading] = useState(false);
  const [mrrLoading, setMrrLoading] = useState(false);
  const [heroError, setHeroError] = useState("");
  const [dutchError, setDutchError] = useState("");
  const [mrrError, setMrrError] = useState("");

  const [lastUpdated, setLastUpdated] = useState("");
  const [priceFetchStatus, setPriceFetchStatus] = useState({});

  const refresh = useCallback(
    async (force = false) => {
      // ✅ Reset errors and set loading states individually
      setHeroLoading(true);
      setDutchLoading(true);
      setMrrLoading(true);
      setHeroError("");
      setDutchError("");
      setMrrError("");
      setPriceFetchStatus({});

      try {
        // 1. FETCH HERO MINERS DATA
        setHeroLoading(true);
        const heroResult = await fetchMiningStats(
          "herominers",
          "VN",
          null,
          null,
          20000,
          force,
        ).catch(err => {
          console.warn("HeroMiners fetch failed:", err);
          setHeroError(err.message || "Failed to fetch");
          return null;
        });
        setHeroLoading(false);

        // 2. FETCH MINING-DUTCH DATA
        setDutchLoading(true);
        const dutchResult = await fetchMiningStats(
          "miningdutch",
          "VN",
          null,
          null,
          20000,
          force,
        ).catch(err => {
          console.warn("Mining-Dutch fetch failed:", err);
          setDutchError(err.message || "Failed to fetch");
          return null;
        });
        setDutchLoading(false);

        // 3. FETCH MRR MARKET DATA
        setMrrLoading(true);
        let mrrResult = null;
        if (typeof onCall === "function") {
          try {
            mrrResult = await onCall("/api/v2/mrr/rentals", {
              query: { client: nhClient, type: "sold", limit: 100 },
              silent: true,
            });
            console.log("✅ MRR API Response:", mrrResult);
          } catch (err) {
            setMrrError(err.message || "Failed to fetch");
            console.warn("MRR fetch failed:", err);
          }
        }
        setMrrLoading(false);

        // Set states
        if (heroResult) setHeroStats(heroResult);
        if (dutchResult) setDutchStats(dutchResult);
        if (mrrResult) setMrrMarketStats(mrrResult);

        // ✅ Throw error only if ALL sources fail
        if (!heroResult && !dutchResult) {
          throw new Error("Failed to load mining workspace data");
        }

        // Normalize data
        const nextHeroRows = normalizeHeroRows(heroResult);
        const nextDutchRows = normalizeMiningDutchRows(dutchResult);
        const nextMrrMarketRows = normalizeMrrMarketRows(mrrResult);

        console.log(`📊 Data counts: Hero=${nextHeroRows.length}, Dutch=${nextDutchRows.length}, MRR=${nextMrrMarketRows.length}`);

        // ✅ Get all unique algos from both sources
        const algos = Array.from(
          new Set([
            ...nextHeroRows.map((row) => row.nicehashAlgo),
            ...nextDutchRows.map((row) => row.nicehashAlgo),
          ])
        ).filter((algo) => algo && algo !== "UNKNOWN");

        console.log(`🔍 Algorithms to fetch: ${algos.length}`, algos);

        // ✅ Fetch NiceHash prices for each algorithm
        let nextNiceHashPrices = {};
        let priceStatus = {};

        if (typeof onCall === "function" && algos.length > 0) {
          // ✅ Try multiple methods to get prices
          const pricePairs = await Promise.all(
            algos.map(async (algo) => {
              let price = 0;
              let success = false;
              let method = "";

              // ✅ Try 1: Direct algorithm name
              try {
                const data = await onCall("/api/v2/hashpower/order/price", {
                  query: { 
                    algorithm: algo, 
                    market: "USA", 
                    client: nhClient 
                  },
                  silent: true,
                });
                price = getNiceHashPriceValue(data);
                if (price > 0) {
                  success = true;
                  method = "direct";
                  console.log(`✅ NH price ${algo}: ${price} (direct)`);
                }
              } catch (e1) {
                // Silent fail
              }

              // ✅ Try 2: Use market price API
              if (!success) {
                try {
                  const data = await onCall("/api/v2/hashpower/order-book", {
                    query: { 
                      algorithm: algo, 
                      market: "USA", 
                      client: nhClient 
                    },
                    silent: true,
                  });
                  if (data?.buy && data.buy.length > 0) {
                    const highestBuy = data.buy.sort((a, b) => 
                      parseFloat(b.price || 0) - parseFloat(a.price || 0)
                    )[0];
                    price = parseFloat(highestBuy.price || 0);
                    if (price > 0) {
                      success = true;
                      method = "orderbook";
                      console.log(`✅ NH price ${algo}: ${price} (orderbook)`);
                    }
                  }
                } catch (e2) {
                  // Silent fail
                }
              }

              // ✅ Try 3: Check active orders
              if (!success) {
                try {
                  const data = await onCall("/api/v2/hashpower/myOrders", {
                    query: { 
                      op: "LE", 
                      limit: 100, 
                      client: nhClient,
                      algorithm: algo 
                    },
                    silent: true,
                  });
                  const orders = data?.list || data?.myOrders || [];
                  const activeOrders = orders.filter(o => 
                    (o.status?.code || o.status) === "ACTIVE"
                  );
                  if (activeOrders.length > 0) {
                    const orderPrices = activeOrders.map(o => 
                      parseFloat(o.price || 0)
                    ).filter(p => p > 0);
                    if (orderPrices.length > 0) {
                      price = Math.max(...orderPrices);
                      success = true;
                      method = "active-orders";
                      console.log(`✅ NH price ${algo}: ${price} (active orders)`);
                    }
                  }
                } catch (e3) {
                  // Silent fail
                }
              }

              // ✅ Try 4: Use pool revenue as fallback
              if (!success) {
                const dutchAlgo = nextDutchRows.find(r => r.nicehashAlgo === algo);
                if (dutchAlgo && dutchAlgo.btcPerDay > 0) {
                  price = dutchAlgo.btcPerDay * 0.85; // 85% of pool as fallback
                  success = true;
                  method = "pool-proxy";
                  priceStatus[algo] = `Using pool proxy (${dutchAlgo.btcPerDay})`;
                  console.log(`🔄 NH fallback ${algo}: ${price} (pool proxy)`);
                } else {
                  priceStatus[algo] = "No price available";
                }
              } else {
                priceStatus[algo] = `OK (${method})`;
              }

              return [algo, price || 0];
            }),
          );

          nextNiceHashPrices = Object.fromEntries(pricePairs);
          setNiceHashPrices(nextNiceHashPrices);
          setPriceFetchStatus(priceStatus);
        }

        // Merge and build opportunities
        const nextRoutes = mergeMiningRoutes(nextDutchRows, nextHeroRows, nextNiceHashPrices);
        const nextOpportunities = buildOpportunityRows(nextRoutes, nextNiceHashPrices, nextMrrMarketRows);

        console.log(`📊 Opportunities: ${nextOpportunities.length}`);
        console.log("🏆 Best opportunity:", nextOpportunities[0]);

        // Send training snapshot
        if (typeof onCall === "function") {
          try {
            await onCall("/api/v2/mining/training-snapshot", {
              method: "POST",
              body: {
                capturedAt: new Date().toISOString(),
                nhClient,
                heroRows: nextHeroRows,
                miningDutchRows: nextDutchRows,
                mrrMarketRows: nextMrrMarketRows,
                routes: nextRoutes,
                opportunities: nextOpportunities,
                niceHashPrices: nextNiceHashPrices,
                priceFetchStatus: priceStatus,
                summary: {
                  bestAlgo: nextOpportunities[0]?.nicehashAlgo || "",
                  bestWinner: nextOpportunities[0]?.winner || "",
                  bestScore: nextOpportunities[0]?.opportunityScore || 0,
                },
              },
              silent: true,
            });
          } catch {
            // Silent fail
          }
        }

        setLastUpdated(new Date().toISOString());
      } catch (err) {
      }
    },
    [nhClient, onCall],
  );

  useEffect(() => {
    queueMicrotask(() => {
      void refresh(false);
    });
  }, [refresh]);

  // Memoized values
  const heroRows = useMemo(() => normalizeHeroRows(heroStats), [heroStats]);
  const miningDutchRows = useMemo(
    () => normalizeMiningDutchRows(dutchStats),
    [dutchStats],
  );
  const mrrMarketRows = useMemo(
    () => normalizeMrrMarketRows(mrrMarketStats),
    [mrrMarketStats],
  );
  const routes = useMemo(
    () => mergeMiningRoutes(miningDutchRows, heroRows, niceHashPrices),
    [heroRows, miningDutchRows, niceHashPrices],
  );
  const opportunities = useMemo(
    () => buildOpportunityRows(routes, niceHashPrices, mrrMarketRows),
    [mrrMarketRows, niceHashPrices, routes],
  );

  const value = useMemo(
    () => ({
      heroStats,
      dutchStats,
      mrrMarketStats,
      routes,
      opportunities,
      niceHashPrices,
      lastUpdated,
      priceFetchStatus,
      refresh,
      // ✅ Expose individual loading/error states
      heroLoading,
      dutchLoading,
      mrrLoading,
      loading: heroLoading || dutchLoading || mrrLoading, // Combined loading state
      heroError,
      dutchError,
      mrrError,
      error: heroError || dutchError || mrrError, // Combined error state
      // ✅ Expose boolean flags for data presence
      hasHeroData: !!heroStats?.coinStats?.length,
      hasDutchData: !!dutchStats?.coinStats?.length,
    }),
    [
      dutchStats,
      heroStats,
      lastUpdated,
      mrrMarketStats,
      niceHashPrices,
      opportunities,
      priceFetchStatus,
      refresh,
      routes,
      heroLoading,
      dutchLoading,
      mrrLoading,
      heroError,
      dutchError,
      mrrError,
    ],
  );

  return (
    <MiningWorkspaceContext.Provider value={value}>
      {children}
    </MiningWorkspaceContext.Provider>
  );
}

export function useMiningWorkspace() {
  const context = useContext(MiningWorkspaceContext);
  if (!context) {
    throw new Error(
      "useMiningWorkspace must be used within a MiningWorkspaceProvider",
    );
  }
  return context;
}