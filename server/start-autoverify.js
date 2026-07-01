// server/start-autoverify.js

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const SCRIPT_TO_RUN = path.join(__dirname, 'verify-all-accounts.js');
const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'autoverify.log');
const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 5000;

let childProcess = null;
let restartCount = 0;
let isShuttingDown = false;

// --- Helper Functions ---

/**
 * Ensures the log directory exists.
 */
async function ensureLogDirectory() {
  try {
    await fs.promises.mkdir(LOG_DIR, { recursive: true });
  } catch (err) {
    console.error(`[Manager] Error creating log directory: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Logs a message to both console and the log file.
 * @param {string} message The message to log.
 */
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  console.log(message);
  
  try {
    fs.appendFileSync(LOG_FILE, logMessage);
  } catch (err) {
    console.error(`[Manager] Failed to write to log file: ${err.message}`);
  }
}

/**
 * Starts and manages the auto-verification script.
 */
function startProcess() {
  if (isShuttingDown) return;

  log(`[Manager] Starting auto-run script: ${path.basename(SCRIPT_TO_RUN)}`);

  childProcess = spawn('node', [SCRIPT_TO_RUN], {
    stdio: ['pipe', 'pipe', 'pipe'], // Use pipes to capture output
    shell: false,
  });

  // Log stdout
  childProcess.stdout.on('data', (data) => {
    const message = data.toString().trim();
    if (message) log(`[AutoRun] ${message}`);
  });

  // Log stderr
  childProcess.stderr.on('data', (data) => {
    const message = data.toString().trim();
    if (message) log(`[AutoRun ERROR] ${message}`);
  });

  childProcess.on('error', (err) => {
    log(`[Manager] Failed to start child process: ${err.message}`);
  });

  childProcess.on('close', (code) => {
    if (isShuttingDown) return;

    log(`[Manager] Auto-run script exited with code ${code}.`);
    
    if (restartCount < MAX_RESTARTS) {
      restartCount++;
      log(`[Manager] Restarting in ${RESTART_DELAY_MS / 1000}s (Attempt ${restartCount}/${MAX_RESTARTS})...`);
      setTimeout(startProcess, RESTART_DELAY_MS);
    } else {
      log(`[Manager] Maximum restart limit reached. Exiting.`);
      process.exit(1);
    }
  });

  log(`[Manager] Auto-run process started with PID: ${childProcess.pid}`);
}

/**
 * Gracefully shuts down the manager and the child process.
 */
function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  log('[Manager] Shutting down...');
  if (childProcess) {
    childProcess.kill('SIGTERM'); // Send termination signal
    log(`[Manager] Sent SIGTERM to child process ${childProcess.pid}.`);
  }
  
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// --- Main Execution ---
ensureLogDirectory().then(() => {
  startProcess();
});