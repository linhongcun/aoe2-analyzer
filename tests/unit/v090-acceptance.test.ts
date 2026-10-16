import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import civs from '../../src/data/civs.json';
import units from '../../src/data/units.json';
import techs from '../../src/data/techs.json';
import buildings from '../../src/data/buildings.json';
import { pyMatch, search, type SearchItem } from '../../src/domain/search';
import { gatherModel } from '../../src/domain/realCost';

/** v0.9.0 验收（#145）。Kent 写，先失败，功能做完后应全部通过。 */

describe('A #145 huns42flag 行数断言等字体加载', () => {
  it('A1 huns42flag.spec.ts 在量行数之前 await document.fonts.ready', () => {
    const src = readFileSync('tests/e2e/huns42flag.spec.ts', 'utf8');
    expect(src).toMatch(/document\.fonts\.ready/);
    // 必须在 lines() 里（或其调用前）等字体，不能只在别处出现
    const body = src.slice(src.indexOf('const lines'), src.indexOf('const lines') + 600);
    expect(body).toMatch(/fonts\.ready/);
  });
});

type Row = { zh: string; en: string; py?: string; pyi?: string; id?: number };
const KINDS = { civs: 'civ', units: 'unit', buildings: 'building', techs: 'tech' } as const;
const DATA = { civs, units, buildings, techs } as unknown as Record<keyof typeof KINDS, Row[]>;
const items: SearchItem[] = (Object.keys(KINDS) as (keyof typeof KINDS)[]).flatMap((f) =>
  DATA[f].map((r) => ({ ...r, kind: KINDS[f] }) as unknown as SearchItem),
);

describe('E #145 短拼音前缀不能被中英文命中挤出前 30', () => {
  it('E1 「ba」前 30 条里有百夫长', () => {
    expect(search(items, 'ba').map((r) => r.zh)).toContain('百夫长');
  });
  it('E2 任一 2 字母查询，只要有拼音命中，前 30 条里至少出现 1 条拼音命中', () => {
    const bad: string[] = [];
    for (const a of 'abcdefghijklmnopqrstuvwxyz')
      for (const b of 'abcdefghijklmnopqrstuvwxyz') {
        const q = a + b;
        const pyHits = items.filter((it) => pyMatch(it, q));
        if (!pyHits.length) continue;
        const top = search(items, q);
        if (!top.some((it) => pyMatch(it, q))) bad.push(q);
      }
    expect(bad).toEqual([]);
  });
  it('E3 中英文命中仍排在拼音命中前面（「ba」弹道学在百夫长前）', () => {
    const r = search(items, 'ba').map((x) => x.zh);
    expect(r.indexOf('弹道学')).toBeGreaterThanOrEqual(0);
    expect(r.indexOf('弹道学')).toBeLessThan(r.indexOf('百夫长'));
  });
});

describe('F #138 已核实的文明采集加成计入「等采集时间」', () => {
  it('F1 罗马（城堡）：只计入「村民采集速度 +5%」（来源 aoe2techtree），不再单列农田 +4%', () => {
    const g = gatherModel(3, 'Romans');
    expect(g.applied.map((x) => x.label)).toEqual(['村民采集速度 +5%']);
    expect(g.unsupported).toEqual([]);
  });
  it('F2 罗马农田有效速度 = 通用 0.5300 × 1.05 = 0.5565/秒（去掉 eco.json 额外 ×1.038095）', () => {
    const base = gatherModel(3).rate.farm;
    expect(base).toBeCloseTo(0.53, 6);
    expect(gatherModel(3, 'Romans').rate.farm).toBeCloseTo(base * 1.05, 6);
    expect(gatherModel(3, 'Romans').rate.farm).toBeCloseTo(0.5565, 4);
  });
  it('F3 罗马金/木/石：比通用快，但不超过 +5%（含往返路程）', () => {
    const b = gatherModel(3).rate,
      r = gatherModel(3, 'Romans').rate;
    for (const t of ['gold', 'wood', 'stone'] as const) {
      expect(r[t], t).toBeGreaterThan(b[t]);
      expect(r[t], t).toBeLessThan(b[t] * 1.05 + 1e-9);
    }
  });
  it('F4 罗马在黑暗/封建/帝王各时代都计入', () => {
    for (const age of [1, 2, 4])
      expect(
        gatherModel(age, 'Romans').applied.map((x) => x.label),
        String(age),
      ).toEqual(['村民采集速度 +5%']);
  });
  it('F5 没有来源或本版不计的仍「未计入」且速度等于通用：马里、玛雅、波兰、葡萄牙、蜀、西西里、高棉、亚美尼亚、波希米亚', () => {
    for (const c of ['Malians', 'Mayans', 'Poles', 'Portuguese', 'Shu', 'Sicilians', 'Khmer', 'Armenians', 'Bohemians']) {
      const g = gatherModel(4, c);
      expect(g.applied, c).toEqual([]);
      expect(g.unsupported.length, c).toBeGreaterThan(0);
      expect(g.rate, c).toEqual(gatherModel(4).rate);
    }
  });
  it('F7 斯拉夫：农田采集 +15%（来源值 ×1.15，不用 eco.json 的 1.23），农田 0.5300 × 1.15 = 0.6095/秒', () => {
    const g = gatherModel(3, 'Slavs');
    expect(g.applied.map((x) => x.label)).toEqual(['农田采集 +15%']);
    expect(g.rate.farm).toBeCloseTo(0.6095, 4);
    expect(g.rate.gold).toBeCloseTo(gatherModel(3).rate.gold, 9);
  });
  it('F6 已计入的不回退：凯尔特伐木 +15%、朝鲜采石 +20%、突厥采金 +25%、柏柏尔移速 +10%', () => {
    expect(gatherModel(3, 'Celts').applied.map((x) => x.label)).toEqual(['伐木 +15%']);
    expect(gatherModel(3, 'Koreans').applied.map((x) => x.label)).toEqual(['采石 +20%']);
    expect(gatherModel(3, 'Turks').applied.map((x) => x.label)).toEqual(['采金 +25%']);
    expect(gatherModel(3, 'Berbers').applied.map((x) => x.label)).toEqual(['村民移速 +10%']);
  });
});
