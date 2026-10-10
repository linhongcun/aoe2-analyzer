/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './'：GitHub Pages 子路径 /aoe2-analyzer/ 与本地预览都可用（配合 HashRouter）
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2020', chunkSizeWarningLimit: 600 },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
