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
  port: 3003,
  frontendPort: 1757,
  maxPortAttempts: 10,
  cleanupTimeout: 5000,
};

let processes = [];
let backendProcess = null;
let frontendProcess = null;
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
    console.log(`🔍 Looking for processes on port ${port}...`);
    
    if (process.platform === 'win32') {
      // Windows: Use netstat and taskkill
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
        
        if (pids.size === 0) {
          console.log(`✅ No processes found on port ${port}`);
          resolve();
          return;
        }
        
        for (const pid of pids) {
          console.log(`🔪 Killing process ${pid} using port ${port}`);
          spawn('taskkill', ['/F', '/PID', pid], { shell: true, stdio: 'pipe' });
        }
        setTimeout(resolve, 2000);
      });
    } else {
      // Unix: Use lsof and kill
      const findCmd = spawn('lsof', ['-i', `:${port}`, '-t'], { shell: true });
      let output = '';
      findCmd.stdout.on('data', (d) => (output += d.toString()));
      findCmd.on('close', () => {
        const pids = output.split('\n').filter(pid => pid.trim() && !isNaN(parseInt(pid.trim())));
        
        if (pids.length === 0) {
          console.log(`✅ No processes found on port ${port}`);
          resolve();
          return;
        }
        
        for (const pid of pids) {
          console.log(`🔪 Killing process ${pid} using port ${port}`);
          spawn('kill', ['-9', pid.trim()], { shell: true });
        }
        setTimeout(resolve, 2000);
      });
    }
  });
}

function killProcessByName(processName) {
  return new Promise((resolve) => {
    console.log(`🔍 Looking for processes named "${processName}"...`);
    
    if (process.platform === 'win32') {
      // Windows: Use taskkill
      spawn('taskkill', ['/F', '/IM', processName, '/FI', 'WINDOWTITLE eq node*'], { 
        shell: true, 
        stdio: 'pipe' 
      });
      setTimeout(resolve, 1000);
    } else {
      // Unix: Use pkill
      const findCmd = spawn('pgrep', ['-f', processName], { shell: true });
      let output = '';
      findCmd.stdout.on('data', (d) => (output += d.toString()));
      findCmd.on('close', () => {
        const pids = output.split('\n').filter(pid => pid.trim());
        if (pids.length > 0) {
          for (const pid of pids) {
            console.log(`🔪 Killing process ${pid} (${processName})`);
            spawn('kill', ['-9', pid.trim()], { shell: true });
          }
        } else {
          console.log(`✅ No processes found for "${processName}"`);
        }
        setTimeout(resolve, 1000);
      });
    }
  });
}

async function cleanAllPortsAndProcesses() {
  console.log('\n🧹 Starting comprehensive cleanup...');
  
  // Kill specific processes first
  await killProcessByName('node.*index.js');
  await killProcessByName('vite');
  await killProcessByName('npm.*dev');
  await killProcessByName('node.*vite');
  
  // Kill processes on specific ports
  await killProcessOnPort(CONFIG.port);
  await killProcessOnPort(CONFIG.frontendPort);
  
  // Additional cleanup for any stray node processes
  if (process.platform !== 'win32') {
    await killProcessByName('node');
  }
  
  // Kill any existing child processes
  for (const p of processes) {
    try {
      if (p && !p.killed) {
        console.log(`🔪 Killing child process ${p.pid}`);
        p.kill('SIGKILL');
      }
    } catch (e) { /* ignore */ }
  }
  processes = [];
  
  console.log('✅ Cleanup completed\n');
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

// ---- Enhanced Cleanup with Process Termination ----

function cleanup() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n🛑 Shutting down...');

  // Kill all tracked processes
  [...processes].reverse().forEach(p => {
    try {
      if (p && !p.killed) {
        console.log(`🔪 Killing process ${p.pid}`);
        p.kill('SIGKILL');
      }
    } catch (e) { /* ignore */ }
  });

  // Kill any remaining processes on ports
  Promise.all([
    killProcessOnPort(CONFIG.port),
    killProcessOnPort(CONFIG.frontendPort)
  ]).then(() => {
    console.log('✅ Cleanup complete. Exiting...');
    setTimeout(() => process.exit(0), 1000);
  });

  // Fallback exit
  setTimeout(() => {
    console.log('⚠️ Force exiting...');
    process.exit(0);
  }, CONFIG.cleanupTimeout);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  cleanup();
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  cleanup();
});

// ---- Check and Clean Ports Before Starting ----

async function ensureCleanStart() {
  console.log('🔍 Checking for existing processes...');
  
  // Kill everything before starting
  await cleanAllPortsAndProcesses();
  
  // Double-check ports are free
  const portInUse = await isPortInUse(CONFIG.port);
  const frontendPortInUse = await isPortInUse(CONFIG.frontendPort);
  
  if (portInUse || frontendPortInUse) {
    console.log('⚠️ Some ports are still in use. Force cleaning...');
    await killProcessOnPort(CONFIG.port);
    await killProcessOnPort(CONFIG.frontendPort);
    
    // One final check
    const stillInUse = await isPortInUse(CONFIG.port);
    const frontendStillInUse = await isPortInUse(CONFIG.frontendPort);
    
    if (stillInUse || frontendStillInUse) {
      console.error('❌ Cannot free up ports. Please manually close applications using ports:');
      console.error(`   - Port ${CONFIG.port} (Backend)`);
      console.error(`   - Port ${CONFIG.frontendPort} (Frontend)`);
      process.exit(1);
    }
  }
  
  console.log('✅ All ports are available');
}

// ---- Backend Start ----

async function startBackend() {
  let currentPort = CONFIG.port;

  // Check port availability (already cleaned, but double-check)
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
        console.error(`❌ No available ports found. Exiting.`);
        process.exit(1);
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

  console.log(`📡 Starting backend on port ${currentPort}...`);

  backendProcess = spawn('node', ['--unhandled-rejections=warn', 'index.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
    env,
    windowsHide: true,
    detached: false
  });
  processes.push(backendProcess);

  backendProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) console.log('[📡]', trimmed);

      // Check if backend is ready
      if (trimmed.includes(`Listening on: http://localhost:${currentPort}`) ||
          trimmed.includes(`Listening on: http://127.0.0.1:${currentPort}`)) {
        console.log(`✅ Backend ready on port ${currentPort}!`);
        
        // Start frontend after backend is ready
        if (!frontendProcess && !isShuttingDown) {
          console.log('🎨 Starting frontend...');
          startFrontend(currentPort);
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
  });

  backendProcess.on('error', (err) => {
    console.error('❌ Backend process error:', err.message);
  });

  backendProcess.on('close', (code) => {
    if (isShuttingDown) return;
    console.log(`❌ Backend exited with code ${code}`);
    backendProcess = null;
    if (!isShuttingDown) {
      console.log('🛑 Backend stopped. Exiting...');
      cleanup();
    }
  });

  backendProcess.on('spawn', () => {
    console.log(`✅ Backend process spawned with PID: ${backendProcess.pid}`);
  });

  return currentPort;
}

// ---- Frontend Start ----

function startFrontend(backendPort) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const env = {
    ...process.env,
    VITE_API_PORT: backendPort.toString(),
    VITE_API_URL: `http://localhost:${backendPort}`
  };

  if (frontendProcess) {
    try { frontendProcess.kill('SIGKILL'); } catch (e) { /* ignore */ }
    frontendProcess = null;
    processes = processes.filter(p => p !== frontendProcess);
  }

  console.log(`🎨 Starting frontend on port ${CONFIG.frontendPort}...`);

  frontendProcess = spawn(npmCmd, ['run', 'dev', '--', '--port', CONFIG.frontendPort.toString()], {
    stdio: 'inherit',
    shell: true,
    env,
    windowsHide: true
  });
  processes.push(frontendProcess);

  frontendProcess.on('error', (err) => {
    console.error('❌ Frontend error:', err.message);
  });

  frontendProcess.on('close', (code) => {
    if (code !== 0 && code !== null && !isShuttingDown) {
      console.error(`❌ Frontend exited with code ${code}`);
      if (!isShuttingDown) {
        console.log('🛑 Frontend stopped. Exiting...');
        cleanup();
      }
    }
    frontendProcess = null;
  });
}

// ---- Start Everything ----

console.log('📡 Starting application...');
console.log(`🔍 Checking port ${CONFIG.port}...`);
console.log('💡 Press Ctrl+C to stop all services.');
console.log('ℹ️  No auto-restart or monitoring enabled.');

(async () => {
  // Clean everything before starting
  await ensureCleanStart();
  
  const backendPort = await startBackend();
  console.log(`✅ Application started with backend on port ${backendPort}`);
})();

process.on('exit', cleanup);