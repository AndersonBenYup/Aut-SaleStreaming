import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// En desarrollo el panel corre en :5173 y le pasa /api y /dev a la API en :3000 (misma cookie, sin CORS).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/dev': 'http://localhost:3000',
    },
  },
});
