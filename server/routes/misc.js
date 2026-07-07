// routes/misc.js
import { asyncHandler } from "../utils.js";
import { sendTelegramInternal, runRentalMonitor, getTelegramStatus, setTelegramStatus } from "../monitor.js";
import { saveMiningTrainingSnapshot } from "../miningTrainingDb.js";
import { db } from "../db.js";
import { saveToDatabase } from "./_helpers.js";
import { getNiceHashApp, resolveNhClient, normalizeAlgoForNiceHash } from "../nh.js";
import {
  getAlgorithmUnit,
  getMrrAlgoKey,
  getAlgoDisplayName,
} from "../../src/core/mapping.js";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const hasToken = !!process.env.TELEGRAM_BOT_TOKEN;
const hasChatId = !!process.env.TELEGRAM_CHAT_ID;

const parseMinerAddressEnv = (name) => {
  const raw = process.env[name];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        coin: String(item?.coin || "").trim().toUpperCase(),
        address: String(item?.address || "").trim(),
      }))
      .filter((item) => item.coin && item.address);
  } catch (err) {
    console.warn(`[miner] Invalid ${name}: ${err.message}`);
    return [];
  }
};

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const normalizeWorkers = (workers) => {
  if (!workers || typeof workers !== "object") return [];
  if (Array.isArray(workers)) {
    return workers.map((worker, index) => ({
      name: String(worker?.name || worker?.worker || worker?.id || `worker-${index + 1}`),
      hashrate: toNumber(worker?.hr || worker?.hashrate || worker?.currentHashrate),
      online: worker?.offline === true ? false : worker?.online !== false,
      raw: worker,
    }));
  }
  return Object.entries(workers).map(([name, worker]) => ({
    name,
    hashrate: toNumber(worker?.hr || worker?.hashrate || worker?.currentHashrate),
    online: worker?.offline === true ? false : worker?.online !== false,
    raw: worker,
  }));
};

const normalizeMinerAccount = ({ pool, coin, address, sourceUrl, data }) => {
  const stats = data?.stats || data?.currentStatistics || {};
  const sumrewards = data?.sumrewards || data?.sumRewards || {};
  const miner = data?.miner || data?.account || {};
  return {
    success: true,
    pool,
    coin,
    address,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    currentHashrate: toNumber(
      data?.currentHashrate ||
        data?.hashrate ||
        stats?.currentHashrate ||
        stats?.hashrate ||
        miner?.hashrate,
    ),
    averageHashrate: toNumber(
      data?.averageHashrate ||
        data?.hashrate24h ||
        data?.hashrate ||
        stats?.averageHashrate ||
        stats?.hashrate ||
        miner?.hashrate24h,
    ),
    balance: toNumber(data?.balance || stats?.balance || miner?.balance),
    immature: toNumber(data?.immature || stats?.immature || miner?.immature),
    paid: toNumber(data?.paid || stats?.paid || sumrewards?.paid || miner?.paid),
    workers: normalizeWorkers(data?.workers),
    raw: data,
  };
};

const MINER_COIN_ALGOS = {
  ETC: "ETCHASH",
  ETHW: "ETCHASH",
  QUAI: "PROGPOWZ",
  QRL: "RANDOMXMONERO",
};

const parseMarketRate = (payload) => {
  const prices = payload?.data?.stats?.prices;
  const candidates = [
    payload?.data?.suggested_price?.amount,
    prices?.lowest?.amount,
    prices?.lowest?.price,
    prices?.average?.amount,
    prices?.average?.price,
    prices?.last?.amount,
    prices?.last?.price,
    prices?.last_10?.amount,
    prices?.last_10?.price,
    payload?.data?.price,
    payload?.data?.BTC,
    payload?.price,
    payload?.BTC,
  ];
  for (const candidate of candidates) {
    const value = parseFloat(String(candidate ?? "").replace(/,/g, ""));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
};

const getHighestNiceHashBuyPrice = async (algorithm, market = "USA", clientName = "BT") => {
  const normalizedAlgo = normalizeAlgoForNiceHash(algorithm);
  const { client, clientName: resolvedClient } = resolveNhClient(clientName);
  if (!client) throw new Error(`NiceHash client ${clientName} is not configured`);
  const orderBook = await getNiceHashApp(client).hashpower.getOrderBook({
    algorithm: normalizedAlgo,
    market,
  });
  const buyOrders = Array.isArray(orderBook?.buy) ? orderBook.buy : [];
  const prices = buyOrders
    .map((order) => parseFloat(order?.price ?? order?.fixedPrice ?? order?.rate ?? 0))
    .filter((price) => Number.isFinite(price) && price > 0);
  return {
    price: prices.length > 0 ? Math.max(...prices) : 0,
    source: "order-book",
    market,
    client: resolvedClient,
    orderCount: buyOrders.length,
  };
};

const getMrrMarketPrice = async (algorithm) => {
  const mrrAlgo = getMrrAlgoKey(algorithm);
  const response = await fetch(`https://www.miningrigrentals.com/api/v2/market/algos/${mrrAlgo}`, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `MRR returned ${response.status}`);
  }
  return {
    price: parseMarketRate(data),
    source: "market-api",
    mrrAlgo,
    raw: data,
  };
};

const attachMiningMarkets = async (account) => {
  const rawAlgo = MINER_COIN_ALGOS[account.coin] || account.raw?.algorithm || account.raw?.algo;
  const nicehashAlgo = normalizeAlgoForNiceHash(rawAlgo);
  if (!rawAlgo || !nicehashAlgo || nicehashAlgo === "UNKNOWN") {
    return {
      ...account,
      market: {
        algorithm: rawAlgo || "",
        error: `No algorithm mapping for ${account.coin}`,
      },
    };
  }

  const [nicehashResult, mrrResult] = await Promise.allSettled([
    getHighestNiceHashBuyPrice(nicehashAlgo),
    getMrrMarketPrice(nicehashAlgo),
  ]);

  const nicehashPrice =
    nicehashResult.status === "fulfilled" ? nicehashResult.value.price : 0;
  const mrrPrice = mrrResult.status === "fulfilled" ? mrrResult.value.price : 0;
  const costs = [
    nicehashPrice > 0 ? { source: "NiceHash", price: nicehashPrice } : null,
    mrrPrice > 0 ? { source: "MRR", price: mrrPrice } : null,
  ].filter(Boolean);
  const cheapest = costs.sort((a, b) => a.price - b.price)[0] || null;
  const spread =
    nicehashPrice > 0 && mrrPrice > 0
      ? ((Math.max(nicehashPrice, mrrPrice) - Math.min(nicehashPrice, mrrPrice)) /
          Math.min(nicehashPrice, mrrPrice)) *
        100
      : null;

  return {
    ...account,
    market: {
      algorithm: nicehashAlgo,
      label: getAlgoDisplayName(nicehashAlgo),
      unit: getAlgorithmUnit(nicehashAlgo),
      mrrAlgo: getMrrAlgoKey(nicehashAlgo),
      nicehash: {
        price: nicehashPrice,
        error:
          nicehashResult.status === "rejected"
            ? nicehashResult.reason?.message || String(nicehashResult.reason)
            : "",
        ...(nicehashResult.status === "fulfilled" ? nicehashResult.value : {}),
      },
      mrr: {
        price: mrrPrice,
        error:
          mrrResult.status === "rejected"
            ? mrrResult.reason?.message || String(mrrResult.reason)
            : "",
        ...(mrrResult.status === "fulfilled" ? mrrResult.value : {}),
        raw: undefined,
      },
      cheapest,
      spread,
      profitable:
        cheapest && spread !== null
          ? `${cheapest.source} is cheaper by ${spread.toFixed(2)}%`
          : "Need both markets for comparison",
    },
  };
};

const buildPoolUrlCandidates = ({ coin, address, host, paths }) => {
  const baseUrl = `https://${String(coin).toLowerCase()}.${host}`.replace(/\/$/, "");
  return paths.map((pathTemplate) =>
    `${baseUrl}${pathTemplate
      .replace("{address}", encodeURIComponent(address))
      .replace("{coin}", encodeURIComponent(String(coin).toLowerCase()))}`,
  );
};

const fetchMinerAccount = async ({ pool, coin, address, urlCandidates }) => {
  const errors = [];
  let sourceUrl = urlCandidates[0] || "";
  for (const url of urlCandidates) {
    sourceUrl = url;
    try {
      const response = await fetch(sourceUrl, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000),
      });
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`Invalid JSON response (${response.status})`);
      }
      if (!response.ok) {
        throw new Error(data?.error || data?.message || `Pool returned ${response.status}`);
      }
      return normalizeMinerAccount({ pool, coin, address, sourceUrl, data });
    } catch (err) {
      errors.push(`${sourceUrl}: ${err.message}`);
    }
  }

  return {
    success: false,
    pool,
    coin,
    address,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    error: errors[0] || "No pool API endpoint succeeded",
    endpointErrors: errors,
    workers: [],
  };
};

const buildMinerTargets = () => {
  const poolConfigs = [
    {
      env: "HEROMINERS_ADDRESSES",
      pool: "HEROMINERS",
      host: "herominers.com",
      paths: ["/api/stats_address?address={address}", "/api/accounts/{address}"],
    },
    {
      env: "2MINERS_ADDRESSES",
      pool: "2MINERS",
      host: "2miners.com",
      paths: ["/api/accounts/{address}", "/api/stats_address?address={address}"],
    },
    {
      env: "K1POOL_ADDRESSES",
      pool: "K1POOL",
      host: "k1pool.com",
      paths: ["/api/accounts/{address}", "/api/stats_address?address={address}"],
    },
    {
      env: "KRYPTEX_ADDRESSES",
      pool: "KRYPTEX",
      host: "kryptex.network",
      paths: ["/api/accounts/{address}", "/api/stats_address?address={address}"],
    },
  ];

  return poolConfigs.flatMap((config) =>
    parseMinerAddressEnv(config.env).map((item) => ({
      ...item,
      pool: config.pool,
      urlCandidates: buildPoolUrlCandidates({
        coin: item.coin,
        address: item.address,
        host: config.host,
        paths: config.paths,
      }),
    })),
  );
};

export function registerMiscRoutes(app) {
  // ─── Telegram ──────────────────────────────────────────────────
  app.post("/api/v2/notify/telegram", asyncHandler(async (req, res) => {
    const { message } = req.body;
    try {
      const data = await sendTelegramInternal(message);
      res.json(data);
    } catch (err) {
      console.warn(`[telegram] ${err.message}`);
      res.status(400).json({ success: false, error: err.message });
    }
  }));
  app.get("/api/v2/notify/telegram/status", asyncHandler(async (req, res) => res.json(await getTelegramStatus())));
  app.post("/api/v2/notify/telegram/status", asyncHandler(async (req, res) => {
    const { enabled } = req.body;
    res.json(await setTelegramStatus(enabled));
  }));
  app.get("/api/v2/notify/telegram/health", asyncHandler(async (req, res) => res.json({ success: hasToken && hasChatId, configured: hasToken && hasChatId, tokenPresent: hasToken, chatIdPresent: hasChatId })));

  // ─── Test ─────────────────────────────────────────────────────
  app.post("/api/v2/test/rented-notice", asyncHandler(async (req, res) => {
    const msg = `🚀 <b>[New Rental]</b>\n<b>Account:</b> <code>TEST_BT</code>\n━━━━━━━━━━━━━━\n<b>Rig:</b> Test-Rig-Notice (<code>123456</code>)\n<b>Algo:</b> <code>SHA256</code>\n<b>Time:</b> 2024-01-01 12:00:00 - 2024-01-02 12:00:00\n━━━━━━━━━━━━━━\n<b>Paid:</b> <code>0.00045000 BTC</code>\n<b>Efficiency:</b> <b>100.0%</b>\n<b>Remaining:</b> 24.00h\n<b>Target to 100%:</b> 1.23 TH/s\n<i>This is a simulated rental notice.</i>`;
    try {
      const tgRes = await sendTelegramInternal(msg);
      res.json({ success: true, message: "Test notice sent", telegram: tgRes });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }));

  // ─── Monitor Snapshot ────────────────────────────────────────
  app.get("/api/v2/mrr/monitor/snapshot", asyncHandler(async (req, res) => {
    db.all(`SELECT * FROM rentals ORDER BY last_updated DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      saveToDatabase("monitor_snapshot.csv", rows);
      res.json({ success: true, data: rows });
    });
  }));
  app.delete("/api/v2/mrr/monitor/snapshot/:id", asyncHandler(async (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM rentals WHERE id = ?`, [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    });
  }));
  app.patch("/api/v2/mrr/monitor/snapshot/:id", asyncHandler(async (req, res) => {
    const { id } = req.params;
    const fields = Object.keys(req.body).filter(k => k !== 'id').map(k => `${k} = ?`).join(', ');
    if (!fields) return res.status(400).json({ success: false, error: 'No fields provided for update' });
    const values = [...Object.keys(req.body).filter(k => k !== 'id').map(k => req.body[k]), id];
    db.run(`UPDATE rentals SET ${fields} WHERE id = ?`, values, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    });
  }));

  // ─── Extracted Pools ─────────────────────────────────────────
  app.get("/api/v2/extracted-pools", asyncHandler(async (req, res) => {
    const filePath = path.resolve(process.cwd(), "extracted_pools.json");
    try {
      await fs.access(filePath);
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content || "[]");
      res.json(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err.code === "ENOENT") return res.json([]);
      res.status(500).json({ success: false, error: `Error reading extracted pools: ${err.message}` });
    }
  }));

  // ─── Mining Training Snapshot ───────────────────────────────
  app.post("/api/v2/mining/training-snapshot", asyncHandler(async (req, res) => {
    try {
      const result = await saveMiningTrainingSnapshot(req.body || {});
      res.json({ success: true, data: result });
    } catch (err) {
      console.error("[mining-training] Failed to save snapshot:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }));

  // ─── Mining Opportunities Scan ──────────────────────────────
  app.get("/api/v2/mining/opportunities/scan", asyncHandler(async (req, res) => {
    const { handleMiningOpportunityScan } = await import("../miningOpportunityNotifier.js");
    await handleMiningOpportunityScan(req, res);
  }));

}
