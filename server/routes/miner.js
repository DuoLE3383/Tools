// server/routes/miner.js
import { Router } from 'express';
import { getMinerAccounts } from '../miner.js';

const router = Router();

router.get('/miner/accounts', getMinerAccounts);

export const registerMinerRoutes = (app) => {
  app.use('/api/v2', router);
};