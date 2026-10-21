import { readFileSync } from 'node:fs';
import { formatClock } from '../../src/domain/formatTime';
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { simSupport } from '../../src/domain/simSupport';
import { TOOLS } from '../../src/shared/nav/sections';
import { listMeta, timeText } from '../../src/features/builds/listMeta';
import { BN_LONG_CHARS, isLongBottleneck } from '../../src/features/builds/timelineModel';

const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;

describe('#3 收尾：列表页时间由模拟器实时算', () => {
  it.each(buildOrders.map((b) => b.id))('%s：列表时间 = 通用默认参数模拟的到达时间', (id) => {
    const bo = buildOrders.find((b) => b.id === id)!;
    const tl = simulateBuild(bo, 'Generic', eco as unknown as EcoData, ups);
    const m = listMeta(bo);
    const feudal = tl.ageUps.find((a) => a.age === 'feudal')!;
    expect(m.time).toContain(formatClock(feudal.reachAt));
  });
  it('timeText 格式', () => {
    expect(timeText([{ age: 'feudal', reachAt: 554 }], 2)).toBe('约 9:14 到达封建');
    expect(
      timeText(
        [
          { age: 'feudal', reachAt: 630 },
          { age: 'castle', reachAt: 840 },
        ],
        3,
      ),
    ).toBe('约 10:30 封建、14:00 城堡');
    expect(timeText([], 2)).toBe('');
  });
  it('列表组件不再渲染开局 JSON 里手写的 target.time', () => {
    expect(readFileSync('src/features/builds/BuildOrderList.tsx', 'utf8')).not.toContain('target.time');
  });
});

describe('#3 收尾：推荐文明标「加成未计入」', () => {
  it('unsupported = 推荐文明中 simSupport 为 false 的', () => {
    for (const bo of buildOrders) expect(listMeta(bo).unsupported).toEqual(bo.civs.filter((c) => !simSupport(c)));
  });
  it('scouts-18 推荐的匈奴（v0.7.0 已支持）和法兰克都不标', () => {
    const u = listMeta(buildOrders.find((b) => b.id === 'scouts-18')!).unsupported;
    expect(u).not.toContain('Huns');
    expect(u).not.toContain('Franks');
  });
});

describe('#3 收尾：首页不再写开局「开发中」', () => {
  it('工具卡与首页都不提时间轴开发中', () => {
    expect(TOOLS.find((s) => s.key === 'builds')!.desc).not.toMatch(/开发中/);
    expect(readFileSync('src/features/home/components/Home.tsx', 'utf8')).not.toContain('开局时间轴');
  });
});

describe('#3 收尾：390 摘要 is-long（>14 个显示字符，按码点计）', () => {
  it('阈值常量', () => expect(BN_LONG_CHARS).toBe(14));
  it('恰好 14 字不触发', () => {
    const s = '卡人口 · 约 0:45 起'; // 含「·」、数字、空格
    expect([...s].length).toBe(14);
    expect(isLongBottleneck(s)).toBe(false);
  });
  it('15 字触发', () => {
    const s = '卡人口 · 约 10:58 起';
    expect([...s].length).toBe(15);
    expect(isLongBottleneck(s)).toBe(true);
  });
  it('纯中文 14 / 15', () => {
    expect(isLongBottleneck('一二三四五六七八九十一二三四')).toBe(false);
    expect(isLongBottleneck('一二三四五六七八九十一二三四五')).toBe(true);
  });
  it('CSS 在已有 600px 断点内、无新断点、卡点用 token', () => {
    const css = readFileSync('src/shared/styles/layout.css', 'utf8');
    expect(css).toMatch(/\.tl-summary li\.tl-bn\.is-long\s*\{\s*grid-column: 1 \/ -1;/);
    expect(css).toMatch(/repeat\(2, minmax\(0, 1fr\)\)/);
  });
});

describe('#3 收尾：搜索提示带上开局', () => {
  it('首页搜索框与命令面板占位文案提到开局', () => {
    expect(readFileSync('src/features/home/components/Home.tsx', 'utf8')).toContain('搜索文明、单位、科技、开局…');
    expect(readFileSync('src/features/search/components/CommandPalette.tsx', 'utf8')).toContain('搜索文明、单位、科技、开局…（中/英）');
  });
  it('开局搜索结果直达对应时间线', () => {
    expect(readFileSync('src/features/search/hooks.ts', 'utf8')).toContain('href: `/builds?bo=${b.id}`');
  });
});

/** drush-fc / feudal-drush-18 的内容修正在 P0 模拟器 PR 里（Reid 按来源改），这里先不覆盖 */
const P0_DATA = ['drush-fc', 'feudal-drush-18'];
describe('#3 收尾：步骤内部不自相矛盾', () => {
  it.each(buildOrders.map((b) => b.id).filter((id) => !P0_DATA.includes(id)))('%s：「到达某时代」步开始不晚于该时代到达 + 1 秒', (id) => {
    const bo = buildOrders.find((b) => b.id === id)!;
    const tl = simulateBuild(bo, 'Generic', eco as unknown as EcoData, ups);
    bo.steps.forEach((st, i) => {
      if (!st.phase || st.phase.endsWith('-click')) return;
      const reach = tl.ageUps.find((a) => a.age === st.phase)!.reachAt;
      expect(tl.steps[i]!.startAt, `第 ${i + 1} 步`).toBeLessThanOrEqual(reach + 1);
    });
  });
  it.each(buildOrders.map((b) => b.id).filter((id) => !P0_DATA.includes(id)))('%s：点升之后的步骤说明不再写「点升」', (id) => {
    const bo = buildOrders.find((b) => b.id === id)!;
    for (const age of ['feudal', 'castle'] as const) {
      const k = bo.steps.findIndex((s) => s.phase === `${age}-click`);
      if (k < 0) continue;
      const word = age === 'feudal' ? /点升封建/ : /点升城堡|点城堡/;
      bo.steps.slice(k + 1).forEach((s, j) => expect(s.note ?? '', `第 ${k + j + 2} 步`).not.toMatch(word));
    }
  });
});
