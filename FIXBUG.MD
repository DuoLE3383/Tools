The duplicate fetches and ghost rental log spam are caused by two independent processes:

1. **Mining Opportunity Scanner** – runs periodically (every 15 minutes) and calls MRR `/rig/.../pool` endpoints.
2. **Rental Monitor** – runs every minute and calls `/rig/mine`, `/rental`, etc., then logs each "ghost rental".

Additionally, the monitor logs `Skipping ghost rental: false` because a `false` rental ID is being passed to `/rental/false`, causing an extra API call.

---

## Upgrade Plan

We will:
- **Remove ghost rental logging** – replace with silent counting.
- **Fix the `false` rental ID bug** – filter out falsy IDs.
- **Add a shared cache** – so both processes can use the same rig data without extra API calls.
- **Optionally disable the scanner** if it’s redundant.

---

## 1. Fix `monitor.js` – Stop Logging Ghost Rentals

In `monitor.js`, find the `isRealRental` check inside the `runRentalMonitor` loop. Replace the `console.log` with a silent counter.

**Find this block (around line 350 in your file):**

```javascript
for (const [rentalId, r] of rentalsMap) {
  const info = extractRentalInfo(r);
  if (!isRealRental(r, info)) {
    console.log(`[monitor:${acct}] Skipping ghost rental: ${rentalId}`);
    continue;
  }
```

**Replace with:**

```javascript
let ghostCount = 0;
for (const [rentalId, r] of rentalsMap) {
  const info = extractRentalInfo(r);
  if (!isRealRental(r, info)) {
    ghostCount++;  // silent count
    continue;
  }
```
And at the end of the account loop, log a single summary:

```javascript
metric.ghostCount = ghostCount;
// ... after processing
```

**Add a summary log after all accounts are processed:**

```javascript
if (ghostCountTotal > 0) {
  console.log(`[Monitor] 🗑️ Filtered ${ghostCountTotal} ghost rentals (silent)`);
}
```

---

## 2. Fix `mrr.js` – Prevent `/rental/false` Calls

In `fetchAggregatedRentals`, filter out falsy rental IDs before making the pool request.

**Find this section (around line 450):**

```javascript
const rentalIds = uniqueList.map(r => r.id).join(';');
const { data: poolsData } = await mrrApiCall({ endpoint: `/rental/${rentalIds}/pool`, clientNameRaw: clientName });
```

**Replace with:**

```javascript
const rentalIds = uniqueList.map(r => r.id).filter(id => id && id !== 'false');
if (rentalIds.length === 0) return uniqueList; // skip pool fetch if no valid IDs
const rentalIdsStr = rentalIds.join(';');
const { data: poolsData } = await mrrApiCall({ endpoint: `/rental/${rentalIdsStr}/pool`, clientNameRaw: clientName });
```

---

## 3. Add a Cache to Avoid Duplicate MRR Calls

Create a simple in-memory cache (e.g., `node-cache` or a Map) to store rig data and rental data for a short TTL (e.g., 30 seconds). Both the scanner and monitor should read from the cache instead of calling MRR simultaneously.

In `mrr.js`, add:

```javascript
const mrrCache = new Map();
const MRR_CACHE_TTL = 30000; // 30 seconds

async function mrrGetWithCache(endpoint, clientName, query = {}) {
  const cacheKey = `${clientName}:${endpoint}:${JSON.stringify(query)}`;
  const cached = mrrCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < MRR_CACHE_TTL) {
    return cached.data;
  }
  const result = await mrrApiCall({ endpoint, clientNameRaw: clientName, query });
  mrrCache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}
```

Then, use `mrrGetWithCache` in `fetchAggregatedRentals` for the `/rental` and `/rig` calls.

---

## 4. Optionally Disable Mining Scanner (if Not Needed)

In `index.js`, comment out the scanner startup:

```javascript
// startMiningOpportunityScanner();
```

Or make it run less frequently (e.g., every 30 minutes) by adjusting the interval in `miningOpportunityNotifier.js`.

---

## 5. Complete Code Snippets

### Updated `monitor.js` (excerpt)

```javascript
let ghostCountTotal = 0;
// ... inside account loop
let ghostCount = 0;
for (const [rentalId, r] of rentalsMap) {
  const info = extractRentalInfo(r);
  if (!isRealRental(r, info)) {
    ghostCount++;
    continue;
  }
  // ... rest of processing
}
metric.ghostCount = ghostCount;
ghostCountTotal += ghostCount;
// ... after all accounts
if (ghostCountTotal > 0) {
  console.log(`[Monitor] 🗑️ Filtered ${ghostCountTotal} ghost rentals (silent)`);
}
```

### Updated `mrr.js` (excerpt)

```javascript
// In fetchAggregatedRentals, after uniqueList is built:
const rentalIds = uniqueList.map(r => r.id).filter(id => id && id !== 'false');
if (rentalIds.length === 0) return uniqueList;
const rentalIdsStr = rentalIds.join(';');
const { data: poolsData } = await mrrApiCall({ endpoint: `/rental/${rentalIdsStr}/pool`, clientNameRaw: clientName });
```

---

## Summary

- **Ghost rental logging** – replaced with silent counting and a one‑line summary.
- **`/rental/false` bug** – filtered out invalid IDs.
- **Cache** – will reduce duplicate API calls when both scanner and monitor run.
- **Scanner** – can be disabled or its frequency reduced.

These changes will clean up the console, reduce API load, and make the monitor more efficient.