import React from 'react';
import { formatRentalStartTime } from "../../../core/mrrUtils.js";

const RigRates = ({
  mrrRate,
  nhPrice,
  paidLabel,
  paidBtcAmount,
  paidCurrency,
  usdValue,
  rentalStartTime,
  mrrUnit,
  isLoading,
  mrrRateSource,
  mrrUsedKey
}) => {
  // Ensure we have safe values
  const safePaidLabel = paidLabel || "N/A";
  const safePaidBtcAmount = paidBtcAmount || 0;
  const safeUsdValue = usdValue || 0;
  const safePaidCurrency = paidCurrency || "BTC";
  const safeMrrUnit = mrrUnit || "H";
  const safeMrrRate = mrrRate?.finalMrrRate || 0;
  const safeNhPrice = nhPrice?.nhPriceInMrrUnit || 0;
  const safeNhUnit = nhPrice?.unit || safeMrrUnit;
  const safeIsLoading = isLoading || false;
  const safeSource = mrrRateSource || "No data";
  
  // Format the paid label with proper decimal places
  const formattedPaidLabel = safePaidLabel !== "N/A" 
    ? safePaidLabel 
    : safePaidBtcAmount > 0 
      ? `${safePaidBtcAmount.toFixed(8)} BTC`
      : "N/A";
  
  return (
    <section style={{
      background: "rgba(255,255,255,0.035)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "8px",
      padding: "2px",
    }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "6px",
          marginBottom: "4px",
        }}
      >
        <div style={{ fontSize: "8px", color: "#94a3b8" }}>
          {safeSource}
        </div>
        {safeIsLoading && (
          <span style={{ fontSize: "7px", color: "#60a5fa" }}>
            loading...
          </span>
        )}
      </div>

      {/* Rental Paid */}
      <div
        style={{
          marginBottom: "6px",
          padding: "7px",
          borderRadius: "10px",
          background:
            "linear-gradient(135deg, rgba(245, 158, 11, 0.16), rgba(16, 185, 129, 0.10))",
          border: "1px solid rgba(251, 191, 36, 0.20)",
        }}
      >
        <div
          style={{
            opacity: 0.72,
            textTransform: "uppercase",
            fontSize: "8px",
            letterSpacing: "0.08em",
          }}
        >
          Rental Paid
        </div>
        <div
          style={{
            color: "#fbbf24",
            fontWeight: 900,
            fontSize: "11px",
            lineHeight: 1.1,
            marginTop: "3px",
          }}
        >
          {formattedPaidLabel}
        </div>
        {safePaidBtcAmount > 0 &&
          String(safePaidCurrency || "").toUpperCase() !== "BTC" && (
            <div
              style={{
                color: "#86efac",
                fontWeight: 700,
                fontSize: "9px",
                marginTop: "3px",
              }}
            >
              ~ {safePaidBtcAmount.toFixed(8)} BTC
            </div>
          )}
        {safeUsdValue > 0 &&
          String(safePaidCurrency || "").toUpperCase() !== "USD" && (
            <div
              style={{
                color: "#86efac",
                fontWeight: 700,
                fontSize: "9px",
                marginTop: "3px",
              }}
            >
              ~ ${safeUsdValue.toFixed(2)} USD
            </div>
          )}
      </div>

      {/* MRR & NiceHash Rates */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "5px",
          fontSize: "9px",
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            borderRadius: "9px",
            padding: "6px",
          }}
        >
          <div
            style={{
              opacity: 0.6,
              textTransform: "uppercase",
              fontSize: "8px",
            }}
          >
            MRR Rate
          </div>
          <div
            style={{ color: "#fbbf24", fontWeight: 800, marginTop: "3px" }}
          >
            {safeMrrRate > 0 ? (
              <>
                {safeMrrRate.toFixed(8)}
                <span style={{ opacity: 0.5, fontSize: "8px" }}>
                  {" "}
                  BTC/{safeMrrUnit}/Day
                </span>
                {mrrRate?.mrrMarketRate > 0 && (
                  <span
                    style={{
                      marginLeft: "4px",
                      fontSize: "6px",
                      opacity: 0.4,
                      fontFamily: "monospace",
                    }}
                  >
                    ({mrrRate?.mrrUsedKey || mrrRate?.mrrKey || ""})
                  </span>
                )}
                {mrrRate?.mrrUsedKey === "calculated" && (
                  <span
                    style={{
                      marginLeft: "4px",
                      fontSize: "6px",
                      opacity: 0.4,
                      fontFamily: "monospace",
                    }}
                  >
                    (calculated)
                  </span>
                )}
              </>
            ) : safeIsLoading ? (
              "Loading..."
            ) : (
              "N/A"
            )}
          </div>
        </div>
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            borderRadius: "9px",
            padding: "6px",
          }}
        >
          <div
            style={{
              opacity: 0.6,
              textTransform: "uppercase",
              fontSize: "8px",
            }}
          >
            NiceHash
          </div>
          <div
            style={{ color: "#60a5fa", fontWeight: 800, marginTop: "3px" }}
          >
            {safeNhPrice > 0 ? (
              <>
                {safeNhPrice.toFixed(8)}
                <span style={{ opacity: 0.5, fontSize: "8px" }}>
                  {" "}
                  BTC/{safeNhUnit}/Day
                </span>
              </>
            ) : (
              "N/A"
            )}
          </div>
        </div>
      </div>
      
      {/* Time Start */}
      <span
        style={{
          alignItems: "flex-end",
          marginTop: "5px",
          display: "flex",
          justifyContent: "space-between",
          fontSize: "10px",
          color: "#94a3b8",
          padding: "3px 0",
        }}
      >
        🕐 Started: {rentalStartTime ? formatRentalStartTime(rentalStartTime) : "N/A"}
      </span>
    </section>
  );
};

export default React.memo(RigRates);