import * as cheerio from "cheerio";

const EXTERNAL_POOL_TIMEOUT_MS = 25000;

async function fetchExternal(url, options, provider) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(EXTERNAL_POOL_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`${provider} request timed out or failed: ${lastError?.message || "unknown network error"}`);
}

function numberFromText(value) {
  const parsed = Number.parseFloat(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseTwoMinersAccount(data, poolHost, address) {
  const hostCoin = poolHost.split(".")[0].replace(/^solo-/, "");
  const coin = String(data?.coin || hostCoin || "").toUpperCase();
  const decimals = coin === "ZEPH" ? 1e12 : 1e8;
  const payments = data?.payments || [];
  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment?.amount || 0), 0) / decimals;
  return {
    provider: "2Miners",
    pool: poolHost,
    address,
    coin,
    hashrate: data?.currentHashrate || data?.hashrate || 0,
    averageHashrate: data?.hashrate || 0,
    workersOnline: Number(data?.workersOnline || 0),
    pendingBalance: Number(data?.balance || data?.unconfirmedBalance || 0) / decimals,
    totalPaid,
    paid24h: Number(data?.["24hreward"] || data?.reward24h || 0) / decimals,
    lastPayment: payments[0] || null,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchTwoMinersAccount(url) {
  let parsedUrl;
  try {
    parsedUrl = new URL(String(url || "").trim());
  } catch {
    throw new Error("Invalid 2Miners account URL");
  }

  const host = parsedUrl.hostname.toLowerCase();
  const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
  if (!host.endsWith(".2miners.com") || pathParts[0]?.toLowerCase() !== "account" || !pathParts[1]) {
    throw new Error("Invalid 2Miners account URL");
  }

  const poolHost = host.slice(0, -".2miners.com".length);
  const address = decodeURIComponent(pathParts[1]);
  const response = await fetchExternal(`https://${poolHost}.2miners.com/api/accounts/${encodeURIComponent(address)}`, {
    headers: { Accept: "application/json", "User-Agent": "MiningMonitor/1.0" },
  }, "2Miners");
  if (!response.ok) throw new Error(`2Miners returned HTTP ${response.status}`);
  return parseTwoMinersAccount(await response.json(), poolHost, address);
}

export async function fetchMiningMadnessAccount(address) {
  const response = await fetchExternal(`https://miningmadness.com/?address=${encodeURIComponent(address)}`, {
    headers: { Accept: "text/html", "User-Agent": "MiningMonitor/1.0" },
  }, "MiningMadness");
  if (!response.ok) throw new Error(`MiningMadness returned HTTP ${response.status}`);
  const html = await response.text();
  const $ = cheerio.load(html);
  const text = $("body").text().replace(/\s+/g, " ");
  const readAfter = (label) => {
    const match = text.match(new RegExp(`${label}[^\d]*([\d.,]+)`, "i"));
    return match ? numberFromText(match[1]) : 0;
  };
  const hashrate = text.match(/LAST 24 HOURS HASHRATE.*?Hashrate.*?(\d+(?:\.\d+)?)\s*(KH\/s|MH\/s|GH\/s|TH\/s|H\/s)/i);
  return {
    provider: "MiningMadness",
    address,
    coin: "PPC",
    hashrate: hashrate ? `${hashrate[1]} ${hashrate[2]}` : "0 H/s",
    averageHashrate: "0 H/s",
    workersOnline: 0,
    pendingBalance: readAfter("Pending Balance"),
    totalPaid: readAfter("Total Paid"),
    paid24h: readAfter("24H Estimates"),
    fetchedAt: new Date().toISOString(),
  };
}

export function addProjectionPrice(data, coinPrice = 0, btcPrice = 0) {
  return { ...data, coinPrice: Number(coinPrice) || 0, btcPrice: Number(btcPrice) || 0 };
}