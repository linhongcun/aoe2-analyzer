/** P0 批次回归：#15 #26 #27 #18 #22 #28（文案为 Jony 锁定稿，逐字断言） */
import { describe, expect, it } from 'vitest';
import civsRaw from '../../src/data/civs.json';
import type { Civ } from '../../src/domain/types';
import { EMPTY_COUNTERS_COPY, STRONG_THRESHOLD, filterCounterUnits, matchup, strengthEntries } from '../../src/domain/ratings';
import { DPS_UNAVAILABLE_REASON, duel, fighterFrom, oneWay } from '../../src/domain/duel';
import { simulate } from '../../src/domain/simulator';
import { ctx, units } from './helpers';
import { search, type SearchItem } from '../../src/domain/search';
import { TECH_AKA } from '../../src/features/search/hooks';
import { CLASS_AKA } from '../../src/features/simulator/components/SimPanel';
import { techs } from './helpers';
import { readFileSync } from 'node:fs';

const civs = civsRaw as unknown as Civ[];
const civ = (en: string) => civs.find((c) => c.en === en)!;
const STRONG = '对手经济强，前期主动骚扰。';
const WEAK = '对手经济一般，可以稳健发育拖后期。';

describe('#15 强项与建议同门槛 8', () => {
  it('门槛为 8', () => expect(STRONG_THRESHOLD).toBe(8));
  it('不列颠经济=7：强项不含经济；建议用「一般」', () => {
    const m = matchup(civ('Franks'), civ('Britons'));
    expect(civ('Britons').s[3]).toBe(7);
    expect(m.strengths.some((s) => s.key === 'eco')).toBe(false);
    expect(m.advice).toContain(WEAK);
    expect(m.advice).not.toContain(STRONG);
  });
  it('经济>=8：强项含经济；建议用「强」', () => {
    const opp = civs.find((c) => c.s[3]! >= 8)!;
    const m = matchup(civ('Franks'), opp);
    expect(m.strengths.some((s) => s.key === 'eco')).toBe(true);
    expect(m.advice).toContain(STRONG);
  });
  it('遍历 civ×civ：强项只含 >=8；含经济 <=> 建议为「强」', () => {
    for (const a of civs)
      for (const e of civs) {
        const m = matchup(a, e);
        for (const s of m.strengths) expect(s.score).toBeGreaterThanOrEqual(8);
        const eco = m.strengths.some((s) => s.key === 'eco');
        expect(m.tips.includes(WEAK)).toBe(!eco);
        expect(m.tips.includes(STRONG)).toBe(eco);
      }
  });
  it('strengthEntries 由高到低', () => {
    const s = strengthEntries(civ('Chinese')).map((x) => x.score);
    expect([...s].sort((a, b) => b - a)).toEqual(s);
  });
});

describe('#26 反制按本方科技树过滤', () => {
  it('法兰克 vs 不列颠 / 玛雅 vs 法兰克：不含骆驼', () => {
    for (const [me, opp] of [
      ['Franks', 'Britons'],
      ['Mayans', 'Franks'],
      ['Franks', 'Saracens'],
    ] as const) {
      const items = filterCounterUnits(me, civ(opp).ty, units);
      expect(items.map((i) => i.nameZh).join('')).not.toMatch(/骆驼/);
    }
  });
  it('所有组合：每一项本方都能造', () => {
    for (const a of civs)
      for (const e of civs) for (const u of filterCounterUnits(a.en, e.ty, units)) expect(units.find((x) => x.id === u.id)!.civs).toContain(a.en);
  });
  it('空态文案锁定', () => expect(EMPTY_COUNTERS_COPY).toBe('当前文明暂无可用反制推荐'));
  it('无可造反制时返回空（不回退）', () => expect(filterCounterUnits('Nobody', ['cav'], units)).toEqual([]));
  it('页面使用「推荐反制」标题与空态常量，不出现「需…」灰显', () => {
    const src = readFileSync('src/features/matchup/components/Matchup.tsx', 'utf8');
    expect(src).toContain('推荐反制');
    expect(src).toContain('EMPTY_COUNTERS_COPY');
    expect(src).not.toMatch(/需\{|「需/);
  });
});

describe('#27 火焰骆驼 rof=0', () => {
  const F = (id: number) => {
    const u = units.find((x) => x.id === id)!;
    return fighterFrom(u, simulate(ctx, u, u.civs[0]!, 4, new Set(), new Set()));
  };
  it('oneWay：dps/time 为 null 或有限值，不是 Infinity/NaN', () => {
    const r = oneWay(F(1263), F(74));
    expect(r.dps).toBeNull();
    expect(r.time === null || Number.isFinite(r.time)).toBe(true);
    expect(r.dpsReason).toBe('爆炸单位，无攻击间隔');
    expect(DPS_UNAVAILABLE_REASON).toBe('爆炸单位，无攻击间隔');
  });
  it('duel 不抛错、时长有限', () => {
    const d = duel(F(1263), F(74));
    expect(Number.isFinite(d.duration)).toBe(true);
  });
});

describe('#18 类别中文名', () => {
  it('units.json 中所有攻击/护甲类别都有中文名（无「类别N」）', () => {
    for (const u of units) for (const f of [u.atks, u.arms, u.armc]) for (const [n] of f) expect(n, `${u.en}`).not.toMatch(/^类别\d+$/);
  });
  it('类别 29 显示为冲击步兵，旧称在悬停提示', () => {
    expect(units.find((u) => u.en === 'Eagle Warrior')!.armc.map(([n]) => n)).toContain('冲击步兵');
    expect(JSON.stringify(units.map((u) => [u.atks, u.armc]))).not.toContain('鹰战士');
    expect(CLASS_AKA['冲击步兵']).toBe('旧称：鹰战士类');
  });
  it('楼船类别：远程战船', () => expect(units.find((u) => u.id === 1948)!.armc.map(([n]) => n)).toContain('远程战船'));
  it('1452 便携弯弩装置：搜 绞盘弩 / Cranequins / 正式名都命中', () => {
    const items: SearchItem[] = techs.map((t) => ({ kind: 'tech', id: String(t.id), zh: t.zh, en: t.en, href: '', sub: '', alt: TECH_AKA[t.id] }));
    for (const q of ['绞盘弩', 'Cranequins', '便携弯弩装置']) expect(search(items, q)[0]!.id).toBe('1452');
  });
});

describe('#22 双射程', () => {
  const u = (id: number) => units.find((x) => x.id === id)!;
  it('1968/1970/1948：对单位 5/6/10，对建筑 9/10/13；楼船最小 3', () => {
    expect([u(1968).rng, u(1968).rngB]).toEqual([5, 9]);
    expect([u(1970).rng, u(1970).rngB]).toEqual([6, 10]);
    expect([u(1948).rng, u(1948).rngB, u(1948).minr]).toEqual([10, 13, 3]);
  });
  it('rngB 只在与 rng 不同时存在', () => {
    for (const x of units) if (x.rngB != null) expect(x.rngB).not.toBe(x.rng);
  });
});

describe('#22 对建筑小字格式', () => {
  it('rangeB 仅在不同才返回；组件文案「对建筑 N」/「建筑 N」，无括号', async () => {
    const { rangeB } = await import('../../src/shared/ui/RangeB');
    expect(rangeB({ rng: 5, rngB: 9 })).toBe(9);
    expect(rangeB({ rng: 4 })).toBeNull();
    const src = readFileSync('src/shared/ui/RangeB.tsx', 'utf8');
    expect(src).toContain('对建筑 {n}');
    expect(src).toContain('建筑 {n}');
    expect(src).toContain('对建筑射程 ${n}');
    for (const f of ['src/features/units/components/UnitDetail.tsx', 'src/features/duel/components/Duel.tsx'])
      expect(readFileSync(f, 'utf8')).not.toContain('（对建筑');
  });
});

describe('#28 开局页头', () => {
  it('不含草稿/待内容审核，文案为「N 个主流开局；时间轴视图开发中」', () => {
    const src = readFileSync('src/features/builds/BuildOrderList.tsx', 'utf8');
    expect(src).not.toMatch(/草稿|待内容审核/);
    expect(src).toContain('${buildOrders.length} 个主流开局；时间轴视图开发中');
  });
});

describe('#31 开局流程入口', () => {
  it('工具首项为开局流程 /builds，且不再是规划中', async () => {
    const { TOOLS, FUTURE, WIKI } = await import('../../src/app/nav/sections');
    expect(TOOLS[0]).toMatchObject({ key: 'builds', path: '/builds', label: '开局流程' });
    expect(TOOLS[0]!.status).toBeUndefined();
    expect(FUTURE.map((s) => s.key)).not.toContain('builds');
    // 顶部导航：首页·文明·单位·建筑·科技·科技树·工具
    expect(['首页', ...WIKI.filter((s) => !s.hideNav).map((s) => s.label), '工具']).toEqual(['首页', '文明', '单位', '建筑', '科技', '科技树', '工具']);
  });
  it('首页「正在制作」不再列开局流程', () => {
    const src = readFileSync('src/features/home/components/Home.tsx', 'utf8');
    expect(src).toContain('<p>开局时间轴 · 版本补丁</p>');
    expect(src).not.toMatch(/地图 ·|天梯/);
    expect(src).not.toMatch(/正在制作[\s\S]*开局流程/);
  });
  it('Ctrl+K 索引包含 6 个开局名', () => {
    const src = readFileSync('src/features/search/hooks.ts', 'utf8');
    expect(src).toContain('buildOrders.forEach');
  });
});
