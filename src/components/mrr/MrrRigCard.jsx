import React from 'react';
import { CountdownTimer } from "./MiningRigRental";
import { getRoiColor } from "../../core/mrrUtils.js";
import { formatRentalStartTime } from "../../core/mrrUtils.js";

// Hooks
import { useMrrRate } from "./hooks/useMrrRate";
import { useRigTimers } from "./hooks/useRigTimers";
import { useRigMetrics } from "./hooks/useRigMetrics";
import { useNiceHashPrice } from "./hooks/useNiceHashPrice";
import { useRoiCalculation } from "./hooks/useRoiCalculation";

// Components
import RigHeader from "./components/RigHeader";
import RoiBadge from "./components/RoiBadge";
import RigRates from "./components/RigRates";
import { RigMetrics } from "./components/RigMetrics";
import RigPoolInfo from "./components/RigPoolInfo";
import RigActions from "./components/RigActions";

// Utils
import { resolveAlgo } from "./utils/algorithmUtils";
import { getRigStatus, getRentalTimes, getHashrateInfo } from "./utils/rigUtils";
import { getRigStyles } from "./styles/rigCardStyles";

const MrrRigCard = ({
  rig,
  algoName,
  info,
  isMine,
  nhOrders,
  coinPrices,
  cryptoPrices,
  algoMarketPrices,
  onOpenPool,
  onOpenCompletionCalculator,
  fetchRigDetailInfo,
  loadingInfoIds,
  handleRigStatus,
  handlePriceChange,
  expandedPools,
  togglePoolInfo,
  setEnrichedInfo,
  onCall,
  mrrClient,
}) => {
  // Status & IDs
  const { statusStr, isRented, rentalId, displayId } = getRigStatus(rig);
  
  // Algorithm
  const algo = resolveAlgo(rig, info, algoName);
  
  // Rental Times
  const { startTime, endTime } = getRentalTimes(info, rig);
  
  // Calculate explicit duration from info and rig
  const explicitDuration = parseFloat(
    info?.duration ?? 
    info?.hours ?? 
    rig.duration ?? 
    rig.hours ?? 
    rig.length ?? 
    0
  );
  
  // Timers - pass explicit duration
  const timers = useRigTimers(
    isRented, 
    startTime, 
    endTime, 
    explicitDuration
  );
  
  // Hashrate Info
  const hashrate = getHashrateInfo(info, rig);
  
  // Metrics
  const metrics = useRigMetrics(rig, info, algo, coinPrices);
  
  // MRR Rate
  const mrrRate = useMrrRate(algoName, info, rig, onCall, coinPrices);
  
  // NiceHash Price
  const nhPrice = useNiceHashPrice(nhOrders, algo, algoMarketPrices);
  
  // ROI Calculation
  const { roiPercent, roiLabel } = useRoiCalculation(
    mrrRate.finalMrrRate,
    algo.mrrUnit,
    nhPrice.niceHashSourcePrice,
    algo.nhUnit,
    mrrRate.isLoadingMrrRate
  );

  // Computed values
  const effNum = info?.percent ?? 
    rig.hashrate?.average?.percent ?? 
    rig.percent ?? 
    (metrics.adsVal > 0 ? (metrics.avgVal / metrics.adsVal) * 100 : 0);
  const efficiency = Number.isFinite(Number(effNum)) ? Number(effNum) : 0;
  
  const targetHashrate = timers.totalMs - timers.elapsedMs > 0
    ? (metrics.adsVal * (timers.totalMs / 1000) - metrics.avgVal * (timers.elapsedMs / 1000)) / ((timers.totalMs - timers.elapsedMs) / 1000)
    : 0;
  const isBehind = targetHashrate > metrics.adsVal;

  // Use the final duration from timers
  const finalDurationHours = timers.durationHours;

  // Styles
  const styles = getRigStyles(efficiency);

  return (
    <article className="rig-card" style={styles.shell}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <RigHeader 
          rig={rig}
          isMine={isMine}
          isRented={isRented}
          rentalId={rentalId}
          displayId={displayId}
          displayAlgo={algo.display}
          paidLabel={metrics.paidLabel}
          statusStr={statusStr}
        />
        
        <RoiBadge roiPercent={roiPercent} roiLabel={roiLabel} />
      </div>

      {/* Main Grid */}
      <div style={styles.grid}>
        <RigRates
          mrrRate={mrrRate}
          nhPrice={nhPrice}
          paidLabel={metrics.paidLabel}
          paidBtcAmount={metrics.paidBtcAmount}
          paidCurrency={metrics.paidCurrency}
          usdValue={metrics.usdValue}
          rentalStartTime={startTime}
          mrrUnit={algo.mrrUnit}
          isLoading={mrrRate.isLoadingMrrRate}
          mrrRateSource={mrrRate.source}
          mrrUsedKey={mrrRate.mrrUsedKey}
        />
        
        <RigMetrics
          efficiency={efficiency}
          progress={timers.timeProgress}
          currentHashrate={hashrate.current}
          averageHashrate={hashrate.average}
          advertisedHashrate={hashrate.advertised}
          targetHashrate={targetHashrate}
          isBehind={isBehind}
          hashUnit={hashrate.suffix || algo.mrrUnit}
          endTime={endTime}
        />
      </div>

      {/* Pool Info */}
      {expandedPools.has(rig.id) && (info || rig.host) && (
        <RigPoolInfo rig={rig} info={info} onOpenPool={onOpenPool} />
      )}

      {/* Actions */}
      <RigActions
        rig={rig}
        info={info}
        isMine={isMine}
        isRented={isRented}
        statusStr={statusStr}
        expandedPools={expandedPools}
        loadingInfoIds={loadingInfoIds}
        onTogglePool={togglePoolInfo}
        onOpenPool={onOpenPool}
        onOpenCompletionCalculator={onOpenCompletionCalculator}
        onFetchDetail={fetchRigDetailInfo}
        onHandleStatus={handleRigStatus}
        onHandlePrice={handlePriceChange}
        onReload={fetchRigDetailInfo}
        setEnrichedInfo={setEnrichedInfo}
      />
    </article>
  );
};

export default React.memo(MrrRigCard);