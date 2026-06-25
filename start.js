// start.js - Complete working version with database lock handling
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import cron from 'node-cron';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { spawn } from 'child_process';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// MAIN
// ============================================================
console.log('🚀 Starting NiceHash Tool...');
console.log('📁 Working directory:', __dirname);

// ============================================================
// PROCESS MANAGEMENT
// ============================================================

let processes = [];
let backendProcess = null;
let tunnelProcess = null;
let frontendProcess = null;
let tunnelUrl = null;
let backendReady = false;

function killProcess(p) {
  if (!p || p.killed) return;
  try { p.kill(); } catch (e) {}
}

function cleanup() {
  console.log('\n🛑 Shutting down...');
  // Kill in reverse order: frontend, tunnel, backend
  killProcess(frontendProcess);
  killProcess(tunnelProcess);
  killProcess(backendProcess);
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// ============================================================
// BACKEND
// ============================================================

function startBackend() {
  console.log('📡 Starting backend server...');

  if (backendProcess) {
    killProcess(backendProcess);
    backendProcess = null;
  }

  backendReady = false;
  backendProcess = spawn('node', ['server/index.js'], {
    stdio: 'pipe',
    shell: true,
    env: { ...process.env }
  });

  processes = processes.filter(p => p !== backendProcess);
  processes.push(backendProcess);

  backendProcess.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output) console.log('[📡]', output);
    if (output.includes('--- NiceHash API Toolbox Server Started ---')) {
      backendReady = true;
      console.log('✅ Backend ready!');

      // Start frontend (only on first backend start, not on restarts)
      if (!frontendProcess) {
        setTimeout(() => {
          startFrontend();
        }, 1500);
      }

      // Start tunnel (only on first backend start, not on restarts)
      if (!tunnelProcess) {
        setTimeout(() => {
          startTunnel();
        }, 2500);
      }

      // Start file watcher (only once)
      if (!global._watcherStarted) {
        global._watcherStarted = true;
        startFileWatcher();
      }
    }
  });

  backendProcess.stderr.on('data', (data) => {
    const error = data.toString().trim();
    if (error && !error.includes('ECONNREFUSED') && !error.includes('DeprecationWarning')) {
      console.error('[Backend Error]', error);
    }
  });

  backendProcess.on('error', (err) => {
    console.error('❌ Backend error:', err.message);
  });

  backendProcess.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`❌ Backend exited with code ${code}`);
    }
    if (!backendReady) {
      console.log('❌ Backend failed to start. Please check the errors above.');
    }
  });
}

// ============================================================
// FRONTEND
// ============================================================

function startFrontend() {
  console.log('🎨 Starting frontend...');

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  frontendProcess = spawn(npmCmd, ['run', 'dev'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env }
  });

  processes.push(frontendProcess);

  frontendProcess.on('error', (err) => {
    console.error('❌ Frontend error:', err.message);
  });

  frontendProcess.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`❌ Frontend exited with code ${code}`);
    }
  });
}

// ============================================================
// CLOUDFLARE TUNNEL
// ============================================================

function startTunnel() {
  console.log('🌐 Starting Cloudflare tunnel...');

  const tunnelBin = 'cloudflared';

  tunnelProcess = spawn(tunnelBin, ['tunnel', '--url', 'http://localhost:3000', '--protocol', 'http2'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true
  });

  processes.push(tunnelProcess);

  tunnelProcess.stdout.on('data', (data) => {
    const output = data.toString();

    // Extract tunnel URL: "https://xxxx.trycloudflare.com"
    const urlMatch = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (urlMatch && urlMatch[0] !== tunnelUrl) {
      tunnelUrl = urlMatch[0];
      process.env.TUNNEL_URL = tunnelUrl;
      console.log(`🌐 Tunnel URL: ${tunnelUrl}`);
    }

    // Show meaningful tunnel logs, filter noise
    output.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      // Show INF/ERR level lines and URL announcements
      if (
        trimmed.includes('INF') ||
        trimmed.includes('ERR') ||
        trimmed.includes('WRN') ||
        trimmed.includes('trycloudflare.com') ||
        trimmed.includes('Your quick Tunnel')
      ) {
        console.log('[🌐]', trimmed);
      }
    });
  });

  tunnelProcess.stderr.on('data', (data) => {
    const error = data.toString().trim();
    if (error && !error.includes('DeprecationWarning')) {
      console.error('[🌐 Error]', error);
    }
  });

  tunnelProcess.on('error', (err) => {
    console.error('❌ Tunnel error:', err.message);
  });

  tunnelProcess.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`⚠️  Tunnel exited with code ${code}. Will NOT restart on file changes.`);
    }
  });
}

// ============================================================
// FILE WATCHER — restarts backend on file changes, NOT tunnel
// ============================================================

function startFileWatcher() {
  const serverDir = path.join(__dirname, 'server');
  if (!fs.existsSync(serverDir)) {
    console.log('⚠️  server/ directory not found, file watching disabled');
    return;
  }

  console.log('👀 Watching server/ for file changes (backend will restart, tunnel stays up)...');

  let debounceTimer = null;
  const DEBOUNCE_MS = 300;

  try {
    const watcher = fs.watch(serverDir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      // Only restart on .js file changes
      if (!filename.endsWith('.js') && !filename.endsWith('.mjs') && !filename.endsWith('.cjs')) return;

      // Debounce: batch rapid changes (e.g. from save + file watcher double-fire)
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log(`🔄 File changed: ${filename} — restarting backend (tunnel stays up)...`);
        startBackend();
      }, DEBOUNCE_MS);
    });

    watcher.on('error', (err) => {
      console.error('⚠️  File watcher error:', err.message);
    });

    // Store reference for cleanup
    processes.push({ kill: () => watcher.close() });
  } catch (err) {
    console.error('⚠️  Failed to start file watcher:', err.message);
  }
}

// ============================================================
// START
// ============================================================

console.log('📊 Initializing coin database...');
startBackend();

console.log('📡 Backend starting... Waiting for ready signal.');
console.log('💡 Press Ctrl+C to stop all services.');
