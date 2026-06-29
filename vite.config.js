import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig(({ command }) => ({
  plugins: [react(), command === 'build' ? cloudflare() : undefined].filter(Boolean),
  server: {
    port: 5173,
    host: true,
    watch: { usePolling: true },
    proxy: {
      // ✅ HeroMiners proxy - external site
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
      
      // ✅ Mining-Dutch proxy - external site
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
      
      // ✅ Main API proxy - YOUR BACKEND
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        ws: true, // ✅ Enable WebSocket proxying
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.error('[API Proxy] Error:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('[API Proxy] ->', req.url);
          });
          // ✅ Handle WebSocket upgrade
          proxy.on('upgrade', (proxyReq, socket, head) => {
            console.log('[WS Proxy] WebSocket upgrade');
          });
        },
        // ✅ Don't rewrite - keep path as is
        // rewrite: (path) => path, // This is the default behavior
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
}))