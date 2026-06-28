// server/index.js
import express from 'express';
import http from 'http';
import { registerRoutes } from './routes.js';
import { setupWebSocket } from './ws.js';

console.warn(`[DEPRECATION] The 'server/index.js' file is deprecated and should not be used as an entry point. Please run the application from the root 'index.js' file.`);

// This file is now a placeholder to prevent accidental execution.
// The main application entry point is the `index.js` file in the project root.
export const app = express();
export const server = http.createServer(app);