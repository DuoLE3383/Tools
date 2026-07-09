import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig(({ command }) => ({
  plugins: [react(), command === 'build' ? cloudflare() : undefined].filter(Boolean),
  server: {
    port: 1757,
    host: true,
    watch: { usePolling: true },
    allowedHosts: ['localhost', 'huyenbao.com', 'api.huyenbao.com', 'api.herominers.com', 'api.mining-dutch.nl', 'api.nicehash.com', 'api.miningrigrentals.com', 'api2.miningrigrentals.com', 'www.huyenbao.com', 'www.herominers.com', 'www.mining-dutch.nl', 'www.nicehash.com', 'www.miningrigrentals.com', 'www2.miningrigrentals.com'],
    proxy: {
      '/api/hm': {
        target: 'https://herominers.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/hm/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
        },
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.error('[HM Proxy] Error:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('[HM Proxy] ->', req.url);
          });
        }
      },
      '/api/md': {
        target: 'https://www.mining-dutch.nl',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/md/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
        },
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.error('[MD Proxy] Error:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('[MD Proxy] ->', req.url);
          });
        }
      },
      '/api/v2/prices/ws': {
        target: 'ws://localhost:3003',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.error('[API Proxy] Error:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('[API Proxy] ->', req.url);
          });
          proxy.on('upgrade', (proxyReq, req, socket, head) => {
            console.log('[WS Proxy] WebSocket upgrade');
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // ✅ Option 2: Remove manualChunks entirely and let Vite handle it
    rollupOptions: {
      output: {
        // Keep it simple - Vite will auto-split
        assetFileNames: 'assets/[name].[hash].[ext]',
        chunkFileNames: 'assets/[name].[hash].js',
        entryFileNames: 'assets/[name].[hash].js',
      },
    },
    chunkSizeWarningLimit: 1000,
  },
}))