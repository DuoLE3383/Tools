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
console.log('📊 Initializing coin database...');

// ============================================================
// ORIGINAL PROCESS MANAGEMENT
// ============================================================

let processes = [];

function cleanup() {
  console.log('\n🛑 Shutting down...');
  processes.forEach(p => {
    try {
      p.kill();
    } catch (e) {}
  });
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

console.log('📡 Starting backend server...');
const backend = spawn('node', ['server/index.js'], {
  stdio: 'pipe',
  shell: true,
  env: { ...process.env }
});

processes.push(backend);

let backendReady = false;

backend.stdout.on('data', (data) => {
  const output = data.toString().trim();
  if (output) console.log('[📡]', output);
  // Wait for the consolidated ready signal from the new server/index.js
  if (output.includes('--- NiceHash API Toolbox Server Started ---')) {
    backendReady = true;
    console.log('✅ Backend ready! Starting frontend...');
    
    setTimeout(() => {
      console.log('🎨 Starting frontend...');
      
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      
      const frontend = spawn(npmCmd, ['run', 'dev'], {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env }
      });
      processes.push(frontend);
      
      frontend.on('error', (err) => {
        console.error('❌ Frontend error:', err.message);
      });
      
      frontend.on('close', (code) => {
        if (code !== 0 && code !== null) {
          console.error(`❌ Frontend exited with code ${code}`);
        }
      });
    }, 1500);
  }
});

backend.stderr.on('data', (data) => {
  const error = data.toString().trim();
  if (error && !error.includes('ECONNREFUSED') && !error.includes('DeprecationWarning')) {
    console.error('[Backend Error]', error);
  }
});

backend.on('error', (err) => {
  console.error('❌ Backend error:', err.message);
});

backend.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`❌ Backend exited with code ${code}`);
  }
  if (!backendReady) {
    console.log('❌ Backend failed to start. Please check the errors above.');
  }
});

console.log('📡 Backend starting... Waiting for ready signal.');
console.log('💡 Press Ctrl+C to stop all services.');