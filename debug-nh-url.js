import 'dotenv/config';
import { initNhConfigs, nhConfigs, resolveNhClient } from './server/nh.js';
import { createHmac, randomUUID } from 'node:crypto';

initNhConfigs(process.env);

async function debugRequest(client, method, path, query = {}) {
  // Ensure path and query string are separated (in case query was included in the path string)
  const [cleanPath, pathQueryString] = path.split("?");

  const serverTime = await client.getServerTime();
  const time = serverTime.toString();
  const nonce = randomUUID();
  const requestId = randomUUID();

  const queryParams = new URLSearchParams(pathQueryString || "");
  const additionalParams = new URLSearchParams(query || {});
  additionalParams.forEach((value, key) => queryParams.set(key, value));

  // Remove 'client' from query before sending to NiceHash upstream
  queryParams.delete("client");

  // For Hashpower Private API, ts and nonce MUST be in the query string
  if (cleanPath.includes("/hashpower/")) {
    queryParams.set("ts", time);
    queryParams.set("nonce", nonce);
  }

  const queryString = queryParams.toString();
  const url = `${client.baseUrl}${cleanPath}${queryString ? "?" + queryString : ""}`;
  
  // Log the raw URL and key details
  console.log(`  URL: ${url}`);
  console.log(`  Query: ${queryString || '(none)'}`);
  console.log(`  orgId header: ${client.orgId?.substring(0,10)}...`);
  console.log(`  apiKey: ${client.apiKey?.substring(0,10)}...`);

  // Try to call
  const hmac = createHmac("sha256", client.apiSecret);
  const fields = [
    client.apiKey,
    time,
    nonce,
    "",
    client.orgId,
    "",
    method.toUpperCase(),
    cleanPath,
    queryString || "",
  ];

  const separator = Buffer.alloc(1, 0);
  let inputBuffer = Buffer.alloc(0);

  for (let i = 0; i < fields.length; i++) {
    inputBuffer = Buffer.concat([
      inputBuffer,
      Buffer.from(fields[i], "latin1"),
    ]);
    if (i < fields.length - 1) {
      inputBuffer = Buffer.concat([inputBuffer, separator]);
    }
  }

  const signature = hmac.update(inputBuffer).digest("hex");

  const headers = {
    "User-Agent": "MiningTool/2.0",
    "X-Time": String(time),
    "X-Nonce": String(nonce),
    "X-Organization-Id": String(client.orgId || ""),
    "X-Request-Id": String(requestId),
    "X-Auth": String(`${client.apiKey}:${signature}`),
    "Content-Type": "application/json",
  };

  try {
    const response = await fetch(url, { method: method.toUpperCase(), headers });
    const status = response.status;
    const text = await response.text();
    console.log(`  Response: ${status} ${text.substring(0, 200)}`);
  } catch (e) {
    console.log(`  Fetch error: ${e.message}`);
  }
}

async function main() {
  const name = 'BT';
  const { client } = resolveNhClient(name);
  if (!client) { console.log('No client'); return; }
  
  console.log(`\n=== Test 1: pools with page/size ===`);
  await debugRequest(client, 'GET', '/main/api/v2/pools', { page: '0', size: '10' });
  
  console.log(`\n=== Test 2: myOrders with ts only ===`);
  await debugRequest(client, 'GET', '/main/api/v2/hashpower/myOrders', { ts: Date.now().toString() });
  
  console.log(`\n=== Test 3: myOrders with NO query params ===`);
  await debugRequest(client, 'GET', '/main/api/v2/hashpower/myOrders', {});
  
  console.log(`\n=== Test 4: myOrders with status filter ===`);
  await debugRequest(client, 'GET', '/main/api/v2/hashpower/myOrders', { status: 'ACTIVE' });
}

main();
