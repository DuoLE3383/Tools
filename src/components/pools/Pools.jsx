// components/pools/Pools.jsx - MAIN ENTRY POINT
import Modal from "../Modal";
import { useState, useEffect, useCallback, useRef } from "react";
import { usePools } from "./hooks/usePools";
import { usePoolAutomation } from "./hooks/usePoolAutomation";
import { usePoolVerification } from "./hooks/usePoolVerification";
import { PoolSelector } from "./PoolSelector";
import { PoolInventory } from "./PoolInventory";
import { PoolConnectionManager } from "./PoolConnectionManager";
import { VerificationResults } from "./VerificationResults";
import { AutomationControls } from "./AutomationControls";
import { AlgorithmSummary } from "./AlgorithmSummary";
import { ErrorModal } from "./ErrorModal";
import { getAlgoDisplayName } from "../../core/poolUtils";
import { sanitizeNhClientTag } from "../../core/poolUtils";

export default function Pools({
  onCall,
  poolData,
  niceHashData,
  mrrClient,
  setMrrClient,
  nhClient,
  setNhClient,
}) {
  // ============================================
  // CUSTOM HOOKS
  // ============================================
  const {
    pools,
    setPools,
    loading: poolsLoading,
    error: poolsError,
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
  } = usePools({ onCall, nhClient, poolData });

  const {
    selected,
    selectedId,
    setSelected,
    setSelectedId,
    response,
    setResponse,
    verifyResults,
    setVerifyResults,
    loading: verificationLoading,
    detailsLoading,
    error: verificationError,
    setError,
    verifyPool,
    verifyAllOnce,
    verifyAlgorithm,
    getAlgoCountsSummary,
  } = usePoolVerification({ onCall, nhClient, pools, filePools, extractedPools, useExtractedPools, verifyFromFile });

  const {
    running,
    playing,
    progress,
    runCount,
    currentRunElapsed,
    lastRunTime,
    nextRunCountdown,
    rateLimitStatus,
    lastRunSummary,
    startRun,
    stopAutomation,
    setAutomationInterval,
    setVerificationDelay,
    automationInterval,
    verificationDelay,
  } = usePoolAutomation({
    onCall,
    nhClient,
    pools,
    filePools,
    extractedPools,
    useExtractedPools,
    verifyFromFile,
    verifyAllOnce,
    setVerifyResults,
    setResponse,
  });

  // ============================================
  // LOCAL STATE
  // ============================================
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [inventoryModalOpen, setInventoryModalOpen] = useState(false);
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [inspectData, setInspectData] = useState(null);
  const fileInputRef = useRef(null);

  // ============================================
  // HANDLERS
  // ============================================
  const handleExportResults = useCallback(() => {
    // ... export logic
  }, [verifyResults]);

  const handleImportXlsx = async (e) => {
    // ... import logic
  };

  const handleSelectPool = useCallback((pool, key) => {
    setSelected(pool);
    setSelectedId(key);
    setSelectorOpen(false);
    // Fetch pool details
    verifyPool(pool);
  }, [setSelected, setSelectedId, verifyPool]);

  // ============================================
  // COMPUTED VALUES
  // ============================================
  const activePoolSource = verifyFromFile
    ? filePools
    : useExtractedPools
      ? extractedPools
      : pools;

  const completedResults = verifyResults.filter(
    (item) => !item.result?.pending
  );

  const successResults = completedResults.filter(
    (item) =>
      item.result?.ok &&
      !item.result?.data?.message?.includes("Skipped")
  );

  const failResults = completedResults.filter(
    (item) =>
      !item.result?.ok &&
      !item.result?.data?.message?.includes("Skipped")
  );

  const skippedResults = completedResults.filter((item) =>
    item.result?.data?.message?.includes("Skipped")
  );

  const poolAlgorithmGroups = Object.entries(
    activePoolSource.reduce((groups, pool) => {
      const algorithm = pool.miningAlgorithm || pool.algorithm || "Unknown";
      groups[algorithm] = (groups[algorithm] || 0) + 1;
      return groups;
    }, {})
  ).sort(([left], [right]) => left.localeCompare(right));

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="card pools-manager">
      {/* Client Selector */}
      <div className="market-inputs" style={{ marginBottom: "15px" }}>
        <small style={{ opacity: 0.8, fontSize: "13px", marginLeft: "10px" }}>
          ACTIVE NICEHASH CLIENT
        </small>
        <select
          className="select-pro"
          value={nhClient}
          onChange={(e) => setNhClient(e.target.value)}
        >
          <option value="BT">NiceHash Client: BT</option>
          <option value="PH">NiceHash Client: PH</option>
          <option value="LN">NiceHash Client: LN</option>
          <option value="NHATLINH">NiceHash Client: NHATLINH</option>
          <option value="HUDA">NiceHash Client: HUDA</option>
          <option value="VN">NiceHash Client: VN (all NH Pools)</option>
        </select>
        {/* Automation Controls */}
      <AutomationControls
        running={running}
        playing={playing}
        progress={progress}
        runCount={runCount}
        currentRunElapsed={currentRunElapsed}
        lastRunTime={lastRunTime}
        nextRunCountdown={nextRunCountdown}
        rateLimitStatus={rateLimitStatus}
        verificationDelay={verificationDelay}
        setVerificationDelay={setVerificationDelay}
        automationInterval={automationInterval}
        setAutomationInterval={setAutomationInterval}
        verifyFromFile={verifyFromFile}
        setVerifyFromFile={setVerifyFromFile}
        useExtractedPools={useExtractedPools}
        setUseExtractedPools={setUseExtractedPools}
        filePoolsLength={filePools.length}
        extractedPoolsLength={extractedPools.length}
        completedResultsLength={completedResults.length}
        onStartRun={startRun}
        onStopAutomation={stopAutomation}
        onLoadExtracted={loadExtractedPools}
        onVerifyAll={verifyAllOnce}
        onExportResults={handleExportResults}
        onImportClick={() => fileInputRef.current?.click()}
        onOpenInventory={() => setInventoryModalOpen(true)}
        onOpenConnectionManager={() => setConnectionModalOpen(true)}
        disabled={poolsLoading || verificationLoading}
      />
        {/* Verification Results */}
      <VerificationResults
        verifyResults={verifyResults}
        completedResults={completedResults}
        successResults={successResults}
        failResults={failResults}
        skippedResults={skippedResults}
        lastRunSummary={lastRunSummary}
        onInspect={(data) => setInspectData(data)}
        onOpenErrorModal={() => setErrorModalOpen(true)}
        poolCount={activePoolSource.length}
        verifyFromFile={verifyFromFile}
      />
      </div>
      {/* Main Layout */}
      <div
        className="pools-dashboard-layout"
        style={{
          display: "flex",
          gap: "1.5rem",
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        {sidebarVisible && (
          <div
            className="pool-sidebar"
            style={{
              width: "100%",
              maxWidth: "380px",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: "1.5rem",
            }}
          >
            <AlgorithmSummary
              algorithmGroups={poolAlgorithmGroups}
              onVerifyAlgorithm={verifyAlgorithm}
              disabled={verificationLoading || playing || running}
            />
          </div>
        )}
      </div>

      {/* Error Display */}
      {(poolsError || verificationError) && (
        <pre className="error-message">{poolsError || verificationError}</pre>
      )}

      {/* Modals */}
      <PoolSelector
        isOpen={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        pools={pools}
        selectedId={selectedId}
        onSelect={handleSelectPool}
        nhClient={nhClient}
      />

      <PoolInventory
        isOpen={inventoryModalOpen}
        onClose={() => setInventoryModalOpen(false)}
        pools={activePoolSource}
        onSelect={handleSelectPool}
        nhClient={nhClient}
      />

      <PoolConnectionManager
        isOpen={connectionModalOpen}
        onClose={() => setConnectionModalOpen(false)}
        pools={activePoolSource}
        selectedId={selectedId}
        onSelect={handleSelectPool}
        nhClient={nhClient}
      />

      <ErrorModal
        isOpen={errorModalOpen}
        onClose={() => setErrorModalOpen(false)}
        errors={failResults}
      />

      {/* Inspection Modal */}
      <Modal
        isOpen={!!inspectData}
        onClose={() => setInspectData(null)}
        title="Verification Details"
        maxWidth="900px"
      >
        <pre
          className="response-body"
          style={{ maxHeight: "70vh", overflow: "auto" }}
        >
          {JSON.stringify(inspectData, null, 2)}
        </pre>
      </Modal>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept=".xlsx"
        onChange={handleImportXlsx}
      />
    </div>
  );
}