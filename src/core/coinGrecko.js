/**
 * JavaScript Client for fetching coin prices from CoinGecko.
 * Corrects the invalid Java implementation previously found in this file.
 */
import { normalizeAlgoForNiceHash } from "./mapping.js";

const COIN_TO_COINGECKO_MAP = {
  BTC: "bitcoin",
  BITCOIN: "bitcoin",
  LTC: "litecoin",
  LITECOIN: "litecoin",
  DOGE: "dogecoin",
  DOGECOIN: "dogecoin",
  ETH: "ethereum",
  ETHEREUM: "ethereum",
  ETC: "ethereum-classic",
  ETHEREUMCLASSIC: "ethereum-classic",
  XMR: "monero",
  MONERO: "monero",
  RVN: "ravencoin",
  RAVENCOIN: "ravencoin",
  ERG: "ergo",
  ERGO: "ergo",
  KAS: "kaspa",
  KASPA: "kaspa",
  BEAM: "beam",
  ZEPH: "zephyr-protocol",
  ZEPHYR: "zephyr-protocol",
  IRON: "iron-fish",
  IRONFISH: "iron-fish",
  DYNEX: "dynex",
  ALPH: "alephium",
  ALEPHIUM: "alephium",
  NEXA: "nexa",
  CLORE: "clore-ai",
  CFX: "conflux",
  QRL: "qrl",
  XELIS: "xelis",
  ZANO: "zano",
  VERUS: "verus",
  DASH: "dash",
};

const ALGO_TO_COIN_MAP = {
  DAGGERHASHIMOTO: "ethereum",
  ETCHASH: "ethereum-classic",
  KAWPOW: "ravencoin",
  RANDOMXMONERO: "monero",
  RANDOMX: "monero",
  AUTOLYKOS: "ergo",
  AUTOLYKOSV2: "ergo",
  OCTOPUS: "conflux",
  KHEAVYHASH: "kaspa",
  X11: "dash",
  BEAMV3: "beam",
  BEAMHASHIII: "beam",
  PROGPOWZ: "zano",
  NEXAPOW: "nexa",
  FISHHASH: "iron-fish",
  DYNEXSOLVE: "dynex",
  BLAKE3: "alephium",
  BLAKE3_ALPH: "alephium",
  VERUSHASH: "verus",
};

function normalizeLookupKey(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function resolveCoinPriceTarget(coinOrSymbol) {
  if (!coinOrSymbol) {
    return { symbol: "", name: "", coinId: "" };
  }

  if (typeof coinOrSymbol === "object") {
    const symbol = String(
      coinOrSymbol.symbol ||
        coinOrSymbol.coin ||
        coinOrSymbol.ticker ||
        coinOrSymbol.name ||
        "",
    )
      .trim()
      .toUpperCase();
    const name = String(
      coinOrSymbol.name || coinOrSymbol.coin || coinOrSymbol.symbol || "",
    )
      .trim()
      .toUpperCase();
    const rawId = String(
      coinOrSymbol.coinId ||
        coinOrSymbol.coin_id ||
        coinOrSymbol.slug ||
        "",
    )
      .trim()
      .toLowerCase();

    const candidate =
      COIN_TO_COINGECKO_MAP[normalizeLookupKey(rawId)] ||
      COIN_TO_COINGECKO_MAP[normalizeLookupKey(symbol)] ||
      COIN_TO_COINGECKO_MAP[normalizeLookupKey(name)] ||
      ALGO_TO_COIN_MAP[normalizeAlgoForNiceHash(symbol)] ||
      ALGO_TO_COIN_MAP[normalizeAlgoForNiceHash(name)] ||
      rawId ||
      symbol.toLowerCase() ||
      name.toLowerCase();

    return {
      symbol,
      name,
      coinId: candidate,
    };
  }

  const raw = String(coinOrSymbol).trim();
  const key = normalizeLookupKey(raw);
  const algoKey = normalizeAlgoForNiceHash(raw);
  const coinId =
    COIN_TO_COINGECKO_MAP[key] ||
    ALGO_TO_COIN_MAP[algoKey] ||
    (raw.toLowerCase() === "hashimotos" ? "ethereum" : "") ||
    raw.toLowerCase();

  return {
    symbol: raw.toUpperCase(),
    name: raw,
    coinId,
  };
}

export async function getSimplePrice(ids, vsCurrencies = "usd,btc") {
  const isPro = process.env.COINGECKO_PRO === "true";
  const apiKey = process.env.COINGECKO_API_KEY || "";
  const baseUrl = isPro
    ? "https://pro-api.coingecko.com/api/v3"
    : "https://api.coingecko.com/api/v3";
  const headerName = isPro ? "x-cg-pro-api-key" : "x-cg-demo-api-key";

  const params = new URLSearchParams({
    ids,
    vs_currencies: vsCurrencies,
    include_24hr_change: "true",
  });

  const url = `${baseUrl}/simple/price?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        [headerName]: apiKey,
      },
    });

    if (response.status === 429) throw new Error("Rate limit exceeded.");
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("[CoinGecko] Request failed:", error.message);
    throw error;
  }
}

/**
 * Fetches current prices for calculator assets: BTC, DOGE, LTC, ETH, BCH.
 * Useful for server-side aggregation or background tasks.
 */
export async function getCalculatorPrices() {
  const ids = "bitcoin,dogecoin,litecoin,ethereum,bitcoin-cash";
  return getSimplePrice(ids, "usd,btc");
}
