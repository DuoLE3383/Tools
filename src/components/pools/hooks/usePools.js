// components/pools/hooks/usePools.js
import { useState, useEffect, useCallback } from "react";
import { poolHelpers as ph, sanitizeNhClientTag } from "../../../core/poolUtils";

export function usePools({ onCall, nhClient, poolData }) {
  const [pools, setPools] = useState(() => ph.normalizeList(poolData || []));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filePools, setFilePools] = useState([]);
  const [extractedPools, setExtractedPools] = useState([]);
  const [useExtractedPools, setUseExtractedPools] = useState(false);
  const [verifyFromFile, setVerifyFromFile] = useState(false);

  const loadPools = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await onCall("/api/v2/pools", {
        query: { client: nhClient },
        silent: true,
        section: "pools",
      });

      const rawData = result?.data || (Array.isArray(result) ? result : result?.list || []);
      const normalized = ph.normalizeList(rawData);
      setPools(normalized);
      return normalized;
    } catch (err) {
      setError(err.message || String(err));
      setPools([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [nhClient, onCall]);

  const loadExtractedPools = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await onCall("/api/v2/extracted-pools", { silent: true });
      if (data && Array.isArray(data)) {
        const mapped = data.map((p) => {
          let nhHandle = sanitizeNhClientTag(p.nhClient || p.client, nhClient);
          const u = String(p.username || "").toLowerCase();
          if (u.includes("solomining")) nhHandle = "PH";
          else if (u.includes("luckymining")) nhHandle = "NHATLINH";
          else if (u.includes("lona")) nhHandle = "LN";

          return {
            ...p,
            name: p.name || "Extracted Pool",
            miningAlgorithm: p.miningAlgorithm || p.algorithm || "Unknown",
            stratumHost: p.stratumHost || p.stratumHostname || "",
            stratumPort: Number(p.stratumPort || p.port || 0),
            username: p.username || "",
            password: p.password || "x",
            client: nhHandle,
            nhClient: nhHandle,
          };
        });

        const normalized = ph.normalizeList(mapped);
        setExtractedPools(normalized);
        setPools(normalized);
        setUseExtractedPools(true);
      } else {
        setError("Invalid data format received from extracted pools API.");
      }
    } catch (err) {
      setError(`Failed to load extracted pools: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [nhClient, onCall]);

  // Initialize pools on mount
  useEffect(() => {
    loadPools();
  }, [loadPools]);

  // Keep local pools state in sync with parent poolData prop
  useEffect(() => {
    if (poolData) {
      setPools(ph.normalizeList(poolData));
    }
  }, [poolData]);

  return {
    pools,
    setPools,
    loading,
    error,
    loadPools,
    loadExtractedPools,
    filePools,
    setFilePools,
    extractedPools,
    setExtractedPools,
    useExtractedPools,
    setUseExtractedPools,
    verifyFromFile,
    setVerifyFromFile,
  };
}