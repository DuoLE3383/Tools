#!/bin/bash

echo "🚀 Deploying to Cloudflare..."

# Build the frontend
echo "📦 Building frontend..."
npm run build

# Generate wrangler config
echo "⚙️ Generating wrangler config..."
npm run generate-wrangler

# Deploy worker
echo "🌐 Deploying worker..."
npx wrangler deploy --config wrangler.generated.toml

# Deploy tunnel (if needed)
echo "🔌 Deploying tunnel..."
cloudflared tunnel run my-tunnel

echo "✅ Deployment complete!"
echo "🌍 Frontend: https://app.huyenbao.com"
echo "🔗 API: https://api.huyenbao.com"