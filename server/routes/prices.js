// server/routes/prices.js
import express from 'express';
import { asyncHandler } from '../utils.js';
import { fetchAndStoreCoinPrices } from './price-fetcher.js';

const router = express.Router();

router.post('/update', asyncHandler(async (req, res) => {
  await fetchAndStoreCoinPrices();
  res.json({ success: true, message: 'Price update job completed.' });
}));

export const registerPriceRoutes = (app) => {
  app.use('/api/v2/prices', router);
};