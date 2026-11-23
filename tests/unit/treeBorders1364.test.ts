import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { civs, loadCore, loadTrees, type Core } from '../../src/data';
import { treeNodeIdentity } from '../../src/domain/treeIdentity';
import type { Trees } from '../../src/domain/types';
import CivTechTree from '../../src/features/tree/components/CivTechTree';
import { layoutTree } from '../../src/features/tree/logic/layout';
import type { CoreTreesResources } from '../../src/shared/utils/useCoreTrees';

let core: Core;
let trees: Trees;

beforeAll(async () => {
  [core, trees] = await Promise.all([loadCore(), loadTrees()]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function parseBlockTokens(css: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    const name = match[1];
    const raw = match[2];
    if (name && raw) map[name] = raw.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  }
  return map;
}

function loadThemeTokens(): { light: Record<string, string>; dark: Record<string, string> } {
  const css = readFileSync(new URL('../../src/shared/styles/tokens.css', import.meta.url), 'utf8');
  const darkMarker = ":root[data-theme='dark']";
  const darkAt = css.indexOf(darkMarker);
  if (darkAt < 0) throw new Error('tokens.css 缺少深色主题定义');
  const light = parseBlockTokens(css.slice(0, darkAt));
  const darkOverrides = parseBlockTokens(css.slice(darkAt));
  return { light, dark: { ...light, ...darkOverrides } };
}

function resolveColor(map: Record<string, string>, name: string, seen = new Set<string>()): string {
  if (seen.has(name)) throw new Error(`令牌存在循环引用：${name}`);
  const value = map[name];
  if (!value) throw new Error(`缺少令牌：${name}`);
  const ref = value.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)$/i);
  if (ref?.[1]) {
    const next = new Set(seen);
    next.add(name);
    if (map[ref[1]]) return resolveColor(map, ref[1], next);
    if (ref[2]) return ref[2].trim().toLowerCase();
  }
  const hex = value.match(/^#[0-9a-f]{6}$/i)?.[0];
  if (!hex) throw new Error(`令牌 ${name} 未解析为 6 位十六进制色值：${value}`);
  return hex.toLowerCase();
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function wcagContrast(a: string, b: string): number {
  const lum = (hex: string) =>
    rgb(hex)
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, idx) => sum + v * [0.2126, 0.7152, 0.0722][idx]!, 0);
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function hexToLab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex)
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const x = r! * 0.4124564 + g! * 0.3575761 + b! * 0.1804375;
  const y = r! * 0.2126729 + g! * 0.7151522 + b! * 0.072175;
  const z = r! * 0.0193339 + g! * 0.119192 + b! * 0.9503041;
  const f = (t: number) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
  const fx = f(x / 0.95047);
  const fy = f(y / 1.0);
  const fz = f(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function ciede2000(h1: string, h2: string): number {
  const [l1, a1, b1] = hexToLab(h1);
  const [l2, a2, b2] = hexToLab(h2);
  const cBar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const hp = (ap: number, b: number) => {
    if (ap === 0 && b === 0) return 0;
    const deg = (Math.atan2(b, ap) * 180) / Math.PI;
    return deg < 0 ? deg + 360 : deg;
  };
  const h1p = hp(a1p, b1);
  const h2p = hp(a2p, b2);
  const dLp = l2 - l1;
  const dCp = c2p - c1p;
  let dhp = 0;
  if (c1p * c2p !== 0) {
    if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
    else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
    else dhp = h2p - h1p + 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(((dhp / 2) * Math.PI) / 180);
  const lBarp = (l1 + l2) / 2;
  const cBarp = (c1p + c2p) / 2;
  let hBarp = h1p + h2p;
  if (c1p * c2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hBarp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hBarp = (h1p + h2p + 360) / 2;
    else hBarp = (h1p + h2p - 360) / 2;
  }
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const t = 1 - 0.17 * Math.cos(rad(hBarp - 30)) + 0.24 * Math.cos(rad(2 * hBarp)) + 0.32 * Math.cos(rad(3 * hBarp + 6)) - 0.2 * Math.cos(rad(4 * hBarp - 63));
  const dTheta = 30 * Math.exp(-(((hBarp - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cBarp ** 7 / (cBarp ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lBarp - 50) ** 2) / Math.sqrt(20 + (lBarp - 50) ** 2);
  const sc = 1 + 0.045 * cBarp;
  const sh = 1 + 0.015 * cBarp * t;
  const rt = -Math.sin(rad(2 * dTheta)) * rc;
  return Math.sqrt((dLp / sl) ** 2 + (dCp / sc) ** 2 + (dHp / sh) ** 2 + rt * (dCp / sc) * (dHp / sh));
}

describe('#1364 科技树去角标与五色身份边框', () => {
  it('遍历全部 56 文明：零 .tmark 角标，所有独特/区域格均有身份类与无障碍文字', () => {
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      matchMedia: () => ({ matches: false }),
      history: { state: null, replaceState: vi.fn() },
      location: { href: 'https://example.test/#/civ/Franks#techtree' },
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );

    const resources: CoreTreesResources = {
      core: { data: core, pending: false, error: false, retry: () => {} },
      trees: { data: trees, pending: false, error: false, retry: () => {} },
      retry: () => {},
    };
    const exists = (k: 'u' | 't' | 'b', id: number) => !!(k === 'u' ? core.unitById[id] : k === 'b' ? core.buildingById[id] : core.techById[id]);

    expect(civs).toHaveLength(56);
    let totalCells = 0;
    let uniqueCount = 0;
    let regionalCount = 0;
    let unavailableRegionalCount = 0;

    for (const civ of civs) {
      let view!: ReactTestRenderer;
      act(() => {
        view = create(h(MemoryRouter, { initialEntries: [`/civ/${civ.en}#techtree`] }, h(CivTechTree, { civEn: civ.en, resources })));
      });
      const marks = view.root.findAll((node) => typeof node.props.className === 'string' && /\btmark\b/.test(node.props.className));
      expect(marks, `${civ.en} 不应渲染任何 .tmark`).toHaveLength(0);

      const swatches = view.root.findAll((node) => node.type === 'i' && typeof node.props.className === 'string' && /\btl1\b/.test(node.props.className));
      expect(swatches, `${civ.en} 基础图例应有 6 项`).toHaveLength(6);

      const layout = layoutTree(trees, civ.en, null, exists);
      const cellNodes = view.root.findAll((node) => node.type === 'a' && typeof node.props.className === 'string' && /\btcell\b/.test(node.props.className));
      expect(cellNodes, `${civ.en} 渲染格数应与布局一致`).toHaveLength(layout.cells.length);
      totalCells += cellNodes.length;

      for (let i = 0; i < layout.cells.length; i++) {
        const cell = layout.cells[i]!;
        const node = cellNodes[i]!;
        const classes = new Set(String(node.props.className).split(/\s+/));
        const entity = cell.k === 'u' ? core.unitById[cell.id]! : cell.k === 'b' ? core.buildingById[cell.id]! : core.techById[cell.id]!;
        const ident = treeNodeIdentity(cell.k, cell.id, cell.k === 'b' ? null : entity.type);

        expect(classes.has('na'), `${civ.en} ${cell.k}${cell.id} na 类`).toBe(!cell.avail);
        if (!ident) {
          expect(classes.has('uq'), `${civ.en} ${cell.k}${cell.id}`).toBe(false);
          expect(classes.has('rg'), `${civ.en} ${cell.k}${cell.id}`).toBe(false);
          expect(classes.has('unit-identity'), `${civ.en} ${cell.k}${cell.id}`).toBe(false);
          expect(node.props['aria-label']).toBeUndefined();
        } else {
          if (ident.group === 'unique') uniqueCount++;
          else {
            regionalCount++;
            if (!cell.avail) unavailableRegionalCount++;
          }
          expect(classes.has('uq'), `${civ.en} ${cell.k}${cell.id}`).toBe(ident.group === 'unique');
          expect(classes.has('rg'), `${civ.en} ${cell.k}${cell.id}`).toBe(ident.group === 'regional');
          expect(classes.has('unit-identity'), `${civ.en} ${cell.k}${cell.id}`).toBe(cell.k === 'u');
          expect(node.props['aria-label']).toBe(`${entity.zh}，${ident.label}`);
          expect(String(node.props.title)).toContain(ident.label);
        }
      }

      const kindLabels = view.root.findAll(
        (node) => typeof node.props.className === 'string' && (/\btbld-kind\b/.test(node.props.className) || /\btother-kind\b/.test(node.props.className)),
      );
      for (const label of kindLabels) expect(['独特建筑', '区域建筑']).toContain(label.children[0]);

      act(() => view.unmount());
    }

    expect(totalCells).toBeGreaterThan(8000);
    expect(uniqueCount).toBeGreaterThan(200);
    expect(regionalCount).toBeGreaterThan(150);
    expect(unavailableRegionalCount).toBeGreaterThan(0);
  });

  it.each(['light', 'dark'] as const)('%s 主题：五种边框色两两互异，且满足 CIEDE2000 ΔE00 与 WCAG 对比度阈值', (theme) => {
    const tokens = loadThemeTokens()[theme];
    const normal = resolveColor(tokens, '--c-border');
    const unitUq = resolveColor(tokens, '--color-tree-unit-uq');
    const unitRg = resolveColor(tokens, '--color-tree-unit-rg');
    const techUq = resolveColor(tokens, '--color-accent');
    const techRg = resolveColor(tokens, '--color-tree-tech-rg');
    const diffUp = resolveColor(tokens, '--c-up');
    const control = resolveColor(tokens, '--c-control');
    const bg = resolveColor(tokens, '--color-bg');
    const surface = resolveColor(tokens, '--color-surface');
    const surface2 = resolveColor(tokens, '--color-surface-2');

    expect(techRg).toBe(theme === 'light' ? '#0b7285' : '#4fc3d9');
    expect(new Set([normal, unitUq, unitRg, techUq, techRg]).size).toBe(5);

    expect(ciede2000(techRg, normal)).toBeGreaterThanOrEqual(40);
    for (const other of [unitUq, unitRg, techUq]) {
      expect(ciede2000(other, normal)).toBeGreaterThanOrEqual(40);
      expect(ciede2000(techRg, other)).toBeGreaterThanOrEqual(20);
    }
    expect(ciede2000(techRg, diffUp)).toBeGreaterThanOrEqual(20);

    for (const backing of [control, bg, surface, surface2]) expect(wcagContrast(techRg, backing)).toBeGreaterThanOrEqual(3);
  });
});
