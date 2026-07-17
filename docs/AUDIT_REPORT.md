# Codebase Audit Report

**Date:** 2026-07-15  
**Scope:** 170+ files (server/, src/, script/, data/, worker/)  
**Auditor:** Sixth AI

---

## 🔴 CRITICAL — Immediate Action Required (4 issues)

### 1. JWT_SECRET Fallback (FIXED)
- **File:** `server/auth.js`
- **Fix:** Removed `|| 'fallback-secret-for-dev-only'` fallback. JWT_SECRET is now required.
- **Impact:** Previously any deployment without `JWT_SECRET` env var used a publicly-known key, allowing anyone to forge auth tokens.

### 2. server/client.js — Self-executing example code
- **Status:** NOT FIXED (standalone file, no consumers)
- **Issue:** Runs `exampleUsage()` at module scope — creates fetch() and WebSocket connections on import.
- **Recommendation:** Add `if (import.meta.url === \`file://${process.argv[1]}\`)` guard before the example call.

### 3. server/mrr/account-processor.js — 3 broken imports (REMOVED)
- **File:** Deleted.
- **Broken imports:**
  - `import { mrrApiCall } from './mrr.js'` — file doesn't exist
  - `import { extractRentalInfo } from './utils.js'` — file doesn't exist (should be `'../utils.js'`)
  - `import { resolveRentalAlgo, ... } from './monitor-utils.js'` — file doesn't exist
- **Also broken:** `processAccount()` calls `processRigs()`, `extractArray()`, `buildRentalsMap()`, `processRental()`, `cleanupGhostRentals()` — none defined.
- **Not imported anywhere** — was complete dead code.

### 4. server/routes/users.js — Parallel dead user management (REMOVED)
- **File:** Deleted.
- **Issue:** Entirely separate user CRUD system, never registered in any route loader.
- **Bug:** Imports `{ db }` from `'../db.js'` which exports `getDb()`, not `db` — would crash if loaded.

---

## 🟠 HIGH — Must Fix (3 issues)

### 5. Dual Server Entry Points
- **Files:** `server/index.js` (active) vs `server/app.js` (dead)
- **Status:** NOT FIXED — both files remain
- **Issue:** `server/app.js` has `createApp()` + `initializeApp()` that mirror `server/index.js`. Not imported by anything.
- **Different CORS configs:** app.js is restrictive, index.js was `'*'` — **index.js CORS FIXED** to match restrictive config.

### 6. Duplicate WebSocket Handlers (REMOVED)
- **Files:** `server/websocket-handler.js` deleted. `server/ws.js` remains (the active one).
- **Issue:** Both files implemented complete WS server setup.

### 7. start.js — Aggressive process killing
- **Status:** NOT FIXED
- **Issue:** Uses `kill -9` on PIDs and `taskkill /F` which can kill the parent shell.
- **Recommendation:** Use SIGTERM first with a grace period before SIGKILL.

---

## 🟡 MEDIUM — Should Fix (4 issues)

### 8. Race Conditions: Monitor + Scanner
- **Status:** NOT FIXED
- **Issue:** `runRentalMonitor()` (10min) + `startMiningOpportunityScanner()` (15min) both call MRR/NH APIs simultaneously. Nonce management's fire-and-forget DB writes have zero error handling.

### 9. Cache Chaos — 3+ separate caching layers
- **Status:** NOT FIXED
- **Cache instances:** `mrrGetCache` (Map, 60s), `mrrRequestCache` (Map, 10s/5min), `TTLMap` (monitor.js, 60s/10min), `nhPriceCache` (Map, 60s) — all caching the same responses.

### 10. Duplication Hotspots
- **escapeHtml:** 3 implementations (monitor.js custom, src/core/telegram.js, server/mrr/rental-monitor.js)
- **ALGO_MAPPING:** Defined in both server/mrr.js and src/core/mapping.js
- **Hashrate/suffix handling:** 4+ implementations across mrrUtils.js, mapping.js, hashrate-utils.js

### 11. `.env copy` file in root
- **Status:** NOT FIXED — verify this isn't committed with real credentials

---

## 🟢 LOW — Nice to Fix (4 issues)

### 12. Orphaned files (never imported)
- `server/deduplicate-db.js`, `server/verify-all-accounts.js`, `server/verify-all-pools.js`, `server/verify-pools.js`, `server/testTelegram.js`, `server/price-providers.js`, `server/price-sources.js`, `server/cmcClient.js`, `deploy-cloudflare.sh`, `deploy.js`, `fix-database.js`, `backend_start.js`, `extract_mrr_pools.js`, `extract_pools.js`

### 13. FIXBUG.MD — Fix plan file that was never applied
- **Status:** NOT FIXED — the whole file describes bugs and fixes that were never implemented

### 14. shadowed `ALGO_MAPPING` function
- **File:** `server/mrr/hashrate-utils.js`
- **Issue:** `function ALGO_MAPPING(code, ALGO_DISPLAY_NAMES)` shadows the constant

### 15. Wrong import paths in rental-monitor.js
- `import { ... } from '../telegram/index.js'` — file doesn't exist at that path
- `import { ... } from '../constants.js'` — references `ALGO_DISPLAY_NAMES` which doesn't exist there

---

## React Runtime Bug Fixed

**File:** `src/components/nicehash/NiceHash.jsx`  
**Error:** `Functions are not valid as a React child`  
**Root cause:** `{refreshSummary} BTC` — `refreshSummary` was a **function** (aliased from `refresh` in `useNiceHashOrders()`), not the summary data string.  
**Fix:** Changed to `{summary.totalPaid} BTC` which is the actual display value.

---

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| 🔴 CRITICAL | 4 | 3 |
| 🟠 HIGH | 3 | 2 |
| 🟡 MEDIUM | 4 | 0 |
| 🟢 LOW | 4 | 0 |
| Bug fix | 1 | 1 |
