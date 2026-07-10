// start.js - ULTRA CLEAN (Backend Only)

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting Backend...');

let backendProcess = null;

function cleanup() {
  console.log('\n🛑 Shutting down...');
  if (backendProcess) {
    try {
      backendProcess.kill();
    } catch (e) {}
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Start backend
backendProcess = spawn('node', ['index.js'], {
  stdio: 'inherit', // Pipe directly to parent console
  shell: false,
  env: { ...process.env }
});

backendProcess.on('error', (err) => {
  console.error('❌ Backend error:', err.message);
});

backendProcess.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`❌ Backend exited with code ${code}`);
  }
  process.exit(code || 0);
});

console.log('✅ Backend started. Press Ctrl+C to stop.');