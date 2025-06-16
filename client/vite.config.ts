import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './', // Ensure relative asset paths for Electron
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  define: {
    'process.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || 'https://auth-streaming-server.victoriouswater-bf2045fa.centralindia.azurecontainerapps.io/api'),
    'process.env.VITE_SIGNALING_URL': JSON.stringify(process.env.VITE_SIGNALING_URL || 'https://auth-streaming-server.victoriouswater-bf2045fa.centralindia.azurecontainerapps.io')
  }
});