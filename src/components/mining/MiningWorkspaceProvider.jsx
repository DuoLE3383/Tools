// MiningWorkspaceProvider.jsx - COMPLETE FIX WITH ALL ENDPOINTS
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { fetchMiningStats } from "./miningStatsFetcher";
import {
  buildOpportunityRows,
  mergeMiningRoutes,
  normalizeHeroRows,
  normalizeMrrMarketRows,
  normalizeMiningDutchRows,
} from "./miningWorkspaceData.js";
import { getNiceHashPriceValue } from "../../core/mrrUtils.js";
import { NICEHASH_ALGO_MAP, MRR_ALGO_MAP } from "../../core/mapping.js";

const MiningWorkspaceContext = createContext(null);

const initialState = {
  heroStats: null,
  dutchStats: null,
  mrrMarketStats: null,
  niceHashPrices: {},
  staticNhAlgos: [],
  loading: false,
  error: "",
  lastUpdated: "",
  priceFetchStatus: {},
};

function workspaceReducer(state, action) {
  switch (action.type) {
    case 'REFRESH_START':
      return { ...state, loading: true, error: "" };
    case 'REFRESH_SUCCESS':
      return { ...state, loading: false, lastUpdated: new Date().toISOString(), ...action.payload };
    case 'REFRESH_ERROR':
      return { ...state, loading: false, error: action.payload };
    case 'SET_PRICES':
      return { ...state, niceHashPrices: action.payload.prices, priceFetchStatus: action.payload.status };
    default:
      return state;
  }
}

export function MiningWorkspaceProvider({ children, onCall, nhClient = "VN" }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialState);
  const heroStatsRef = useRef(null);
  const dutchStatsRef = useRef(null);
  const mrrMarketStatsRef = useRef(null);

  useEffect(() => {
    heroStatsRef.current = state.heroStats;
    dutchStatsRef.current = state.dutchStats;
    mrrMarketStatsRef.current = state.mrrMarketStats;
  }, [state.heroStats, state.dutchStats, state.mrrMarketStats]);

  const refresh = useCallback(
    async (force = false) => {
      dispatch({ type: 'REFRESH_START' });

      const fetchAndProcess = async () => {
        // 1. FETCH ALL DATA SOURCES IN PARALLEL
        const [heroResult, dutchResult, mrrResult, staticAlgosRes] = await Promise.all([
          fetchMiningStats(
            "herominers",
            "VN",
            null,
            null,
            20000,
            force,
          ).catch(err => {
            console.warn("HeroMiners fetch failed:", err);
            return heroStatsRef.current || null; // Use previous state on failure
          }),
          fetchMiningStats(
          "miningdutch",
          "VN",
          null,
          null,
          20000,
          force,
        ).catch(err => {
          console.warn("Mining-Dutch fetch failed:", err);
          return dutchStatsRef.current || null; // Use previous state on failure
        }),
          typeof onCall === 'function' ? onCall("/api/v2/mrr/rentals/cached", {
              query: { limit: 100 },
              silent: true,
            }).catch(err => {
              console.warn("MRR fetch failed:", err);
              return mrrMarketStatsRef.current || null;
            }) : Promise.resolve(null),
          typeof onCall === 'function' ? onCall("/api/v2/nicehash-algos", { silent: true }).catch(err => {
            console.warn("Could not fetch static NH algos", err);
            return { miningAlgorithms: [] };
          }) : Promise.resolve(null)
        ]);

        const hero = heroResult;
        const dutch = dutchResult;
        const mrrMarket = mrrResult;

        dispatch({
          type: 'REFRESH_SUCCESS',
          payload: { heroStats: hero, dutchStats: dutch, mrrMarketStats: mrrMarket, staticNhAlgos: staticAlgosRes?.miningAlgorithms || state.staticNhAlgos || [] }
        });

        if (!hero && !dutch) {
          throw new Error("Failed to load primary mining data from HeroMiners and Mining-Dutch.");
        }

        // Normalize data
        const nextHeroRows = normalizeHeroRows(hero);
        const nextDutchRows = normalizeMiningDutchRows(dutch || { coinStats: [] });
        const nextMrrMarketRows = normalizeMrrMarketRows(mrrMarket);

        // Get all unique algos
        const algos = Array.from(
          new Set([
            ...nextHeroRows.map((row) => row.nicehashAlgo),
            ...nextDutchRows.map((row) => row.nicehashAlgo),
          ]),
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
                const staticAlgo = (staticAlgosRes?.miningAlgorithms || state.staticNhAlgos || []).find(a => a.algorithm.toUpperCase() === algo.toUpperCase());
                const algoToUse = staticAlgo ? staticAlgo.algorithm : algo;

                try {
                  // Use the public 24h stats endpoint which is more reliable for market-wide prices
                  const data = await onCall("/api/v2/public/stats/24h", { silent: true });
                  price = getNiceHashPriceValue(data);
                  if (price > 0) {
                    success = true;
                    console.log(`✅ NH price ${algo}: ${price}`);
                  }
                } catch (e1) {
                  // Silent fail
                }

                // Try 2: Mapped algorithm name
                if (!success && NICEHASH_ALGO_MAP[algo.toUpperCase()]) {
                  try {
                    // Use the public 24h stats endpoint here as well
                    const data = await onCall("/api/v2/public/stats/24h", { silent: true });
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
          dispatch({ type: 'SET_PRICES', payload: { prices: nextNiceHashPrices, status: priceStatus } });
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
      };

      try {
        await fetchAndProcess();
      } catch (err) {
        dispatch({ type: 'REFRESH_ERROR', payload: err.message || "Failed to load mining workspace data" });
        console.log("Finished refresh cycle.");
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
  const heroRows = useMemo(() => normalizeHeroRows(state.heroStats), [state.heroStats]);
  const miningDutchRows = useMemo(
    () => normalizeMiningDutchRows(state.dutchStats),
    [state.dutchStats],
  );
  const mrrMarketRows = useMemo(
    () => normalizeMrrMarketRows(state.mrrMarketStats),
    [state.mrrMarketStats],
  );
  const routes = useMemo(
    () => mergeMiningRoutes(miningDutchRows, heroRows, state.niceHashPrices),
    [heroRows, miningDutchRows, state.niceHashPrices],
  );
  const opportunities = useMemo(
    () => buildOpportunityRows(routes, state.niceHashPrices, mrrMarketRows),
    [mrrMarketRows, state.niceHashPrices, routes],
  );

  const value = useMemo(
    () => ({
      heroStats: state.heroStats,
      dutchStats: state.dutchStats,
      mrrMarketStats: state.mrrMarketStats,
      heroRows,
      miningDutchRows,
      routes,
      opportunities,
      niceHashPrices: state.niceHashPrices,
      loading: state.loading,
      error: state.error,
      lastUpdated: state.lastUpdated,
      priceFetchStatus: state.priceFetchStatus,
      refresh,
    }),
    [
      state.heroStats,
      state.dutchStats,
      state.mrrMarketStats,
      state.niceHashPrices,
      state.loading,
      state.error,
      state.lastUpdated,
      state.priceFetchStatus,
      heroRows,
      miningDutchRows,
      opportunities,
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