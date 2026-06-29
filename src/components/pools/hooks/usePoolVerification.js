// components/pools/hooks/usePoolVerification.js
import { useState, useCallback } from "react";
import { poolHelpers as ph, poolApi, sanitizeNhClientTag } from "../../../core/poolUtils";
import { getAlgoDisplayName } from "../../../core/poolUtils";

export function usePoolVerification({ onCall, nhClient, pools, filePools, extractedPools, useExtractedPools, verifyFromFile }) {
  const [selected, setSelected] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [response, setResponse] = useState(null);
  const [verifyResults, setVerifyResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState("");

  const getActivePoolSource = useCallback(() => {
    return verifyFromFile
      ? filePools
      : useExtractedPools
        ? extractedPools
        : pools;
  }, [verifyFromFile, filePools, useExtractedPools, extractedPools, pools]);

  const verifyPool = useCallback(async (pool) => {
    if (!pool) {
      setError("Select a pool first.");
      return;
    }

    if (pool.name?.toLowerCase() === "active") {
      return;
    }

    setLoading(true);
    setResponse(null);
    setError("");

    const payload = ph.buildVerifyBody(pool);
    const missingFields = ph.getMissingVerifyFields(payload);
    if (missingFields.length > 0) {
      const poolId = ph.getId(pool);
      if (poolId) {
        try {
          const targetClient = sanitizeNhClientTag(pool.nhClient || pool.client, nhClient);
          const details = (await poolApi.get(poolId, targetClient)).data;
          const fullPayload = ph.buildVerifyBody(details);
          return await performVerification(fullPayload, details);
        } catch (e) {
          setError(`Details Error: ${e.message}`);
          setLoading(false);
          return;
        }
      }
      setError(`Missing required verify fields: ${missingFields.join(", ")}`);
      setLoading(false);
      return;
    }
    await performVerification(payload, pool);
  }, [nhClient]);

  const performVerification = useCallback(async (payload, poolDetails) => {
    try {
      const targetClient = sanitizeNhClientTag(
        poolDetails.nhClient || poolDetails.client,
        nhClient,
      );
      const result = await poolApi.verify(payload, targetClient);
      
      const enrichedResult = { ...result, poolDetails, requestBody: payload };
      setResponse(enrichedResult);
      setVerifyResults([
        {
          key: selectedId,
          label: selected ? ph.getLabel(selected) : selectedId,
          algorithm: ph.getAlgo(selected),
          result: enrichedResult,
        },
      ]);
      if (!result.ok) {
        setError(result.data?.error || result.data?.message || result.status);
      }
      return enrichedResult;
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [nhClient, selected, selectedId]);

  const verifyAllOnce = useCallback(async (options = {}) => {
    const { targetPools = null, resetStop = true, keepRunning = false } = options;
    const source = targetPools || getActivePoolSource();
    
    if (!Array.isArray(source) || source.length === 0) return;
    
    // Implementation details...
    // (Move the verification loop logic here)
  }, [getActivePoolSource]);

  const verifyAlgorithm = useCallback((algorithm) => {
    const base = getActivePoolSource();
    const targetPools = base.filter((pool) => ph.getAlgo(pool) === algorithm);
    verifyAllOnce({ targetPools });
  }, [getActivePoolSource, verifyAllOnce]);

  const getAlgoCountsSummary = useCallback((results) => {
    const counts = results.reduce((acc, item) => {
      const algorithm = item.algorithm || ph.getVerifyAlgo(item.result);
      acc[algorithm] = (acc[algorithm] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([algo, count]) => `${getAlgoDisplayName(algo)}: ${count}`)
      .join(", ");
  }, []);

  return {
    selected,
    selectedId,
    setSelected,
    setSelectedId,
    response,
    setResponse,
    verifyResults,
    setVerifyResults,
    loading,
    detailsLoading,
    error,
    setError,
    verifyPool,
    verifyAllOnce,
    verifyAlgorithm,
    getAlgoCountsSummary,
  };
}