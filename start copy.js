// start.js
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { createServer } from 'net';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting NiceHash Tool...');
console.log('📁 Working directory:', __dirname);

// Configuration
const CONFIG = {
  heartbeatInterval: 5000,
  heartbeatTimeout: 15000,
  maxRestarts: 5,
  restartDelay: 5000,
  port: 3003,
  maxPortAttempts: 10,
  startupTimeout: 45000,
};

let processes = [];
let backendProcess = null;
let frontendProcess = null;
let heartbeatTimer = null;
let lastHeartbeat = Date.now();
let restartCount = 0;
let isRestarting = false;
let backendReady = false;
let currentPort = CONFIG.port;
let startupTimer = null;
let isShuttingDown = false;

// Function to check if a port is in use
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = createServer()
      .once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(true);
        } else {
          resolve(false);
        }
      })
      .once('listening', () => {
        server.close();
        resolve(false);
      })
      .listen(port);
  });
}

// Function to kill process using a specific port (Windows)
function killProcessOnPort(port) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      console.log(`🔍 Looking for process using port ${port}...`);
      const findCmd = spawn('netstat', ['-ano', '-p', 'TCP'], { shell: true });
      let output = '';
      
      findCmd.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      findCmd.on('close', (code) => {
        const lines = output.split('\n');
        let pids = new Set();
        
        for (const line of lines) {
          if (line.includes(`:${port}`) && line.includes('LISTENING')) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && !isNaN(parseInt(pid))) {
              pids.add(pid);
            }
          }
        }
        
        if (pids.size > 0) {
          for (const pid of pids) {
            console.log(`🔪 Killing process with PID: ${pid} using port ${port}`);
            try {
              const killCmd = spawn('taskkill', ['/F', '/PID', pid], { 
                shell: true,
                stdio: 'pipe'
              });
              killCmd.on('close', () => {
                console.log(`✅ Process ${pid} killed`);
              });
            } catch (e) {
              console.error(`Failed to kill process ${pid}:`, e.message);
            }
          }
          setTimeout(resolve, 2000);
        } else {
          console.log(`ℹ️ No process found using port ${port}`);
          resolve();
        }
      });
    } else {
      // Linux/Mac
      console.log(`🔍 Looking for process using port ${port}...`);
      const findCmd = spawn('lsof', ['-i', `:${port}`], { shell: true });
      let output = '';
      
      findCmd.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      findCmd.on('close', (code) => {
        const lines = output.split('\n');
        let pids = new Set();
        
        for (const line of lines) {
          if (line.includes(`:${port}`) && line.includes('LISTEN')) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
              const pid = parts[1];
              if (pid && !isNaN(parseInt(pid))) {
                pids.add(pid);
              }
            }
          }
        }
        
        if (pids.size > 0) {
          for (const pid of pids) {
            console.log(`🔪 Killing process with PID: ${pid} using port ${port}`);
            try {
              spawn('kill', ['-9', pid], { shell: true });
              console.log(`✅ Process ${pid} killed`);
            } catch (e) {
              console.error(`Failed to kill process ${pid}:`, e.message);
            }
          }
          setTimeout(resolve, 2000);
        } else {
          console.log(`ℹ️ No process found using port ${port}`);
          resolve();
        }
      });
    }
  });
}

// Function to find an available port
async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + CONFIG.maxPortAttempts; port++) {
    const inUse = await isPortInUse(port);
    if (!inUse) {
      return port;
    }
  }
  return null;
}

// Cleanup function
function cleanup() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log('\n🛑 Shutting down...');
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  
  // Kill processes in reverse order
  const procs = [...processes].reverse();
  procs.forEach(p => {
    try {
      if (p && !p.killed) {
        p.kill('SIGTERM');
        setTimeout(() => {
          try {
            if (p && !p.killed) p.kill('SIGKILL');
          } catch (e) {}
        }, 2000);
      }
    } catch (e) {
      // ignore
    }
  });
  
  setTimeout(() => {
    process.exit(0);
  }, 3000);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  // Don't exit, let the process continue
});

// Heartbeat monitor
function startHeartbeatMonitor() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }
  
  heartbeatTimer = setInterval(() => {
    const now = Date.now();
    const timeSinceHeartbeat = now - lastHeartbeat;
    
    if (backendReady && timeSinceHeartbeat > CONFIG.heartbeatTimeout) {
      console.error(`❌ Backend frozen! No heartbeat for ${timeSinceHeartbeat}ms`);
      restartBackend();
    } else if (backendReady) {
      console.log(`💓 Heartbeat check: ${timeSinceHeartbeat}ms since last response`);
    }
  }, CONFIG.heartbeatInterval);
}

async function restartBackend() {
  if (isRestarting || isShuttingDown) return;
  isRestarting = true;
  
  restartCount++;
  if (restartCount > CONFIG.maxRestarts) {
    console.error(`❌ Backend crashed ${restartCount} times. Giving up.`);
    cleanup();
    return;
  }
  
  console.log(`🔄 Restarting backend (attempt ${restartCount}/${CONFIG.maxRestarts})...`);
  
  // Kill existing backend
  if (backendProcess) {
    try {
      backendProcess.kill('SIGTERM');
      setTimeout(() => {
        try {
          if (backendProcess && !backendProcess.killed) {
            backendProcess.kill('SIGKILL');
          }
        } catch (e) {}
      }, 1000);
    } catch (e) {
      // ignore
    }
    backendProcess = null;
  }
  
  backendReady = false;
  
  // Kill any process using the port
  await killProcessOnPort(currentPort);
  
  // Wait before restarting
  setTimeout(async () => {
    console.log(`📡 Starting backend on port ${currentPort}...`);
    await startBackend();
    isRestarting = false;
  }, CONFIG.restartDelay);
}

async function startBackend() {
  // Check if port is available
  const portInUse = await isPortInUse(currentPort);
  if (portInUse) {
    console.log(`⚠️ Port ${currentPort} is already in use. Attempting to free it...`);
    await killProcessOnPort(currentPort);
    
    // Check again after killing
    const stillInUse = await isPortInUse(currentPort);
    if (stillInUse) {
      console.log(`❌ Port ${currentPort} is still in use. Looking for alternative port...`);
      const newPort = await findAvailablePort(currentPort + 1);
      if (newPort) {
        console.log(`✅ Using alternative port: ${newPort}`);
        currentPort = newPort;
        process.env.PORT = currentPort.toString();
      } else {
        console.error(`❌ No available ports found starting from ${currentPort}`);
        setTimeout(() => restartBackend(), 5000);
        return;
      }
    } else {
      console.log(`✅ Port ${currentPort} is now available`);
    }
  }
  
  // Set port in environment
  const env = { 
    ...process.env,
    PORT: currentPort.toString(),
    NODE_ENV: process.env.NODE_ENV || 'development'
  };
  
  // Clear any existing startup timer
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  
  // Start backend with more robust options
  backendProcess = spawn('node', ['--unhandled-rejections=warn', 'index.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
    env: env,
    windowsHide: true,
    detached: false
  });
  
  processes.push(backendProcess);
  
  // Set startup timeout
  startupTimer = setTimeout(() => {
    if (!backendReady && !isShuttingDown) {
      console.error(`❌ Backend startup timeout (${CONFIG.startupTimeout/1000}s). Restarting...`);
      if (backendProcess) {
        try {
          backendProcess.kill();
        } catch (e) {}
      }
      restartBackend();
    }
  }, CONFIG.startupTimeout);
  
  let outputBuffer = '';
  
  backendProcess.stdout.on('data', (data) => {
    const chunk = data.toString();
    outputBuffer += chunk;
    const lines = chunk.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        console.log('[📡]', trimmed);
        
        // Update heartbeat on any output
        lastHeartbeat = Date.now();
        
        // Check if backend is ready
        if (trimmed.includes(`Listening on: http://localhost:${currentPort}`) ||
            trimmed.includes(`Listening on: http://127.0.0.1:${currentPort}`)) {
          clearTimeout(startupTimer);
          startupTimer = null;
          backendReady = true;
          restartCount = 0;
          console.log(`✅ Backend ready on port ${currentPort}!`);
          
          // Start heartbeat monitor
          startHeartbeatMonitor();
          
          // Start frontend if not already running and not shutting down
          if (!frontendProcess && !isShuttingDown) {
            console.log('🎨 Starting frontend...');
            startFrontend();
          }
        }
      }
    }
  });
  
  backendProcess.stderr.on('data', (data) => {
    const error = data.toString().trim();
    // Filter out noisy errors
    if (error && 
        !error.includes('ECONNREFUSED') && 
        !error.includes('DeprecationWarning') &&
        !error.includes('node:events') &&
        !error.includes('Assertion failed') &&
        !error.includes('UV_HANDLE_CLOSING') &&
        !error.includes('WebSocket server initialized')) {
      console.error('[Backend Error]', error);
    }
    
    // Check for specific error conditions
    if (error && error.includes('EADDRINUSE')) {
      console.error(`❌ Port ${currentPort} already in use!`);
      killProcessOnPort(currentPort).then(() => {
        if (!isShuttingDown) {
          setTimeout(() => restartBackend(), 2000);
        }
      });
    }
  });
  
  backendProcess.on('error', (err) => {
    console.error('❌ Backend process error:', err.message);
    if (!isShuttingDown && backendReady) {
      restartBackend();
    }
  });
  
  backendProcess.on('close', (code) => {
    if (startupTimer) {
      clearTimeout(startupTimer);
      startupTimer = null;
    }
    
    if (isShuttingDown) return;
    
    const exitCode = code || 0;
    if (exitCode !== 0) {
      console.error(`❌ Backend exited with code ${exitCode}`);
      // Don't restart if it was a clean exit
      if (backendReady) {
        setTimeout(() => restartBackend(), 2000);
      } else {
        console.log('❌ Backend failed to start. Retrying...');
        setTimeout(() => {
          if (!backendReady && !isShuttingDown) {
            restartBackend();
          }
        }, 3000);
      }
    } else {
      console.log('✅ Backend exited cleanly');
      backendReady = false;
    }
    backendProcess = null;
  });
  
  // Handle uncaught exceptions in the backend process
  backendProcess.on('spawn', () => {
    console.log(`✅ Backend process spawned with PID: ${backendProcess.pid}`);
  });
}

function startFrontend() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  
  // Pass the port to frontend
  const env = { 
    ...process.env,
    VITE_API_PORT: currentPort.toString(),
    VITE_API_URL: `http://localhost:${currentPort}`
  };
  
  // Kill any existing frontend
  if (frontendProcess) {
    try {
      frontendProcess.kill();
    } catch (e) {}
    frontendProcess = null;
  }
  
  // Remove any existing frontend from processes list
  processeses = processes.filter(p => p !== frontendProcess);
  
  frontendProcess = spawn(npmCmd, ['run', 'dev', '--', '--port', '5173'], {
    stdio: 'inherit',
    shell: true,
    env: env,
    windowsHide: true
  });
  
  processeses.push(frontendProcess);
  
  frontendProcess.on('error', (err) => {
    console.error('❌ Frontend error:', err.message);
  });
  
  frontendProcess.on('close', (code) => {
    if (code !== 0 && code !== null && !isShuttingDown) {
      console.error(`❌ Frontend exited with code ${code}`);
      // Try to restart frontend if backend is still running
      if (backendReady && !isShuttingDown) {
        setTimeout(() => {
          if (backendReady && !frontendProcess && !isShuttingDown) {
            console.log('🔄 Restarting frontend...');
            startFrontend();
          }
        }, 3000);
      }
    }
    frontendProcess = null;
  });
}

// Add periodic port check
function startPortMonitor() {
  setInterval(async () => {
    if (backendReady && backendProcess && !isShuttingDown) {
      const inUse = await isPortInUse(currentPort);
      if (!inUse) {
        console.error(`❌ Port ${currentPort} is no longer in use! Backend may have crashed.`);
        if (!isRestarting) {
          restartBackend();
        }
      }
    }
  }, 10000);
}

// Start the application
console.log('📡 Starting application...');
console.log(`🔍 Checking port ${CONFIG.port}...`);
console.log('💡 Press Ctrl+C to stop all services.');
console.log(`💓 Heartbeat monitoring enabled (check every ${CONFIG.heartbeatInterval/1000}s, timeout after ${CONFIG.heartbeatTimeout/1000}s)`);

// Initialize
(async () => {
  await startBackend();
  startPortMonitor();
})();

// Handle process exit
process.on('exit', () => {
  cleanup();
});