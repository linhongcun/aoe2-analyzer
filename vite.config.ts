/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildFamilies, unitCount } from './src/domain/family';
import type { Unit } from './src/domain/types';

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

const pins = JSON.parse(readFileSync('scripts/data_sources.json', 'utf8')) as unknown;
const notes = readdirSync('docs/PATCH-NOTES')
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/\.md$/, ''))
  .sort((a, b) => +b - +a);

// #14：首页单位数在构建时从数据算出（首页不加载 units.json），口径与列表页同一个函数
const units = JSON.parse(readFileSync('src/data/units.json', 'utf8')) as Unit[];
const UNIT_COUNT = unitCount(units, buildFamilies(units, Object.fromEntries(units.map((u) => [u.id, u]))));

// base './'：GitHub Pages 子路径 /aoe2-analyzer/ 与本地预览都可用（配合 HashRouter）
export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __UNIT_COUNT__: JSON.stringify(UNIT_COUNT),
    __BUILD__: JSON.stringify(sha),
    __DATA_SOURCES__: JSON.stringify(pins),
    __PATCH_NOTES__: JSON.stringify(notes),
    __DATA_VERSION__: JSON.stringify(dat ? `${dat.patch}；.dat auto-mods@${dat.commit}` : 'unknown'),
  },
  build: { target: 'es2020', chunkSizeWarningLimit: 600 },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
