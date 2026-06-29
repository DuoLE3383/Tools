// start.js - with better error handling

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting NiceHash Tool...');
console.log('📁 Working directory:', __dirname);

let processes = [];

function cleanup() {
  console.log('\n🛑 Shutting down...');
  processes.forEach(p => {
    try {
      p.kill('SIGTERM');
    } catch (e) {
      // ignore
    }
  });
  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Start backend
console.log('📡 Starting backend server...');

// ✅ Use process.argv to pass args properly
const backend = spawn('node', ['index.js'], {
  stdio: ['ignore', 'pipe', 'pipe'], // Separate stdout/stderr
  env: { ...process.env, RUN_MAIN: 'true' }
});

processes.push(backend);

let backendReady = false;
let errorBuffer = '';

backend.stdout.on('data', (data) => {
  const output = data.toString();
  if (output.trim()) console.log('[📡]', output.trim());
  
  if (output.includes('Listening on: http://localhost:3000') ||
      output.includes('Listening on: http://127.0.0.1:3000')) {
    backendReady = true;
    console.log('✅ Backend ready! Starting frontend...');
    
    setTimeout(() => {
      console.log('🎨 Starting frontend...');
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const frontend = spawn(npmCmd, ['run', 'dev'], {
        stdio: 'inherit',
        env: { ...process.env }
      });
      processes.push(frontend);
      
      frontend.on('error', (err) => {
        console.error('❌ Frontend error:', err.message);
      });
    }, 1500);
  }
});

backend.stderr.on('data', (data) => {
  const error = data.toString();
  errorBuffer += error;
  
  // Log errors but ignore deprecation warnings
  if (!error.includes('DeprecationWarning') && 
      !error.includes('ECONNREFUSED') &&
      !error.includes('UV_HANDLE_CLOSING')) {
    console.error('[Backend Error]', error.trim());
  }
});

backend.on('error', (err) => {
  console.error('❌ Backend error:', err.message);
});

backend.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`❌ Backend exited with code ${code}`);
    if (errorBuffer) {
      console.error('📋 Last errors:', errorBuffer);
    }
  }
  if (!backendReady) {
    console.log('❌ Backend failed to start. Please check the errors above.');
    cleanup();
  }
});

console.log('📡 Backend starting... Waiting for ready signal.');
console.log('💡 Press Ctrl+C to stop all services.');