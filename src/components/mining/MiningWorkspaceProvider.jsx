// MiningWorkspaceProvider.jsx - ADDED MORE PROVIDERS

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
  normalizeMinerstatRows, // Assuming these will be in miningWorkspaceData.js
  normalizeWtmRows,
  normalizeHashrateNoRows,
} from "./miningWorkspaceData";
import { getNiceHashPriceValue } from "../../core/mrrUtils";

const MiningWorkspaceContext = createContext(null);

export function MiningWorkspaceProvider({ children, onCall, nhClient = "VN", mrrClient = "BT" }) {
  const [heroStats, setHeroStats] = useState(null);
  const [dutchStats, setDutchStats] = useState(null);
  const [mrrMarketStats, setMrrMarketStats] = useState(null);
  const [minerstatStats, setMinerstatStats] = useState(null);
  const [wtmStats, setWtmStats] = useState(null);
  const [hashrateNoStats, setHashrateNoStats] = useState(null);
  const [niceHashPrices, setNiceHashPrices] = useState({});

  // Loading/error states for each data source
  const [heroLoading, setHeroLoading] = useState(false);
  const [dutchLoading, setDutchLoading] = useState(false);
  const [mrrLoading, setMrrLoading] = useState(false);
  const [minerstatLoading, setMinerstatLoading] = useState(false);
  const [wtmLoading, setWtmLoading] = useState(false);
  const [hashrateNoLoading, setHashrateNoLoading] = useState(false);

  const [heroError, setHeroError] = useState("");
  const [dutchError, setDutchError] = useState("");
  const [mrrError, setMrrError] = useState("");
  const [minerstatError, setMinerstatError] = useState("");
  const [wtmError, setWtmError] = useState("");
  const [hashrateNoError, setHashrateNoError] = useState("");

  const [lastUpdated, setLastUpdated] = useState("");
  const [priceFetchStatus, setPriceFetchStatus] = useState({});

  const refresh = useCallback(
    async (force = false) => {
      // ✅ Reset errors and set loading states individually
      const sources = [
        { name: 'HeroMiners', setLoading: setHeroLoading, setError: setHeroError },
        { name: 'Mining-Dutch', setLoading: setDutchLoading, setError: setDutchError },
        { name: 'MRR', setLoading: setMrrLoading, setError: setMrrError },
        { name: 'Minerstat', setLoading: setMinerstatLoading, setError: setMinerstatError },
        { name: 'WhatToMine', setLoading: setWtmLoading, setError: setWtmError },
        { name: 'Hashrate.no', setLoading: setHashrateNoLoading, setError: setHashrateNoError },
      ];

      sources.forEach(source => {
        source.setLoading(true);
        source.setError('');
      });

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
              query: { client: mrrClient, type: "sold", limit: 100 },
              silent: true,
            });
            console.log("✅ MRR API Response:", mrrResult);
          } catch (err) {
            setMrrError(err.message || "Failed to fetch");
            console.warn("MRR fetch failed:", err);
          }
        }
        setMrrLoading(false);

        // 4. FETCH MINERSTAT DATA
        setMinerstatLoading(true);
        const minerstatResult = await fetchMiningStats(
          "minerstat", "VN", null, null, 20000, force
        ).catch(err => {
          console.warn("Minerstat fetch failed:", err);
          setMinerstatError(err.message || "Failed to fetch");
          return null;
        });
        setMinerstatLoading(false);

        // 5. FETCH WHAT-TO-MINE DATA
        setWtmLoading(true);
        const wtmResult = await fetchMiningStats(
          "whattomine", "VN", null, null, 20000, force
        ).catch(err => {
          console.warn("WhatToMine fetch failed:", err);
          setWtmError(err.message || "Failed to fetch");
          return null;
        });
        setWtmLoading(false);

        // 6. FETCH HASHRATE.NO DATA
        setHashrateNoLoading(true);
        const hashrateNoResult = await fetchMiningStats(
          "hashrate.no", "VN", null, null, 20000, force
        ).catch(err => {
          console.warn("Hashrate.no fetch failed:", err);
          setHashrateNoError(err.message || "Failed to fetch");
          return null;
        });
        setHashrateNoLoading(false);

        // Set states
        if (heroResult) setHeroStats(heroResult);
        if (dutchResult) setDutchStats(dutchResult);
        if (mrrResult) setMrrMarketStats(mrrResult);
        if (minerstatResult) setMinerstatStats(minerstatResult);
        if (wtmResult) setWtmStats(wtmResult);
        if (hashrateNoResult) setHashrateNoStats(hashrateNoResult);

        // ✅ Throw error only if ALL sources fail
        if (!heroResult && !dutchResult && !minerstatResult && !wtmResult && !hashrateNoResult) {
          throw new Error("Failed to load mining workspace data");
        }

        // Normalize data
        const nextHeroRows = normalizeHeroRows(heroResult);
        const nextDutchRows = normalizeMiningDutchRows(dutchResult);
        const nextMrrMarketRows = normalizeMrrMarketRows(mrrResult);
        const nextMinerstatRows = normalizeMinerstatRows(minerstatResult);
        const nextWtmRows = normalizeWtmRows(wtmResult);
        const nextHashrateNoRows = normalizeHashrateNoRows(hashrateNoResult);

        console.log(`📊 Data counts: Hero=${nextHeroRows.length}, Dutch=${nextDutchRows.length}, MRR=${nextMrrMarketRows.length}, MS=${nextMinerstatRows.length}, WTM=${nextWtmRows.length}, HN=${nextHashrateNoRows.length}`);

        // ✅ Get all unique algos from both sources
        const algos = Array.from(
          new Set([
            ...nextHeroRows.map((row) => row.nicehashAlgo),
            ...nextDutchRows.map((row) => row.nicehashAlgo),
            ...nextMinerstatRows.map((row) => row.nicehashAlgo),
            ...nextWtmRows.map((row) => row.nicehashAlgo),
            ...nextHashrateNoRows.map((row) => row.nicehashAlgo),
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
        const nextRoutes = mergeMiningRoutes(
          nextDutchRows, 
          nextHeroRows, 
          nextMinerstatRows,
          nextWtmRows,
          nextHashrateNoRows,
          nextNiceHashPrices
        );
        const nextOpportunities = buildOpportunityRows(nextRoutes, nextNiceHashPrices, nextMrrMarketRows, nextHeroRows);

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
                minerstatRows: nextMinerstatRows,
                wtmRows: nextWtmRows,
                hashrateNoRows: nextHashrateNoRows,
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
  const minerstatRows = useMemo(() => normalizeMinerstatRows(minerstatStats), [minerstatStats]);
  const wtmRows = useMemo(() => normalizeWtmRows(wtmStats), [wtmStats]);
  const hashrateNoRows = useMemo(() => normalizeHashrateNoRows(hashrateNoStats), [hashrateNoStats]);
  const mrrMarketRows = useMemo(
    () => normalizeMrrMarketRows(mrrMarketStats),
    [mrrMarketStats],
  );
  const routes = useMemo(
    () => mergeMiningRoutes(
      miningDutchRows, 
      heroRows, 
      minerstatRows,
      wtmRows,
      hashrateNoRows,
      niceHashPrices
    ),
    [miningDutchRows, heroRows, minerstatRows, wtmRows, hashrateNoRows, niceHashPrices],
  );
  const opportunities = useMemo(
    () => buildOpportunityRows(routes, niceHashPrices, mrrMarketRows, heroRows),
    [mrrMarketRows, niceHashPrices, routes, heroRows],
  );

  const refreshHero = useCallback(() => refresh(true), [refresh]);

  const value = useMemo(
    () => ({
      heroStats,
      dutchStats,
      minerstatStats,
      wtmStats,
      hashrateNoStats,
      mrrMarketStats,
      routes,
      opportunities,
      niceHashPrices,
      lastUpdated,
      priceFetchStatus,
      refresh,
      refreshHero,
      // ✅ Expose individual loading/error states
      heroLoading,
      dutchLoading,
      mrrLoading,
      minerstatLoading,
      wtmLoading,
      hashrateNoLoading,
      loading: heroLoading || dutchLoading || mrrLoading || minerstatLoading || wtmLoading || hashrateNoLoading, // Combined loading state
      heroError,
      dutchError,
      mrrError,
      minerstatError,
      wtmError,
      hashrateNoError,
      error: heroError || dutchError || mrrError || minerstatError || wtmError || hashrateNoError, // Combined error state
      // ✅ Expose boolean flags for data presence
      hasHeroData: !!heroStats?.coinStats?.length,
      hasDutchData: !!dutchStats?.coinStats?.length,
      hasMinerstatData: !!minerstatStats?.coinStats?.length || Array.isArray(minerstatStats) && minerstatStats.length > 0,
      hasWtmData: !!wtmStats?.coinStats?.length || Array.isArray(wtmStats) && wtmStats.length > 0,
      hasHashrateNoData: !!hashrateNoStats?.coinStats?.length || Array.isArray(hashrateNoStats) && hashrateNoStats.length > 0,
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
      minerstatLoading,
      wtmLoading,
      hashrateNoLoading,
      heroError,
      dutchError,
      mrrError,
      minerstatError,
      wtmError,
      hashrateNoError,
      minerstatStats,
      wtmStats,
      hashrateNoStats,
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