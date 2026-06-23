import { logger } from "../logger.js";
import { resolveNhClient, getNiceHashApp, nhConfigs } from "../nh.js";
import { dbGetAsync, dbRunAsync } from "./dbHelpers.js";

const monitorNhOrdersCache = new Map();
const MONITOR_NH_ORDERS_TTL = 60 * 1000;

/** Retrieves the global telegram notification status from the DB */
export async function getTelegramStatus() {
    try {
        await dbRunAsync("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
        const row = await dbGetAsync("SELECT value FROM settings WHERE key = 'telegram_enabled'");
        return { enabled: row ? row.value === "true" : true };
    } catch (err) {
        logger.warn("[monitor:db] Failed to fetch telegram status:", err.message);
        return { enabled: true };
    }
}

/** Updates the global telegram notification status in the DB */
export async function setTelegramStatus(enabled) {
    const val = enabled ? "true" : "false";
    await dbRunAsync("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
    await dbRunAsync("INSERT INTO settings (key, value) VALUES ('telegram_enabled', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [val]);
    return { enabled: !!enabled };
}

export async function sendTelegramInternal(message) {
    const status = await getTelegramStatus();
    if (!status.enabled) {
        logger.info("[telegram] Notifications are globally disabled, skipping message.");
        return { ok: true, description: "Notifications disabled" };
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) {
        logger.warn("[telegram] Credentials missing");
        throw new Error("Telegram credentials missing");
    }

    const text = String(message || "").trim();
    if (!text) throw new Error("Message empty");

    const maxAttempts = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
            });

            const data = await res.json();
            if (res.ok && data?.ok) {
                return data;
            }
            throw new Error(data?.description || `HTTP ${res.status}`);
        } catch (err) {
            lastError = err;
            if (attempt < maxAttempts) {
                await new Promise((resolve) => setTimeout(resolve, attempt * 300));
            }
        }
    }

    logger.error(`[telegram] Failed after ${maxAttempts} attempts: ${lastError.message}`);
    throw lastError;
}

export function extractArray(payload, keys = ["rentals", "rigs", "list", "result", "items", "data"]) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];

    for (const key of keys) {
        if (Array.isArray(payload[key])) return payload[key];
        if (payload.data && Array.isArray(payload.data[key])) return payload.data[key];
    }

    if (Array.isArray(payload.data)) return payload.data;
    if (payload.rentals && Array.isArray(payload.rentals)) return payload.rentals;

    if (payload.data && typeof payload.data === "object") {
        return extractArray(payload.data, keys);
    }

    return [];
}

export async function getMonitorNhActiveOrders(clientName) {
    const cacheKey = String(clientName || "BT").toUpperCase();
    const cached = monitorNhOrdersCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < MONITOR_NH_ORDERS_TTL) {
        return cached.orders;
    }

    const cfg = nhConfigs[cacheKey];
    if (!cfg?.apiKey || !cfg?.apiSecret || !cfg?.orgId) return [];

    const { client } = resolveNhClient(cacheKey);
    if (!client) return [];

    const result = await getNiceHashApp(client).hashpower.getMyOrders({ op: "LE", limit: 100 });
    const rawList = result?.list || result?.myOrders || (Array.isArray(result) ? result : []);
    const activeOrders = rawList.filter((o) => String(o?.status?.code || o?.status || "").toUpperCase() === "ACTIVE");
    monitorNhOrdersCache.set(cacheKey, { orders: activeOrders, ts: Date.now() });
    return activeOrders;
}