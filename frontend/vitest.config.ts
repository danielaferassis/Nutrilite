import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Separado do vite.config.ts para não mexer no build de produção
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Os testes provocam erros de propósito; o log deles só poluiria a saída
    env: { VITE_LOG_LEVEL: 'SILENT' },
  },
});
