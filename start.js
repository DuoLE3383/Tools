import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { createServer } from 'net';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting Tool...');
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

// ---- Utility Functions ----

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = createServer()
      .once('error', (err) => {
        if (err.code === 'EADDRINUSE') resolve(true);
        else resolve(false);
      })
      .once('listening', () => {
        server.close();
        resolve(false);
      })
      .listen(port);
  });
}

function killProcessOnPort(port) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const findCmd = spawn('netstat', ['-ano', '-p', 'TCP'], { shell: true });
      let output = '';
      findCmd.stdout.on('data', (d) => (output += d.toString()));
      findCmd.on('close', () => {
        const lines = output.split('\n');
        const pids = new Set();
        for (const line of lines) {
          if (line.includes(`:${port}`) && line.includes('LISTENING')) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && !isNaN(parseInt(pid))) pids.add(pid);
          }
        }
        for (const pid of pids) {
          console.log(`🔪 Killing process ${pid} using port ${port}`);
          spawn('taskkill', ['/F', '/PID', pid], { shell: true, stdio: 'pipe' });
        }
        setTimeout(resolve, 2000);
      });
    } else {
      const findCmd = spawn('lsof', ['-i', `:${port}`], { shell: true });
      let output = '';
      findCmd.stdout.on('data', (d) => (output += d.toString()));
      findCmd.on('close', () => {
        const lines = output.split('\n');
        const pids = new Set();
        for (const line of lines) {
          if (line.includes(`:${port}`) && line.includes('LISTEN')) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
              const pid = parts[1];
              if (pid && !isNaN(parseInt(pid))) pids.add(pid);
            }
          }
        }
        for (const pid of pids) {
          console.log(`🔪 Killing process ${pid} using port ${port}`);
          spawn('kill', ['-9', pid], { shell: true });
        }
        setTimeout(resolve, 2000);
      });
    }
  });
}

async function findAvailablePort(startPort) {
  let port = startPort;
  while (port < startPort + CONFIG.maxPortAttempts) {
    const inUse = await isPortInUse(port);
    if (!inUse) return port;
    port++;
  }
  return null;
}

// ---- Cleanup ----

function cleanup() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n🛑 Shutting down...');
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (startupTimer) clearTimeout(startupTimer);

  [...processes].reverse().forEach(p => {
    try {
      if (p && !p.killed) {
        p.kill('SIGTERM');
        setTimeout(() => { if (p && !p.killed) p.kill('SIGKILL'); }, 2000);
      }
    } catch (e) { /* ignore */ }
  });

  setTimeout(() => process.exit(0), 3000);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
});

// ---- Heartbeat Monitor ----

function startHeartbeatMonitor() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    const timeSinceHeartbeat = Date.now() - lastHeartbeat;
    if (backendReady && timeSinceHeartbeat > CONFIG.heartbeatTimeout) {
      console.error(`❌ Backend frozen! No heartbeat for ${timeSinceHeartbeat}ms`);
      restartBackend();
    }
  }, CONFIG.heartbeatInterval);
}

// ---- Backend Restart ----

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
  if (backendProcess) {
    try {
      backendProcess.kill('SIGTERM');
      setTimeout(() => {
        if (backendProcess && !backendProcess.killed) backendProcess.kill('SIGKILL');
      }, 1000);
    } catch (e) { /* ignore */ }
    backendProcess = null;
  }
  backendReady = false;
  await killProcessOnPort(currentPort);

  setTimeout(async () => {
    console.log(`📡 Starting backend on port ${currentPort}...`);
    await startBackend();
    isRestarting = false;
  }, CONFIG.restartDelay);
}

// ---- Backend Start ----

async function startBackend() {
  // Check port availability
  let portInUse = await isPortInUse(currentPort);
  if (portInUse) {
    console.log(`⚠️ Port ${currentPort} is in use. Attempting to free it...`);
    await killProcessOnPort(currentPort);
    const stillInUse = await isPortInUse(currentPort);
    if (stillInUse) {
      console.log(`❌ Port ${currentPort} still in use. Looking for alternative...`);
      const newPort = await findAvailablePort(currentPort + 1);
      if (newPort) {
        console.log(`✅ Using alternative port: ${newPort}`);
        currentPort = newPort;
        process.env.PORT = currentPort.toString();
      } else {
        console.error(`❌ No available ports found.`);
        setTimeout(() => restartBackend(), 5000);
        return;
      }
    } else {
      console.log(`✅ Port ${currentPort} is now available.`);
    }
  }

  const env = {
    ...process.env,
    PORT: currentPort.toString(),
    NODE_ENV: process.env.NODE_ENV || 'development'
  };

  if (startupTimer) clearTimeout(startupTimer);

  backendProcess = spawn('node', ['--unhandled-rejections=warn', 'index.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
    env,
    windowsHide: true,
    detached: false
  });
  processes.push(backendProcess);

  startupTimer = setTimeout(() => {
    if (!backendReady && !isShuttingDown) {
      console.error(`❌ Backend startup timeout (${CONFIG.startupTimeout / 1000}s). Restarting...`);
      if (backendProcess) {
        try { backendProcess.kill(); } catch (e) { /* ignore */ }
      }
      restartBackend();
    }
  }, CONFIG.startupTimeout);

  backendProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) console.log('[📡]', trimmed);
      lastHeartbeat = Date.now();

      if (trimmed.includes(`Listening on: http://localhost:${currentPort}`) ||
          trimmed.includes(`Listening on: http://127.0.0.1:${currentPort}`)) {
        clearTimeout(startupTimer);
        startupTimer = null;
        backendReady = true;
        restartCount = 0;
        console.log(`✅ Backend ready on port ${currentPort}!`);
        startHeartbeatMonitor();
        if (!frontendProcess && !isShuttingDown) {
          console.log('🎨 Starting frontend...');
          startFrontend();
        }
      }
    }
  });

  backendProcess.stderr.on('data', (data) => {
    const error = data.toString().trim();
    if (error && !error.includes('ECONNREFUSED') && !error.includes('DeprecationWarning') &&
        !error.includes('node:events') && !error.includes('Assertion failed') &&
        !error.includes('UV_HANDLE_CLOSING') && !error.includes('WebSocket server initialized')) {
      console.error('[Backend Error]', error);
    }
    if (error && error.includes('EADDRINUSE')) {
      console.error(`❌ Port ${currentPort} already in use!`);
      killProcessOnPort(currentPort).then(() => {
        if (!isShuttingDown) setTimeout(() => restartBackend(), 2000);
      });
    }
  });

  backendProcess.on('error', (err) => {
    console.error('❌ Backend process error:', err.message);
    if (!isShuttingDown && backendReady) restartBackend();
  });

  backendProcess.on('close', (code) => {
    if (startupTimer) clearTimeout(startupTimer);
    if (isShuttingDown) return;
    if (code !== 0) {
      console.error(`❌ Backend exited with code ${code}`);
      if (backendReady) setTimeout(() => restartBackend(), 2000);
      else if (!isShuttingDown) setTimeout(() => restartBackend(), 3000);
    } else {
      console.log('✅ Backend exited cleanly');
      backendReady = false;
    }
    backendProcess = null;
  });

  backendProcess.on('spawn', () => {
    console.log(`✅ Backend process spawned with PID: ${backendProcess.pid}`);
  });
}

// ---- Frontend Start ----

function startFrontend() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const env = {
    ...process.env,
    VITE_API_PORT: currentPort.toString(),
    VITE_API_URL: `http://localhost:${currentPort}`
  };

  if (frontendProcess) {
    try { frontendProcess.kill(); } catch (e) { /* ignore */ }
    frontendProcess = null;
    processes = processes.filter(p => p !== frontendProcess);
  }

  frontendProcess = spawn(npmCmd, ['run', 'dev', '--', '--port', '1757'], {
    stdio: 'inherit',
    shell: true,
    env,
    windowsHide: true
  });
  processes.push(frontendProcess);

  frontendProcess.on('error', (err) => console.error('❌ Frontend error:', err.message));
  frontendProcess.on('close', (code) => {
    if (code !== 0 && code !== null && !isShuttingDown) {
      console.error(`❌ Frontend exited with code ${code}`);
      if (backendReady && !frontendProcess && !isShuttingDown) {
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

// ---- Port Monitor ----

function startPortMonitor() {
  setInterval(async () => {
    if (backendReady && backendProcess && !isShuttingDown) {
      const inUse = await isPortInUse(currentPort);
      if (!inUse) {
        console.error(`❌ Port ${currentPort} is no longer in use! Backend may have crashed.`);
        if (!isRestarting) restartBackend();
      }
    }
  }, 10000);
}

// ---- Start Everything ----

console.log('📡 Starting application...');
console.log(`🔍 Checking port ${CONFIG.port}...`);
console.log('💡 Press Ctrl+C to stop all services.');
console.log(`💓 Heartbeat monitoring enabled (check every ${CONFIG.heartbeatInterval / 1000}s, timeout after ${CONFIG.heartbeatTimeout / 1000}s)`);

(async () => {
  await startBackend();
  startPortMonitor();
})();

process.on('exit', cleanup);