// server/index.js
import express from 'express';
import http from 'http';
import cors from 'cors';
import { registerRoutes } from './routes.js';
import { setupWebSocket } from './ws.js';

export const app = express();
export const server = http.createServer(app);

// ✅ Configure CORS properly
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
}));

// ✅ Also handle OPTIONS preflight requests
app.options('*', cors());

registerRoutes(app);
setupWebSocket(server);