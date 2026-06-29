// MiningWorkspaceProvider.jsx - UPGRADED WITH HEROMINERS

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  normalizeMiningDutchRows,
  normalizeHeroRows,
  mergeMiningRoutes,
  normalizeMrrMarketRows,
  buildOpportunityRows,
} from './miningWorkspaceData';

// Create context
const MiningWorkspaceContext = createContext(null);

export function MiningWorkspaceProvider({ children, onCall, nhClient = "VN" }) {
  // Core state
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [niceHashPrices, setNiceHashPrices] = useState({});
  const [mrrMarketData, setMrrMarketData] = useState([]);
  
  // HeroMiners state
  const [heroGlobalStats, setHeroGlobalStats] = useState(null);
  const [heroLoading, setHeroLoading] = useState(false);
  const [heroError, setHeroError] = useState(null);
  const [heroLastUpdated, setHeroLastUpdated] = useState(null);

  // Mining Dutch state (separate for debugging)
  const [miningDutchStats, setMiningDutchStats] = useState(null);
  const [dutchLoading, setDutchLoading] = useState(false);
  const [dutchError, setDutchError] = useState(null);

  // ============================================
  // FETCH ALL DATA
  // ============================================
  const fetchData = useCallback(async (force = false) => {
    if (!onCall) {
      console.warn('[MiningWorkspace] onCall function not provided');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Fetch all data in parallel
      const [
        miningDutchResult,
        heroMinersResult,
        niceHashPricesResult,
        mrrMarketResult, // This will be from /info/algos now
      ] = await Promise.all([
        onCall('/api/v2/miningdutch/global-stats', { silent: true }), // This endpoint is correct
        onCall('/api/v2/mining-stats/herominers/global', { query: { client: 'VN' }, silent: true }), // ✅ FIX: Use the global endpoint
        onCall('/api/v2/hashpower/myOrders', { query: { client: nhClient, op: 'LE' }, silent: true }), // ✅ FIX: Fetch active orders to derive prices
        onCall('/api/v2/mrr/info/algos', { query: { client: 'ALL' }, silent: true }), // ✅ FIX: Use the correct endpoint for MRR market data
      ]);

      // Store raw data for debugging
      setMiningDutchStats(miningDutchResult);
      setHeroGlobalStats(heroMinersResult);
      
      // Normalize data
      const dutchRows = normalizeMiningDutchRows(miningDutchResult);
      const heroRows = normalizeHeroRows(heroMinersResult);
      
      // Extract prices
      const prices = niceHashPricesResult?.list || niceHashPricesResult?.myOrders || {};
      setNiceHashPrices(prices);
      
      // MRR market data
      const mrrRows = normalizeMrrMarketRows(mrrMarketResult?.data || mrrMarketResult);
      setMrrMarketData(mrrRows);
      
      // Merge routes with HeroMiners data
      const mergedRoutes = mergeMiningRoutes(dutchRows, heroRows, prices);
      
      // Build opportunity rows with HeroMiners included
      const opportunityRows = buildOpportunityRows(mergedRoutes, prices, mrrRows, heroRows);
      
      setOpportunities(opportunityRows);
      setLastUpdated(new Date());
      setHeroLastUpdated(new Date());
      
    } catch (err) {
      setError(err.message || 'Failed to fetch mining data');
      console.error('[MiningWorkspace] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [onCall, nhClient]);

  // ============================================
  // FETCH ONLY HEROMINERS
  // ============================================
  const fetchHeroMinersOnly = useCallback(async (force = false) => {
    if (!onCall) return;
    setHeroLoading(true);
    setHeroError(null);
    try {
      const result = await onCall('/api/v2/mining-stats/herominers', { 
        query: { client: 'VN' }, 
        silent: true 
      });
      if (result?.success || result?.coinStats) {
        setHeroGlobalStats(result);
        setHeroLastUpdated(new Date());
      } else {
        setHeroError(result?.error || "Failed to fetch HeroMiners stats.");
      }
    } catch (err) {
      setHeroError(err.message || "Failed to fetch HeroMiners stats.");
    } finally {
      setHeroLoading(false);
    }
  }, [onCall]);

  // ============================================
  // FETCH ONLY MINING DUTCH
  // ============================================
  const fetchMiningDutchOnly = useCallback(async (force = false) => {
    if (!onCall) return;
    setDutchLoading(true);
    setDutchError(null);
    try {
      const result = await onCall('/api/v2/miningdutch/global-stats', { silent: true });
      if (result?.success || result?.coinStats) {
        setMiningDutchStats(result);
      } else {
        setDutchError(result?.error || "Failed to fetch Mining Dutch stats.");
      }
    } catch (err) {
      setDutchError(err.message || "Failed to fetch Mining Dutch stats.");
    } finally {
      setDutchLoading(false);
    }
  }, [onCall]);

  // ============================================
  // REFRESH ALL DATA
  // ============================================
  const refreshAll = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  // ============================================
  // INITIAL FETCH
  // ============================================
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ============================================
  // AUTO-REFRESH (60 seconds)
  // ============================================
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(true);
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ============================================
  // CONTEXT VALUE
  // ============================================
  const value = useMemo(() => ({
    // Core data
    opportunities,
    loading,
    error,
    lastUpdated,
    refresh: refreshAll,
    niceHashPrices,
    mrrMarketData,
    
    // HeroMiners data
    heroStats: heroGlobalStats,
    heroLoading,
    heroError,
    heroLastUpdated,
    refreshHero: fetchHeroMinersOnly,
    
    // Mining Dutch data
    dutchStats: miningDutchStats,
    dutchLoading,
    dutchError,
    refreshDutch: fetchMiningDutchOnly,
    
    // Combined refresh
    refreshAll,
    
    // Raw data access (for debugging)
    rawData: {
      hero: heroGlobalStats,
      dutch: miningDutchStats,
      prices: niceHashPrices,
      mrr: mrrMarketData,
    },
    
    // Status flags
    isReady: !loading && !error && opportunities.length > 0,
    hasHeroData: heroGlobalStats !== null && !heroError,
    hasDutchData: miningDutchStats !== null && !dutchError,
    
  }), [
    opportunities,
    loading,
    error,
    lastUpdated,
    refreshAll,
    niceHashPrices,
    mrrMarketData,
    heroGlobalStats,
    heroLoading,
    heroError,
    heroLastUpdated,
    fetchHeroMinersOnly,
    miningDutchStats,
    dutchLoading,
    dutchError,
    fetchMiningDutchOnly,
  ]);

  return (
    <MiningWorkspaceContext.Provider value={value}>
      {children}
    </MiningWorkspaceContext.Provider>
  );
}

// ============================================
// HOOK
// ============================================
export function useMiningWorkspace() {
  const context = useContext(MiningWorkspaceContext);
  if (!context) {
    throw new Error('useMiningWorkspace must be used within a MiningWorkspaceProvider');
  }
  return context;
}

export default MiningWorkspaceProvider;