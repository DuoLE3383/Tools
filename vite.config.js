import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig(({ command }) => ({
  plugins: [react(), command === 'build' ? cloudflare() : undefined].filter(Boolean),
  server: {
    host: true,
    watch: { usePolling: true },
    proxy: {
      '/api/md': {
        target: 'https://www.mining-dutch.nl',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/md/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
        }
      },
      '/api/2miners': {
        target: 'https://2miners.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/2miners/, '/api'),
      },
      '/api/k1pool': {
        target: 'https://k1pool.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/k1pool/, '/api'),
      },
      '/api/kryptex': {
        target: 'https://pool.kryptex.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/kryptex/, '/api/v2'),
      },
      '/api/herominers': {
        target: 'https://herominers.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/herominers/, '/api'),
      },
      '/api': {
        target: 'http://127.0.0.1:3003',
        configure: (proxy) => {
          proxy.on('error', (err) => console.error('Proxy error:', err));
        },
        changeOrigin: true,
      },
    },
  },
}))
