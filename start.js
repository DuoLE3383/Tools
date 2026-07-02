// start.js - Single-process performance launcher with auto port kill
import { spawn, execSync } from 'child_process';

const PORT = 3003;
try {
  console.log(`🔪 Killing process on port ${PORT}...`);
  execSync(`npx --yes kill-port ${PORT}`, { stdio: 'ignore' });
} catch (_) {}

console.log('🚀 Starting backend (optimised)...');
process.env.NODE_ENV = 'production';
const MEMORY_LIMIT_MB = 4096;

const child = spawn('node', [
  `--max-old-space-size=${MEMORY_LIMIT_MB}`,
  'index.js'
], {
  stdio: 'inherit',
  env: { ...process.env }
});

child.on('error', (err) => console.error('❌ Error:', err.message));
child.on('close', (code) => process.exit(code || 0));

process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());

console.log(`✅ Backend started on port ${PORT} – Press Ctrl+C to stop.`);