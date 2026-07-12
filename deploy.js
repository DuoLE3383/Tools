import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = __dirname

console.log('🚀 Starting build and deploy process...')

// Step 1: Build the project
console.log('\n📦 Step 1: Building project...')

// Check if dist exists and clean it
const distPath = path.join(projectRoot, 'dist')
if (fs.existsSync(distPath)) {
  console.log('🧹 Cleaning dist directory...')
  fs.rmSync(distPath, { recursive: true, force: true })
}

// Build frontend with Vite
console.log('🎨 Building frontend...')
try {
  execSync('npx vite build', { 
    stdio: 'inherit',
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: 'production' }
  })
  console.log('✅ Frontend build complete!')
} catch (error) {
  console.error('❌ Frontend build failed:', error.message)
  process.exit(1)
}

// Step 2: Load environment variables
console.log('\n🔧 Step 2: Loading environment variables...')
dotenv.config({ path: path.join(projectRoot, '.env') })

// Step 3: Generate wrangler config
console.log('\n📝 Step 3: Generating wrangler configuration...')

const templatePath = path.join(projectRoot, 'wrangler.toml')
const outputPath = path.join(projectRoot, 'wrangler.generated.toml')

if (!fs.existsSync(templatePath)) {
  console.error('❌ wrangler.toml template not found!')
  process.exit(1)
}

let template = fs.readFileSync(templatePath, 'utf8')

// Remove existing [vars] section
template = template.replace(/\n?\[vars\][\s\S]*?(?=\n\[|$)/, '');

// Define all variables from .env
const vars = {
  // NiceHash
  NICEHASH_API_KEY: process.env.NICEHASH_API_KEY,
  NICEHASH_API_SECRET: process.env.NICEHASH_API_SECRET,
  NICEHASH_ORG_ID: process.env.NICEHASH_ORG_ID,
  NICEHASH_API_KEY_PH: process.env.NICEHASH_API_KEY_PH,
  NICEHASH_API_SECRET_PH: process.env.NICEHASH_API_SECRET_PH,
  NICEHASH_ORG_ID_PH: process.env.NICEHASH_ORG_ID_PH,
  NICEHASH_ENVIRONMENT_PH: process.env.NICEHASH_ENVIRONMENT_PH || 'production',
  NICEHASH_ENVIRONMENT: process.env.NICEHASH_ENVIRONMENT || 'production',
  NICEHASH_API_KEY_PH3: process.env.NICEHASH_API_KEY_PH3,
  NICEHASH_API_SECRET_PH3: process.env.NICEHASH_API_SECRET_PH3,
  NICEHASH_ORG_ID_PH3: process.env.NICEHASH_ORG_ID_PH3,
  NICEHASH_API_KEY_HUDA: process.env.NICEHASH_API_KEY_HUDA,
  NICEHASH_API_SECRET_HUDA: process.env.NICEHASH_API_SECRET_HUDA,
  NICEHASH_ORG_ID_HUDA: process.env.NICEHASH_ORG_ID_HUDA,
  NICEHASH_API_KEY_LN: process.env.NICEHASH_API_KEY_LN,
  NICEHASH_API_SECRET_LN: process.env.NICEHASH_API_SECRET_LN,
  NICEHASH_ORG_ID_LN: process.env.NICEHASH_ORG_ID_LN,
  NICEHASH_API_KEY_NHATLINH: process.env.NICEHASH_API_KEY_NHATLINH,
  NICEHASH_API_SECRET_NHATLINH: process.env.NICEHASH_API_SECRET_NHATLINH,
  NICEHASH_ORG_ID_NHATLINH: process.env.NICEHASH_ORG_ID_NHATLINH,
  
  // MRR
  MRR_KEY_RIG_BT: process.env.MRR_KEY_RIG_BT,
  MRR_SECRET_RIG_BT: process.env.MRR_SECRET_RIG_BT,
  MRR_KEY_RIG_SL: process.env.MRR_KEY_RIG_SL,
  MRR_SECRET_RIG_SL: process.env.MRR_SECRET_RIG_SL,
  MRR_KEY_RIG_LN: process.env.MRR_KEY_RIG_LN,
  MRR_SECRET_RIG_LN: process.env.MRR_SECRET_RIG_LN,
  MRR_KEY_RIG_LUCKY: process.env.MRR_KEY_RIG_LUCKY,
  MRR_SECRET_RIG_LUCKY: process.env.MRR_SECRET_RIG_LUCKY,
  MRR_NONCE_OVERRIDE_LUCKY: process.env.MRR_NONCE_OVERRIDE_LUCKY,
  MRR_NONCE_OVERRIDE_LN: process.env.MRR_NONCE_OVERRIDE_LN,
  MRR_NONCE_OVERRIDE_SL: process.env.MRR_NONCE_OVERRIDE_SL,
  MRR_NONCE_OVERRIDE_BT: process.env.MRR_NONCE_OVERRIDE_BT,
  MRR_DEFAULT_CLIENT: process.env.MRR_DEFAULT_CLIENT,
  NH_DEFAULT_CLIENT: process.env.NH_DEFAULT_CLIENT,
  TUNNEL_URL: process.env.TUNNEL_URL,
  
  // Third-party APIs
  MINERSTAT_API: process.env.MINERSTAT_API,
  HASHRATE_NO_API: process.env.HASHRATE_NO_API,
  WTM_API: process.env.WTM_API,
  COINDESK_API: process.env.COINDESK_API,
  CMC_API: process.env.CMC_API,
  VITE_MININGDUTCH_ID: process.env.VITE_MININGDUTCH_ID,
  VITE_MININGDUTCH_API_BT: process.env.VITE_MININGDUTCH_API_BT,
  
  // Telegram
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  TELEGRAM_MINE_BOT_TOKEN: process.env.TELEGRAM_MINE_BOT_TOKEN,
  TELEGRAM_GROUP_ID: process.env.TELEGRAM_GROUP_ID,
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
  TELEGRAM_ID: process.env.TELEGRAM_ID,
  
  // Auth
  JWT_SECRET: process.env.JWT_SECRET,
  ADMIN_USER: process.env.ADMIN_USER,
  ADMIN_PASS: process.env.ADMIN_PASS,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  BCRYPT_ROUNDS: process.env.BCRYPT_ROUNDS,
  
  // Miner Addresses
  HEROMINERS_ADDRESSES: process.env.HEROMINERS_ADDRESSES,
  '2MINERS_ADDRESSES': process.env['2MINERS_ADDRESSES'],
  K1POOL_ADDRESSES: process.env.K1POOL_ADDRESSES,
  KRYPTEX_ADDRESSES: process.env.KRYPTEX_ADDRESSES,
  
  // Frontend / Vite
  VITE_API_URL: process.env.VITE_API_URL,
  VITE_WS_URL: process.env.VITE_WS_URL,
  PORT: process.env.PORT,
  gemini_api: process.env.gemini_api,
  server: process.env.server,
};

// Check for missing variables
const missingKeys = Object.entries(vars)
  .filter(([_, value]) => typeof value === 'undefined' || value === '')
  .map(([key]) => key)

if (missingKeys.length > 0) {
  console.warn(`⚠️ Warning: missing env vars: ${missingKeys.join(', ')}`)
  console.warn('💡 These variables will be omitted from deployment')
}

// Generate vars section
const varsSnippet = Object.entries(vars)
  .filter(([_, value]) => typeof value !== 'undefined' && value !== '')
  .map(([key, value]) => {
    const tomlKey = /^[A-Za-z0-9_-]+$/.test(key) ? key : `"${key}"`;
    return `${tomlKey} = ${JSON.stringify(value)}`;
  })
  .join('\n')

// Write generated config
const output = `${template.trim()}\n\n[vars]\n${varsSnippet}\n`
fs.writeFileSync(outputPath, output, 'utf8')
console.log(`✅ Generated ${path.basename(outputPath)}`)

// Step 4: Deploy to Cloudflare
console.log('\n🚀 Step 4: Deploying to Cloudflare Workers...')

try {
  // Check if wrangler is installed
  try {
    execSync('wrangler --version', { stdio: 'ignore' })
  } catch {
    console.log('📦 Installing wrangler...')
    execSync('npm install -g wrangler', { stdio: 'inherit' })
  }

  // Deploy
  execSync('wrangler deploy --config wrangler.generated.toml', { 
    stdio: 'inherit',
    cwd: projectRoot
  })
  
  console.log('\n✅ Deployment successful! 🎉')
  console.log(`📍 Worker deployed to: https://${process.env.TUNNEL_URL || 'your-worker.dev'}`)
  
} catch (error) {
  console.error('\n❌ Deployment failed:', error.message)
  process.exit(1)
}