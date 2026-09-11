import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpportunityRows } from './miningWorkspaceData.js';

test('ranks higher-spread routes ahead of routes with larger absolute profit', () => {
  const routeRows = [
    {
      nicehashAlgo: 'ETHASH',
      label: 'Ethash',
      miningDutchBtcPerDay: 50,
      heroCoins: [],
      heroRows: [],
      dutchRows: [],
    },
    {
      nicehashAlgo: 'KAWPOW',
      label: 'Kawpow',
      miningDutchBtcPerDay: 1000,
      heroCoins: [],
      heroRows: [],
      dutchRows: [],
    },
  ];

  const opportunities = buildOpportunityRows(
    routeRows,
    {
      ETHASH: 40,
      KAWPOW: 900,
    },
    [],
    [],
  );

  assert.equal(opportunities[0].nicehashAlgo, 'ETHASH');
  assert.ok((opportunities[0].bestSpreadPercent ?? 0) > (opportunities[1].bestSpreadPercent ?? 0));
});
