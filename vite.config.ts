/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const sha = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
})();
const dat = (
  JSON.parse(readFileSync('src/data/effects.json', 'utf8')) as { meta: { sources: { id: string; commit: string; patch: string }[] } }
).meta.sources.find((s) => s.id === 'DAT');

// base './'：GitHub Pages 子路径 /aoe2-analyzer/ 与本地预览都可用（配合 HashRouter）
export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __BUILD__: JSON.stringify(sha),
    __DATA_VERSION__: JSON.stringify(dat ? `${dat.patch}；.dat auto-mods@${dat.commit}` : 'unknown'),
  },
  build: { target: 'es2020', chunkSizeWarningLimit: 600 },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
