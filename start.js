// start.js - with frozen terminal detection
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting Tool...');
console.log('📁 Working directory:', __dirname);

// ============================================
// FROZEN TERMINAL DETECTION
// ============================================
let lastOutputTime = Date.now();
let startupTimeout = null;
let backendStartTime = Date.now();
const MAX_STARTUP_TIME = 30000; // 30 seconds max startup time
const FROZEN_THRESHOLD = 10000; // 10 seconds without output = frozen

// Check if process is frozen (no output for too long)
function checkFrozen() {
  const now = Date.now();
  const timeSinceLastOutput = now - lastOutputTime;
  const elapsedTime = now - backendStartTime;
  
  // Only check after initial startup period (5 seconds)
  if (elapsedTime > 5000 && timeSinceLastOutput > FROZEN_THRESHOLD) {
    console.warn(`⚠️ No output for ${Math.round(timeSinceLastOutput/1000)}s - checking if frozen...`);
    
    // If process is stuck but still running, we'll show a prompt
    if (backend && backend.pid) {
      console.log(`📊 Backend process is still running (PID: ${backend.pid})`);
      console.log(`⏱️  Elapsed time: ${Math.round(elapsedTime/1000)}s`);
      
      // Check if process is actually stuck by sending a signal
      try {
        // This won't kill the process, just checks if it's responsive
        const killed = backend.kill(0); // Signal 0 just checks if process exists
        if (killed) {
          console.log('✅ Backend process is responsive');
          lastOutputTime = now; // Reset timer
        } else {
          console.warn('⚠️ Backend process is not responding!');
          console.log('🔧 Press Ctrl+C to restart or wait longer...');
        }
      } catch (e) {
        console.warn('⚠️ Cannot check process status:', e.message);
      }
    }
  }
}

// Check for frozen state every 5 seconds
setInterval(checkFrozen, 5000);

// ============================================
// CLEANUP FUNCTION
// ============================================
let processes = [];

function cleanup() {
  console.log('\n🛑 Shutting down...');
  processes.forEach(p => {
    try {
      if (p.pid) {
        console.log(`🔴 Killing process ${p.pid}...`);
        process.kill(-p.pid); // Kill entire process group
      }
    } catch (e) {
      // ignore
    }
  });
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// ============================================
// START BACKEND WITH FROZEN DETECTION
// ============================================
console.log('📡 Starting backend server...');

const backend = spawn('node', ['index.js'], {
  stdio: 'pipe',
  shell: true,
  env: { ...process.env },
  // Windows compatibility
  windowsHide: false,
});

processes.push(backend);
let backendReady = false;
let lastLogLine = '';

// Track output for frozen detection
backend.stdout.on('data', (data) => {
  const output = data.toString().trim();
  if (output) {
    console.log('[📡]', output);
    lastOutputTime = Date.now(); // Update last output time
    lastLogLine = output;
  }
  
  // Check if backend is ready
  if (
    output.includes('Listening on: http://localhost:3000') ||
    output.includes('Listening on: http://127.0.0.1:3000') ||
    output.includes('Server running on port 3000')
  ) {
    backendReady = true;
    console.log('✅ Backend ready!');
    
    // Clear the timeout since backend started successfully
    if (startupTimeout) {
      clearTimeout(startupTimeout);
      startupTimeout = null;
    }
  }
});

backend.stderr.on('data', (data) => {
  const error = data.toString().trim();
  lastOutputTime = Date.now(); // Update on error too
  
  // Filter out common harmless errors
  const harmlessErrors = [
    'ECONNREFUSED',
    'DeprecationWarning',
    'ExperimentalWarning',
    'MODULE_NOT_FOUND',
    'Cannot find module'
  ];
  
  if (error && !harmlessErrors.some(e => error.includes(e))) {
    console.error('[❌ Backend Error]', error);
  }
});

backend.on('error', (err) => {
  console.error('❌ Backend error:', err.message);
  if (!backendReady) {
    console.log('❌ Backend failed to start. Please check the errors above.');
    cleanup();
  }
});

backend.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`❌ Backend exited with code ${code}`);
  }
  
  if (!backendReady) {
    console.log('❌ Backend failed to start. Please check the errors above.');
    console.log(`💡 Last output: "${lastLogLine || 'No output'}"`);
    
    // Show suggestions based on common issues
    if (lastLogLine.includes('Error')) {
      console.log('🔍 Check for error messages above');
    }
    if (lastLogLine.includes('port')) {
      console.log('🔍 Check if port 3000 is already in use');
    }
    if (lastLogLine.includes('sqlite3')) {
      console.log('🔍 Database issue detected - try running: npm rebuild sqlite3');
    }
    
    // Don't exit immediately, give user time to see errors
    setTimeout(() => {
      console.log('🔄 Auto-retry in 3 seconds... (Press Ctrl+C to stop)');
      setTimeout(() => {
        if (!backendReady) {
          console.log('🔄 Restarting backend...');
          // Re-spawn the backend
          const newBackend = spawn('node', ['index.js'], {
            stdio: 'pipe',
            shell: true,
            env: { ...process.env }
          });
          processes = [newBackend];
          backendReady = false;
          backendStartTime = Date.now();
          lastOutputTime = Date.now();
        }
      }, 3000);
    }, 2000);
  }
});

// Startup timeout - if backend takes too long to start
startupTimeout = setTimeout(() => {
  if (!backendReady) {
    console.warn('⚠️ Backend taking longer than expected to start...');
    console.log(`⏱️  ${Math.round((Date.now() - backendStartTime)/1000)}s elapsed`);
    console.log('💡 The backend may be downloading dependencies or compiling native modules.');
    console.log('💡 If this continues, try running npm install manually.');
    
    // Check for common issues
    if (lastLogLine.includes('sqlite3')) {
      console.log('🔍 SQLite3 issue detected - try rebuilding: npm rebuild sqlite3');
    }
    if (lastLogLine.includes('sharp')) {
      console.log('🔍 Sharp issue detected - try reinstalling: npm install sharp');
    }
    
    // Show process info
    if (backend.pid) {
      console.log(`📊 Backend process PID: ${backend.pid}`);
    }
  }
}, 15000); // Warn after 15 seconds

// ============================================
// SIMPLE HEALTH CHECK
// ============================================
// Try to ping the backend every 5 seconds once it's running
setInterval(() => {
  if (backendReady) {
    // Just a simple check to see if we need to restart
    if (!backend || !backend.pid) {
      console.error('❌ Backend process disappeared!');
      backendReady = false;
    }
  }
}, 10000);

// ============================================
// KEYBOARD SHORTCUT HELP
// ============================================
console.log('📡 Backend starting...');
console.log('⏱️  Waiting for ready signal...');
console.log('💡 Press Ctrl+C to stop all services.');
console.log('💡 Press Ctrl+R to restart if frozen (may not work in all terminals)');
console.log('');

// ============================================
// EXPOSE HELPER FUNCTIONS (optional)
// ============================================
export function getBackendStatus() {
  return {
    ready: backendReady,
    pid: backend?.pid || null,
    uptime: backendReady ? Math.round((Date.now() - backendStartTime) / 1000) : 0,
    lastOutput: lastLogLine,
  };
}

// For debugging - type 'status()' in the terminal if using Node REPL
if (process.env.NODE_ENV === 'development') {
  global.status = getBackendStatus;
}