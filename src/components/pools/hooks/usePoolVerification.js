// components/pools/hooks/usePoolVerification.js
import { useState, useCallback, useRef } from "react";
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
  
  // ✅ Add refs for tracking state
  const stopRef = useRef(false);
  const activeRequestRef = useRef(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [playing, setPlaying] = useState(false);

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

  // ✅ Complete verifyAllOnce with full verification loop
  const verifyAllOnce = useCallback(async (options = {}) => {
    const { 
      targetPools = null, 
      resetStop = true, 
      keepRunning = false,
      verificationDelay = 2345,
    } = options;
    
    const source = targetPools || getActivePoolSource();
    
    if (!Array.isArray(source) || source.length === 0 || playing) return;
    
    setPlaying(true);
    setError("");
    setResponse(null);
    // Don't clear verifyResults - we want to show progress
    setProgress({ current: 0, total: source.length });
    if (resetStop) stopRef.current = false;

    // Identify active pool IDs from NiceHash orders
    // This would need to be passed from parent or fetched
    const activePoolIds = new Set();

    try {
      for (let i = 0; i < source.length; i++) {
        // ✅ Check if stopped
        if (stopRef.current) break;

        const pool = source[i];
        const poolId = ph.getId(pool);
        const poolName = (pool.name || "").trim();
        const poolAlgo = ph.getAlgo(pool);
        const nameAlgoKey = `${poolName}|${poolAlgo}`;
        const key = ph.getKey(pool, i);
        const poolClient = sanitizeNhClientTag(pool.nhClient || pool.client, nhClient);

        let skipReason = "";
        if (pool.name?.toLowerCase() === "active") {
          skipReason = "Skipped: Active Pool";
        } else if (poolId && activePoolIds.has(String(poolId))) {
          skipReason = "Skipped: Active Order";
        }

        if (skipReason) {
          setVerifyResults((prev) => [
            ...prev.filter((item) => item.key !== key),
            {
              key,
              label: ph.getLabel(pool, i),
              result: { ok: true, data: { message: skipReason } },
              algorithm: poolAlgo,
            },
          ]);
          setProgress({ current: i + 1, total: source.length });
          continue;
        }

        const controller = new AbortController();
        activeRequestRef.current = controller;

        setVerifyResults((prev) => [
          ...prev.filter((item) => item.key !== key),
          {
            key,
            label: ph.getLabel(pool, i),
            result: { pending: true },
            algorithm: poolAlgo,
          },
        ]);

        let result;
        try {
          let details = pool;
          if (poolId) {
            let resDetails = await poolApi.get(poolId, poolClient, controller.signal);
            if (resDetails.status === 429) {
              const seconds = parseInt(
                resDetails.headers?.get("Retry-After") ||
                  resDetails.data?.headers?.["retry-after"],
                10,
              ) || 30;
              // Rate limit handling...
              try {
                await new Promise((r) => setTimeout(r, seconds * 1000));
                resDetails = await poolApi.get(poolId, poolClient);
              } finally {
                // Reset rate limit status
              }
            }
            const d = resDetails.data;
            details = {
              ...d,
              miningAlgorithm: d.algorithm || d.miningAlgorithm || "",
              stratumHost: d.stratumHostname || d.stratumHost || "",
              stratumPort: Number(d.port || d.stratumPort || 0),
              username: d.username || "",
              password: d.password || "x",
            };
          }

          const bodyToSend = typeof details === "string" ? JSON.parse(details) : details;
          result = await verifyPoolBody(bodyToSend, controller.signal, poolClient);

          if (result.status === 429) {
            const retryAfter = result.headers?.get("Retry-After") ||
              result.data?.headers?.["retry-after"];
            const seconds = parseInt(retryAfter, 3) || 5;
            try {
              await new Promise((r) => setTimeout(r, seconds * 1000));
              result = await verifyPoolBody(bodyToSend, controller.signal);
            } finally {
              // Reset rate limit status
            }
          }
        } catch (err) {
          result = err.name === "AbortError"
            ? { ok: false, data: { stopped: true, message: "Stopped by user" } }
            : { ok: false, data: { error: err.message || String(err) } };
        } finally {
          activeRequestRef.current = null;
        }

        setResponse((prev) => ({ ...(prev || {}), [key]: result }));
        setVerifyResults((prev) => [
          ...prev.filter((item) => item.key !== key),
          {
            key,
            label: ph.getLabel(pool, i),
            result,
            algorithm: poolAlgo,
          },
        ]);
        setProgress({ current: i + 1, total: source.length });

        if (stopRef.current || i >= source.length - 1) break;
        await new Promise((resolve) => {
          const startedAt = Date.now();
          const timer = setInterval(() => {
            if (stopRef.current || Date.now() - startedAt >= verificationDelay) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      }
    } finally {
      setPlaying(false);
      if (!keepRunning && stopRef.current) {
        // Reset running state if needed
      }
    }
  }, [getActivePoolSource, nhClient, playing]);

  // ✅ Helper for verifying a single pool body
  const verifyPoolBody = useCallback(async (poolDetails, signal, overrideClient) => {
    const payload = ph.buildVerifyBody(poolDetails);
    const missingFields = ph.getMissingVerifyFields(payload);

    if (missingFields.length > 0) {
      return {
        ok: false,
        data: {
          error: `Missing required verify fields: ${missingFields.join(", ")}`,
          requestBody: payload,
        },
      };
    }

    try {
      const targetClient = sanitizeNhClientTag(
        overrideClient || poolDetails.nhClient || poolDetails.client,
        nhClient,
      );
      const result = await poolApi.verify(payload, targetClient, signal);
      return { ...result, poolDetails, requestBody: payload };
    } catch (err) {
      if (err.name === "AbortError") {
        return {
          ok: false,
          requestBody: payload,
          data: { stopped: true, message: "Stopped by user" },
        };
      }
      return {
        ok: false,
        requestBody: payload,
        data: { error: err.message || String(err) },
      };
    }
  }, [nhClient]);

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

  // ✅ Add stop function
  const stopVerification = useCallback(() => {
    stopRef.current = true;
    if (activeRequestRef.current) {
      activeRequestRef.current.abort();
      activeRequestRef.current = null;
    }
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
    progress,
    playing,
    verifyPool,
    verifyAllOnce,
    verifyAlgorithm,
    getAlgoCountsSummary,
    stopVerification,
    verifyPoolBody,
  };
}