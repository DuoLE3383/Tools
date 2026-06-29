import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy API requests
      '/api': {
        target: 'http://localhost:3001', // Your backend server address
        changeOrigin: true,
      },
      // Proxy WebSockets
      '/ws': {
        target: 'ws://localhost:3001', // Your WebSocket server address
        ws: true,
        /**
         * Custom error handler for the WebSocket proxy.
         * This is used to gracefully handle ECONNABORTED errors that can occur
         * when the client disconnects while the server is trying to write to the socket.
         * This is common during development with HMR.
         */
        onError: (err, req, res) => {
          if (res.socket?.destroyed && err.code === 'ECONNRESET') {
            console.log('WebSocket proxy client disconnected (ECONNRESET).');
            return;
          }
          if (err.code === 'ECONNABORTED') {
            console.log('WebSocket proxy connection aborted by client.');
            return;
          }
          // For other errors, log them
          console.error('WebSocket proxy error:', err);
        },
      },
    },
  },
});