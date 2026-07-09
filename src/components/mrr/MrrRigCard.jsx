// MrrRigCard.jsx (Main - Final)

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  getRawHashrate,
  getPriceDataLocal,
  parsePriceValueLocal,
  formatRentalStartTime,
  getStatusClass,
  getRoiColor,
  getNiceHashPriceValue,
} from "../../core/mrrUtils.js";
import {
  HASHRATE_SUFFIXES,
  normalizeAlgoForNiceHash,
  getMrrAlgorithmUnit,
  getAlgoDisplayName,
  getAlgorithmUnit,
  mapNiceHashToMRR,
  calculatePriceComparison,
  isAsicBoost,
  normalizeAlgo,
  getAlgoMapping,
  getMrrUnit,
  getNiceHashUnit,
  convertNiceHashToMrr,
} from "../../core/mapping.js";

// Import hooks
import { useMrrRate } from "./useMrrRate";
import { useRentalTimer } from "./useRentalTimer";
import { useRoiCalculation } from "./useRoiCalculation";

// Import components
import { RigHeader } from "./RigHeader";
import { RigPriceSection } from "./RigPriceSection";
import { RigEfficiencySection } from "./RigEfficiencySection";
import { RigPoolSection } from "./RigPoolSection";
import { RigActions } from "./RigActions";

// Import utils
import {
  formatHashrateWithUnit,
  convertHashrateValue,
  cleanHashrateUnit,
} from "./formatters";
import {
  getMrrAlgoKey,
  COINGECKO_BY_CURRENCY,
  PRICE_CURRENCIES,
  FALLBACK_BTC_RATES,
} from "./helpers";

// ─── Helper functions ──────────────────────────────────────────────────
const normalizeOrderAlgo = (order) => {
  const rawOrder = order?.rawOrder || order;
  const pick = (value) => {
    if (!value) return "";
    if (typeof value === "object")
      return value.algorithm || value.displayName || value.name || "";
    return value;
  };
  return normalizeAlgoForNiceHash(
    order?.algo ||
      pick(order?.algorithm) ||
      rawOrder?.algo ||
      pick(rawOrder?.algorithm) ||
      rawOrder?.type,
  );
};

const resolvePaidPrice = (priceSource, convertedSource) => {
  const primary = getPriceDataLocal(priceSource);
  if (primary.value > 0)
    return {
      amount: primary.value,
      currency: String(primary.currency || "BTC").toUpperCase(),
    };
  if (priceSource && typeof priceSource === "object") {
    for (const currency of PRICE_CURRENCIES) {
      const nested = priceSource[currency];
      if (!nested || typeof nested !== "object") continue;
      const nestedPrice = getPriceDataLocal(nested);
      if (nestedPrice.value > 0) return { amount: nestedPrice.value, currency };
    }
  }
  const converted = getPriceDataLocal(convertedSource);
  if (converted.value > 0)
    return {
      amount: converted.value,
      currency: String(converted.currency || "BTC").toUpperCase(),
    };
  return { amount: 0, currency: "BTC" };
};

const convertPaidToBtc = (
  amount,
  currency,
  coinPrices = {},
  fallbackBtc = 0,
) => {
  const upperCurrency = String(currency || "BTC").toUpperCase();
  if (!amount || amount <= 0) return 0;
  if (upperCurrency === "BTC") return amount;
  const coinId = COINGECKO_BY_CURRENCY[upperCurrency];
  const apiBtcRate = coinId
    ? Number.parseFloat(coinPrices?.[coinId]?.btc || 0)
    : 0;
  if (apiBtcRate > 0) return amount * apiBtcRate;
  const fallbackRate = FALLBACK_BTC_RATES[upperCurrency];
  if (fallbackRate !== undefined) return amount * fallbackRate;
  return Number.isFinite(fallbackBtc) && fallbackBtc > 0 ? fallbackBtc : 0;
};

const getUsdtAmountDirect = (amount, currency, coinPrices) => {
  const upperCurrency = String(currency || "").toUpperCase();
  if (upperCurrency === "USDT") return 0;
  const coinId = COINGECKO_BY_CURRENCY[upperCurrency];
  if (!coinId) return 0;
  const usdPrice = coinPrices?.[coinId]?.usd;
  if (typeof usdPrice !== "number" || usdPrice <= 0) return 0;
  return amount * usdPrice;
};

// ─── Main Component ──────────────────────────────────────────────────────
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
  mrrClient,
}) => {
  // ── Basic state ──
  const statusStr = String(
    typeof rig.status === "object" ? rig.status.status : rig.status || "",
  ).toLowerCase();
  const rentalId = rig.rentalid || rig.current_rental_id || rig.rental_id;
  const isRented =
    statusStr.includes("rented") ||
    statusStr.includes("active") ||
    Boolean(rentalId);
  const displayId = isRented && rentalId ? rentalId : rig.id;
  const idLabel = isRented && rentalId ? "Rental" : "Rig";

  const rawCur = info?.rawCur || rig.hashrate?.current || 0;
  const cur = Number.isFinite(parseFloat(rawCur)) ? parseFloat(rawCur) : 0;

  // ── Algorithm & units ──
  const rawAlgo =
    info?.algo ||
    info?.normalized?.algo ||
    rig.algo ||
    rig.algorithm ||
    rig.type ||
    algoName;
  const normalizedAlgo = normalizeAlgoForNiceHash(rawAlgo);
  const mrrUnit = getMrrUnit(normalizedAlgo || rawAlgo);
  const nhUnit = getNiceHashUnit(normalizedAlgo || rawAlgo);
  const mrrApiKey = getMrrAlgoKey(normalizedAlgo);
  const isAsicBoostAlgo = isAsicBoost(normalizedAlgo);

  // ── USD price helper ──
  const getUsdPrice = useCallback(
    (currency) => {
      const map = {
        BTC: "bitcoin",
        ETH: "ethereum",
        LTC: "litecoin",
        DOGE: "dogecoin",
        BCH: "bitcoin-cash",
      };
      const id = map[String(currency).toUpperCase()];
      if (!id || !coinPrices) return 0;
      const coinData =
        coinPrices[id] ||
        coinPrices[String(currency).toUpperCase()] ||
        coinPrices[String(currency).toLowerCase()];
      return coinData?.usd || 0;
    },
    [coinPrices],
  );

  // ── Timer ──
  const nowMs = useRentalTimer(isRented);

  // ── Computed values ──
  const adsVal = useMemo(
    () =>
      info?.rawAds ||
      getRawHashrate(rig.hashrate?.advertised || rig.advertised) ||
      0,
    [info?.rawAds, rig.hashrate?.advertised, rig.advertised],
  );
  const avgVal = useMemo(
    () =>
      info?.rawAvg ||
      getRawHashrate(rig.hashrate?.average || rig.average || rig.hash) ||
      0,
    [info?.rawAvg, rig.hashrate?.average, rig.average, rig.hash],
  );

  const rentalStartTime = info?.startTime || rig.start;
  const rentalEndTime =
    info?.endTime ||
    rig.end ||
    (typeof rig.status === "object" ? rig.status.end : null);
  const startT = new Date(
    rentalStartTime +
      (String(rentalStartTime || "").endsWith("UTC") ? "" : " UTC"),
  ).getTime();
  const endT = new Date(
    rentalEndTime + (String(rentalEndTime || "").endsWith("UTC") ? "" : " UTC"),
  ).getTime();
  const totalMs =
    Number.isNaN(startT) || Number.isNaN(endT) ? 0 : Math.max(0, endT - startT);
  const durationHoursFromDates = totalMs > 0 ? totalMs / 3600000 : 0;
  const durationHoursExplicit = parseFloat(
    info?.duration ??
      info?.hours ??
      rig.duration ??
      rig.hours ??
      rig.length ??
      0,
  );
  const durationHours =
    durationHoursExplicit > 0 ? durationHoursExplicit : durationHoursFromDates;

  const rawEffValue =
    info?.percent ??
    rig.hashrate?.average?.percent ??
    rig.percent ??
    (adsVal > 0 ? (avgVal / adsVal) * 100 : 0);
  const effNum = Number.parseFloat(rawEffValue);
  const eff = Number.isFinite(effNum) ? effNum.toFixed(2) : "0.00";

  const paidPrice = resolvePaidPrice(
    info?.normalized?.price || info?.price || rig.price,
    info?.price_converted || rig.price_converted,
  );
  const paidAmount = paidPrice.amount;
  const paidCurrency =
    paidPrice.currency || info?.currency || rig.currency || "BTC";
  const paidLabel =
    paidAmount > 0 && paidCurrency
      ? `${paidAmount.toFixed(8)} ${String(paidCurrency).toUpperCase()}`
      : null;
  const fallbackBtc = parsePriceValueLocal(
    info?.price_converted?.price ?? rig.price_converted?.price ?? 0,
  );
  const paidBtcAmount = convertPaidToBtc(
    paidAmount,
    paidCurrency,
    coinPrices,
    fallbackBtc,
  );

  const usdValue = useMemo(() => {
    if (!paidAmount || paidAmount <= 0) return 0;
    const price = getUsdPrice(paidCurrency);
    return paidAmount * price;
  }, [paidAmount, paidCurrency, getUsdPrice]);

  const paidUsdtAmount = useMemo(
    () => getUsdtAmountDirect(paidAmount, paidCurrency, coinPrices),
    [paidAmount, paidCurrency, coinPrices],
  );

  const advertisedUnit =
    rig.hashrate?.suffix ||
    rig.hashrate?.advertised?.type ||
    info?.hashrate?.suffix ||
    info?.hashrate_unit ||
    info?.unit ||
    mrrUnit;
  const adsInMrrUnit =
    adsVal > 0 ? convertHashrateValue(adsVal, advertisedUnit, mrrUnit) : 0;
  const durationDays = durationHours > 0 ? durationHours / 24 : 0;

  // ── MRR Rate ──
  const {
    mrrMarketRate,
    isLoadingMrrRate,
    mrrRateError,
    mrrUsedKey,
    finalMrrRate,
    mrrDailyRateSource,
    calculatedMrrRate,
  } = useMrrRate({
    info,
    rig,
    algoName,
    mrrApiKey,
    mrrUnit,
    paidBtcAmount,
    adsInMrrUnit,
    durationDays,
  });

  // ── NiceHash Orders ──
  const normalizedCardAlgo = normalizeAlgoForNiceHash(algoName || rawAlgo);
  const nhOrder = [...(nhOrders || [])]
    .sort(
      (a, b) =>
        Number(
          b?.isActive ||
            b?.rawOrder?.status?.code === "ACTIVE" ||
            b?.rawOrder?.status === "ACTIVE",
        ) -
        Number(
          a?.isActive ||
            a?.rawOrder?.status?.code === "ACTIVE" ||
            a?.rawOrder?.status === "ACTIVE",
        ),
    )
    .find((order) => normalizeOrderAlgo(order) === normalizedCardAlgo);

  const orderNhPrice = getNiceHashPriceValue(
    nhOrder?.price ?? nhOrder?.rawOrder?.price ?? nhOrder,
  );
  const buyNhPrice = nhOrder && orderNhPrice > 0 ? orderNhPrice : 0;
  const buyNhPriceWithFee =
    buyNhPrice > 0
      ? Number.parseFloat(nhOrder?.add_fee ?? nhOrder?.priceWithFee ?? 0) > 0
        ? Number.parseFloat(nhOrder.add_fee ?? nhOrder.priceWithFee)
        : buyNhPrice / 1000
      : 0;

  const myNhUnit = getNiceHashUnit(normalizedAlgo || rawAlgo) || "KH";
  const marketPriceData = algoMarketPrices?.[algoName];
  const marketPriceValue = marketPriceData
    ? getNiceHashPriceValue(marketPriceData)
    : 0;
  const niceHashSourcePrice =
    marketPriceValue > 0 ? marketPriceValue : buyNhPriceWithFee;

  // ── ROI ──
  const { niceHashPriceInMrrUnit, roiPercent, roiLabel } = useRoiCalculation({
    finalMrrRate,
    mrrUnit,
    niceHashSourcePrice,
    normalizedAlgo,
    rawAlgo,
    isLoadingMrrRate,
  });

  const displayAlgo = getAlgoDisplayName(normalizedAlgo || rawAlgo);

  // ── Timer calculations ──
  const elapsedMs =
    nowMs > 0 && totalMs > 0
      ? Math.max(0, Math.min(nowMs - startT, totalMs))
      : 0;
  const timeProgress = totalMs > 0 ? (elapsedMs / totalMs) * 100 : 0;
  const targetHashrate =
    totalMs - elapsedMs > 0
      ? (adsVal * (totalMs / 1000) - avgVal * (elapsedMs / 1000)) /
        ((totalMs - elapsedMs) / 1000)
      : 0;
  const isBehind = targetHashrate > adsVal;
  const hSuffix =
    info?.hashrate?.suffix ||
    rig.hashrate?.advertised?.type ||
    info?.hashrate_unit ||
    info?.unit ||
    mrrUnit ||
    myNhUnit ||
    "";

  const getEfficiencyAccent = (efficiency) => {
    if (!Number.isFinite(efficiency)) return "rgba(148, 163, 184, 0.18)";
    if (efficiency >= 98) return "rgba(197, 34, 238, 0.3)";
    if (efficiency >= 70) return "rgba(23, 185, 131, 0.3)";
    if (efficiency >= 50) return "rgba(251, 191, 36, 0.30)";
    if (efficiency >= 30) return "rgba(251, 36, 36, 0.3)";
    return "rgba(239, 68, 68, 0.30)";
  };

  const accent = getEfficiencyAccent(effNum);

  // ── Styles ──
  const shellStyle = {
    background: `radial-gradient(circle at top right, ${accent} 0%, transparent 88%)`,
    border: `1.5px solid ${accent}`,
    borderTop: `2px solid ${getRoiColor(effNum)}`,
    borderRight: `3px solid ${getRoiColor(effNum)}`,
    borderBottom: `2px solid ${getRoiColor(effNum)}`,
    borderLeft: `1px solid ${getRoiColor(effNum)}`,
    borderRadius: "16px",
    padding: "8px",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    boxShadow: "0 10px 22px rgba(0, 0, 0, 0.16)",
    overflow: "hidden",
    width: "300px",
    height: "380px",
  };

  const asicBoostBadge = isAsicBoostAlgo ? (
    <span
      style={{
        background: "rgba(245, 158, 11, 0.2)",
        color: "#fbbf24",
        fontSize: "7px",
        padding: "1px 6px",
        borderRadius: "999px",
        fontWeight: "700",
        marginLeft: "4px",
        border: "1px solid rgba(245, 158, 11, 0.3)",
      }}
    >
      ASIC Boost
    </span>
  ) : null;

  return (
    <article className="rig-card" style={shellStyle}>
      {/* ─── Header ─── */}
      <RigHeader
        idLabel={idLabel}
        displayId={displayId}
        rig={rig}
        isMine={isMine}
        statusStr={statusStr}
        displayAlgo={displayAlgo}
        asicBoostBadge={asicBoostBadge}
        paidLabel={paidLabel}
        roiLabel={roiLabel}
        roiPercent={roiPercent}
      />

      {/* ─── Main Grid ─── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 0.85fr",
          gap: "6px",
        }}
      >
        {/* ─── Left Column: Price & Rates ─── */}
        <RigPriceSection
          mrrDailyRateSource={mrrDailyRateSource}
          isLoadingMrrRate={isLoadingMrrRate}
          paidLabel={paidLabel}
          paidBtcAmount={paidBtcAmount}
          paidCurrency={paidCurrency}
          usdValue={usdValue}
          finalMrrRate={finalMrrRate}
          mrrApiKey={mrrApiKey}
          mrrUsedKey={mrrUsedKey}
          mrrUnit={mrrUnit}
          niceHashPriceInMrrUnit={niceHashPriceInMrrUnit}
          myNhUnit={myNhUnit}
          rentalStartTime={rentalStartTime}
        />

        {/* ─── Right Column: Efficiency & Hashrates ─── */}
        <RigEfficiencySection
          effNum={effNum}
          eff={eff}
          timeProgress={timeProgress}
          info={info}
          rig={rig}
          getRoiColor={getRoiColor}
          cur={cur}
          avgVal={avgVal}
          adsVal={adsVal}
          targetHashrate={targetHashrate}
          isBehind={isBehind}
          hSuffix={hSuffix}
        />
      </div>

      {/* ─── Pools ─── */}
      <RigPoolSection
        rig={rig}
        info={info}
        expandedPools={expandedPools}
        onOpenPool={onOpenPool}
      />

      {/* ─── Buttons ─── */}
      <RigActions
        isMine={isMine}
        isRented={isRented}
        statusStr={statusStr}
        rig={rig}
        info={info}
        expandedPools={expandedPools}
        togglePoolInfo={togglePoolInfo}
        onOpenPool={onOpenPool}
        handleRigStatus={handleRigStatus}
        handlePriceChange={handlePriceChange}
        onOpenCompletionCalculator={onOpenCompletionCalculator}
        fetchRigDetailInfo={fetchRigDetailInfo}
        loadingInfoIds={loadingInfoIds}
        setEnrichedInfo={setEnrichedInfo}
      />
    </article>
  );
};

export default MrrRigCard;