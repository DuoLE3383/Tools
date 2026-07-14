// c:\Coding\tool\src\core\priceUtils.js

export function getPriceData(source) {
  if (!source) return { value: 0, currency: "BTC" };

  if (typeof source === "object") {
    // If source has 'paid', it's a total amount, not a rate.
    if (source.paid !== undefined) {
      return {
        value: parsePriceValue(source.paid),
        currency: (
          source.currency ??
          source.price_unit ??
          source.unit ??
          "BTC"
        ).toUpperCase(),
        isTotalCost: true,
      };
    }
    // Otherwise, assume it's a rate or a single value
    const val = parsePriceValue(
      source.BTC ?? source.value ?? source.amount ?? source.price,
    );
    const curr = (
      source.currency ??
      source.price_unit ??
      source.unit ??
      "BTC"
    ).toUpperCase();
    return { value: val, currency: curr, isTotalCost: false };
  }

  return { value: parsePriceValue(source), currency: "BTC" };
}

export function getBtcPriceData(source) {
  if (!source)
    return {
      value: 0,
      currency: "BTC",
      isTotalCost: false,
      isPerHashRate: true,
    };

  const data = getPriceData(source);

  // Detect if it's a rental total cost or a listing rate
  const isTotalCost = !!(
    typeof source === "object" &&
    (source.paid !== undefined || source.amount !== undefined)
  );
  const isPerHashRate = !isTotalCost;

  // Handle MRR-style nested price objects specifically for rates
  if (typeof source === "object" && !source.paid && source.BTC) {
    return {
      value: parsePriceValue(source.BTC),
      currency: "BTC",
      isTotalCost: false,
      isPerHashRate: true,
      unit: (source.price_unit || source.unit || "TH").toUpperCase(),
    };
  }

  return {
    ...data,
    isTotalCost,
    isPerHashRate,
    unit: (source?.unit || source?.price_unit || "TH").toUpperCase(),
  };
}

export function parsePriceValue(val) {
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    // More robust: remove commas and any non-numeric characters except dot and minus
    const cleaned = val.replace(/,/g, "").replace(/[^\d.-]/g, "");
    const parsed = parseFloat(cleaned || 0);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Calculates the NiceHash buying price including fees, upgrading a previously complex and potentially buggy implementation.
 *
 * This function replaces a nested ternary structure with a clear, readable flow. It corrects the unusual
 * fallback logic (`price / 1000`) with a standard, configurable percentage-based fee calculation, which is
 * more appropriate for determining a "price with fee".
 *
 * @param {number} buyNhPrice - The base price of the NiceHash order.
 * @param {object} nhOrder - The NiceHash order object from the API, which may contain `add_fee` or `priceWithFee`.
 * @param {number} [fallbackFeeRate=0.03] - The fee rate (e.g., 0.03 for 3%) to apply if no explicit fee is found.
 * @returns {number} The final price including fees.
 */
export function calculateNhPriceWithFee(buyNhPrice, nhOrder, fallbackFeeRate = 0.03) {
  // If the base price is not positive, the final price is zero.
  if (!(buyNhPrice > 0)) {
    return 0;
  }

  // Prioritize an explicit fee-inclusive price from the order object.
  const explicitPriceWithFee = parsePriceValue(
    nhOrder?.add_fee ?? nhOrder?.priceWithFee
  );

  // If a valid, positive fee-inclusive price is found, use it.
  if (explicitPriceWithFee > 0) {
    return explicitPriceWithFee;
  }

  // Fallback: Apply a standard percentage-based fee to the base price.
  return buyNhPrice * (1 + fallbackFeeRate);
}

/**
 * Formats a number for display, ensuring small negative numbers that round to zero
 * are shown with a negative sign (e.g., -0.00).
 * @param {number} value The number to format.
 * @param {number} [precision=2] The number of decimal places.
 * @returns {string} The formatted number as a string.
 */
export function formatDisplayNumber(value, precision = 2) {
  if (typeof value !== 'number' || !isFinite(value)) {
    return (0).toFixed(precision);
  }
  const fixedValue = value.toFixed(precision);
  if (parseFloat(fixedValue) === 0 && value < 0) {
    return `-${(0).toFixed(precision)}`;
  }
  return fixedValue;
}

/**
 * Extracts the rental rate from the detailed rental info object from MRR.
 * The most reliable rate is `price.advertised` or `price_converted.advertised`.
 * @param {object} info - The detailed rental info object.
 * @returns {number} The rental rate, or 0 if not found.
 */
export function getRentalRate(info) {
  if (!info) return 0;

  // Prioritize the 'advertised' rate, which is the actual rate of the rental.
  const candidates = [
    info.price?.advertised,
    info.price_converted?.advertised,
    info.price?.rate,
  ];

  for (const candidate of candidates) {
    const parsedRate = parsePriceValue(candidate);
    if (parsedRate > 0) return parsedRate;
  }

  return 0;
}
