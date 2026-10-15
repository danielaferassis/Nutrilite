import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Polling é necessário para o hot reload funcionar com volumes do Docker no Windows
    watch: { usePolling: process.env.DOCKER === 'true' },
    // Requisições para /api vão para o backend, sem precisar configurar CORS
    proxy: {
      '/api': process.env.API_URL || 'http://localhost:8000',
    },
  },
})
