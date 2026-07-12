import 'dotenv/config';
import { initNhConfigs, resolveNhClient } from './server/nh.js';
import { createHmac, randomUUID } from 'node:crypto';

initNhConfigs(process.env);

async function test() {
  const { client } = resolveNhClient('BT');
  
  // Replicate what NiceHashClient.call() does
  const method = 'GET';
  const path = '/main/api/v2/hashpower/myOrders';
  const query = { op: 'LE', ts: Date.now().toString() };
  
  const [cleanPath, pathQueryString] = path.split('?');
  const serverTime = await client.getServerTime();
  const time = serverTime.toString();
  const nonce = randomUUID();
  const requestId = randomUUID();

  const queryParams = new URLSearchParams(pathQueryString || '');
  const additionalParams = new URLSearchParams(query || {});
  additionalParams.forEach((value, key) => queryParams.set(key, value));
  queryParams.delete('client');

  if (cleanPath.includes('/hashpower/')) {
    queryParams.set('ts', time);
    queryParams.set('nonce', nonce);
  }

  const queryString = queryParams.toString();
  const url = `${client.baseUrl}${cleanPath}${queryString ? '?' + queryString : ''}`;
  
  console.log('URL:', url);
  console.log('QueryString:', queryString);
  console.log('Has op param:', queryParams.has('op'));

  // Build signature and try the call
  const hmac = createHmac('sha256', client.apiSecret);
  const fields = [
    client.apiKey, time, nonce, '', client.orgId, '',
    method.toUpperCase(), cleanPath, queryString || '',
  ];
  const separator = Buffer.alloc(1, 0);
  let inputBuffer = Buffer.alloc(0);
  for (let i = 0; i < fields.length; i++) {
    inputBuffer = Buffer.concat([inputBuffer, Buffer.from(fields[i], 'latin1')]);
    if (i < fields.length - 1) {
      inputBuffer = Buffer.concat([inputBuffer, separator]);
    }
  }
  const signature = hmac.update(inputBuffer).digest('hex');

  const response = await fetch(url, {
    method: method.toUpperCase(),
    headers: {
      'User-Agent': 'MiningTool/2.0',
      'X-Time': String(time),
      'X-Nonce': String(nonce),
      'X-Organization-Id': String(client.orgId || ''),
      'X-Request-Id': String(requestId),
      'X-Auth': String(`${client.apiKey}:${signature}`),
      'Content-Type': 'application/json',
    },
  });
  const status = response.status;
  const text = await response.text();
  console.log(`Response: ${status}`);
  console.log(`Body: ${text.substring(0, 500)}`);
}

test().catch(console.error);
