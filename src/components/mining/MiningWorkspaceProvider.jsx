// MiningWorkspaceProvider.jsx - COMPLETE FIX WITH ALL ENDPOINTS
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
  normalize2MinersRows,
  normalizeMiningDutchRows,
} from "./miningWorkspaceData";
import { getNiceHashPriceValue } from "../../core/mrrUtils";

const MiningWorkspaceContext = createContext(null);

// Map algorithms for proper matching
const ALGO_MAPPING = {
  "randomx": "RANDOMXMONERO",
  "cryptonight": "CRYPTONIGHT",
  "kawpow": "KAWPOW",
  "equihash": "EQUIHASH",
  "sha256": "SHA256",
  "scrypt": "SCRYPT",
  "x11": "X11",
  "ethash": "ETHASH",
  "etchash": "ETCHASH",
};

export function MiningWorkspaceProvider({ children, onCall, nhClient = "VN" }) {
  const [heroStats, setHeroStats] = useState(null);
  const [dutchStats, setDutchStats] = useState(null);
  const [twoMinersStats, setTwoMinersStats] = useState(null);
  const [mrrMarketStats, setMrrMarketStats] = useState(null);
  const [niceHashPrices, setNiceHashPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [priceFetchStatus, setPriceFetchStatus] = useState({});
  const heroStatsRef = useRef(null);
  const dutchStatsRef = useRef(null);
  const twoMinersStatsRef = useRef(null);
  const mrrMarketStatsRef = useRef(null);

  useEffect(() => {
    heroStatsRef.current = heroStats;
  }, [heroStats]);

  useEffect(() => {
    dutchStatsRef.current = dutchStats;
  }, [dutchStats]);

  useEffect(() => {
    twoMinersStatsRef.current = twoMinersStats;
  }, [twoMinersStats]);

  useEffect(() => {
    mrrMarketStatsRef.current = mrrMarketStats;
  }, [mrrMarketStats]);

  const refresh = useCallback(
    async (force = false) => {
      setLoading(true);
      setError("");
      setPriceFetchStatus({});

      try {
        const [heroResult, dutchResult, twoMinersResult, mrrResult] = await Promise.allSettled([
            fetchMiningStats("herominers", "VN", null, null, 20000, force),
            fetchMiningStats("miningdutch", "VN", null, null, 20000, force),
            fetchMiningStats("2miners", "VN", null, null, 20000, force),
            typeof onCall === 'function' ? onCall("/api/v2/mrr/rentals", { query: { client: nhClient, type: "sold", limit: 100 }, silent: true }) : Promise.resolve(null)
        ]);

        const hero = heroResult.status === 'fulfilled' ? heroResult.value : heroStatsRef.current;
        const dutch = dutchResult.status === 'fulfilled' ? dutchResult.value : dutchStatsRef.current;
        const twoMiners = twoMinersResult.status === 'fulfilled' ? twoMinersResult.value : twoMinersStatsRef.current;
        const mrrMarket = mrrResult.status === 'fulfilled' ? mrrResult.value : mrrMarketStatsRef.current;

        // Set states
        if (hero) setHeroStats(hero);
        if (dutch) setDutchStats(dutch);
        if (twoMiners) setTwoMinersStats(twoMiners);
        if (mrrMarket) setMrrMarketStats(mrrMarket);

        if (!hero && !dutch) {
          throw new Error("Failed to load mining workspace data");
        }

        // Normalize data
        const nextHeroRows = normalizeHeroRows(hero);
        const nextDutchRows = normalizeMiningDutchRows(dutch);
        const nextTwoMinersRows = normalize2MinersRows(twoMiners);
        const nextMrrMarketRows = normalizeMrrMarketRows(mrrMarket);

        console.log(`📊 Data counts: Hero=${nextHeroRows.length}, Dutch=${nextDutchRows.length}, 2Miners=${nextTwoMinersRows.length}, MRR=${nextMrrMarketRows.length}`);
        console.log("🔍 MRR Market Rows:", nextMrrMarketRows);

        // Get all unique algos
        const algos = Array.from(
          new Set([
            ...nextHeroRows.map((row) => row.nicehashAlgo),
            ...nextDutchRows.map((row) => row.nicehashAlgo),
            ...nextTwoMinersRows.map((row) => row.nicehashAlgo),
          ])
        ).filter((algo) => algo && algo !== "UNKNOWN");

        console.log(`🔍 Algorithms to fetch: ${algos.length}`, algos);

        // Fetch NiceHash prices
        let nextNiceHashPrices = {};
        let priceStatus = {};

        if (typeof onCall === "function" && algos.length > 0) {
          const pricePairs = await Promise.all(
            algos.map(async (algo) => {
              try {
                let price = 0;
                let success = false;

                // Try 1: Direct algorithm name
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
                    console.log(`✅ NH price ${algo}: ${price}`);
                  }
                } catch (e1) {
                  // Silent fail
                }

                // Try 2: Mapped algorithm name
                if (!success && ALGO_MAPPING[algo.toLowerCase()]) {
                  try {
                    const mappedAlgo = ALGO_MAPPING[algo.toLowerCase()];
                    const data = await onCall("/api/v2/hashpower/order/price", {
                      query: { 
                        algorithm: mappedAlgo, 
                        market: "USA", 
                        client: nhClient 
                      },
                      silent: true,
                    });
                    price = getNiceHashPriceValue(data);
                    if (price > 0) {
                      success = true;
                      console.log(`✅ NH price ${algo} (mapped to ${mappedAlgo}): ${price}`);
                    }
                  } catch (e2) {
                    // Silent fail
                  }
                }

                // Try 3: Use pool revenue as fallback
                if (!success) {
                  const dutchAlgo = nextDutchRows.find(r => r.nicehashAlgo === algo);
                  if (dutchAlgo && dutchAlgo.btcPerDay > 0) {
                    price = dutchAlgo.btcPerDay * 0.8; // 80% of pool as fallback
                    success = true;
                    priceStatus[algo] = "Using pool proxy";
                    console.log(`🔄 NH fallback ${algo}: ${price}`);
                  } else {
                    priceStatus[algo] = "No price available";
                  }
                } else {
                  priceStatus[algo] = "OK";
                }

                return [algo, price || 0];
              } catch (err) {
                console.error(`❌ NH price error for ${algo}:`, err);
                priceStatus[algo] = `Error: ${err.message}`;
                return [algo, 0];
              }
            }),
          );

          nextNiceHashPrices = Object.fromEntries(pricePairs);
          setNiceHashPrices(nextNiceHashPrices);
          setPriceFetchStatus(priceStatus);
        }

        // Merge and build opportunities
        const nextRoutes = mergeMiningRoutes(nextDutchRows, nextHeroRows, nextTwoMinersRows, nextNiceHashPrices);
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
        console.error("❌ Refresh error:", err);
        setError(err.message || "Failed to load mining workspace data");
      } finally {
        setLoading(false);
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
  const twoMinersRows = useMemo(
    () => normalize2MinersRows(twoMinersStats),
    [twoMinersStats],
  );
  const mrrMarketRows = useMemo(
    () => normalizeMrrMarketRows(mrrMarketStats),
    [mrrMarketStats],
  );
  const routes = useMemo(
    () => mergeMiningRoutes(miningDutchRows, heroRows, twoMinersRows, niceHashPrices),
    [heroRows, miningDutchRows, twoMinersRows, niceHashPrices],
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
      twoMinersStats,
      heroRows,
      miningDutchRows,
      routes,
      opportunities,
      niceHashPrices,
      loading,
      error,
      lastUpdated,
      priceFetchStatus,
      refresh,
    }),
    [
      dutchStats,
      error,
      heroRows,
      heroStats,
      lastUpdated,
      loading,
      miningDutchRows,
      twoMinersStats,
      mrrMarketStats,
      niceHashPrices,
      opportunities,
      priceFetchStatus,
      refresh,
      routes,
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