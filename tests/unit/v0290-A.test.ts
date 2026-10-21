/**
 * v0.29.0 验收（#329）A 组：数据与内容正确性。Kent 写，先失败。
 * - #317 罗马「是否计入」标签：真值由工具本身算出（真实成本 gatherModel / 等资源 discountedCost），清单存 fixtures 供 e2e 逐页核对。
 * - #312 侦察辨析 extra-tc 的来源与「本站整理」。
 * - #265 内容指南：官方支持站文章的「发布日期」应为文章创建日期。
 * - #314 战役目录：同年排序规则与文案一致。
 * 公开来源见各 describe 注释。
 */
import { describe, expect, it } from 'vitest';
import civsRaw from '../../src/data/civs.json';
import catalog from '../../src/content/contentCatalog.json';
import scouting from '../../src/content/scouting.json';
import { civBonuses } from '../../src/domain/civBonus';
import { defaultCampaignFilters, filterCampaigns, type Campaign } from '../../src/domain/campaigns';
import { discountedCost, priceAge } from '../../src/domain/costDiscount';
import { gatherModel } from '../../src/domain/realCost';
import type { Civ } from '../../src/domain/types';
import toolUsed from '../e2e/fixtures/v0290-317-tool-used.json';
import { units } from './helpers';

const civs = civsRaw as unknown as Civ[];
const civ = (en: string) => civs.find((c) => c.en === en)!;

// ---------- #317 ----------
// 公开来源：https://ageofempires.fandom.com/wiki/Romans_(Age_of_Empires_II) 「Villagers gather, build, and repair 5% faster」「Scorpions cost -50% gold」
// 本站 .dat：eco.json civEco.Romans tech 887 workRate ×1.05（class:4），tech 892 goldCost ×0.5（unit 279/542）
interface Used {
  civ: string;
  idx: number;
  src: string;
  zh: string;
  realCostGather: boolean;
  costDiscount: boolean;
}
/** 由工具本身判定：真实成本的采集模型在任一时代应用了这条加成，或等资源 / 真实成本的折扣在任一单位、任一时代应用了这条加成 */
function computeToolUsed(): Used[] {
  const out: Used[] = [];
  for (const c of civs)
    for (const b of civBonuses(c)) {
      if (b.team || typeof b.idx !== 'number') continue;
      const idx = b.idx;
      const realCostGather = [1, 2, 3, 4].some((age) => gatherModel(age, c.en).applied.some((line) => line.source === b.zh));
      const costDiscount = units.some((u) =>
        [1, 2, 3, 4].some((age) => discountedCost(u, c.en, priceAge(u.age, age)).applied.some((line) => line.idx === idx)),
      );
      if (realCostGather || costDiscount) out.push({ civ: c.en, idx, src: b.src, zh: b.zh, realCostGather, costDiscount });
    }
  return out;
}

describe('#317 文明加成「是否计入」与工具实际计算一致', () => {
  const used = computeToolUsed();
  it('工具实际使用的加成清单与 e2e 逐页核对的清单一致（数值不变则清单不变）', () => {
    expect(used).toEqual(toolUsed);
  });
  it('罗马第 1 条：真实成本的采集模型计入村民 +5%（农田无往返，恰为 ×1.05；伐木 / 采金 / 采石含往返步行，增幅小于 5% 但大于 0），与 .dat tech 887 一致', () => {
    expect(used.find((u) => u.civ === 'Romans' && u.idx === 0)).toMatchObject({ src: 'eco', realCostGather: true });
    for (const age of [1, 2, 3, 4]) {
      const g = gatherModel(age, 'Romans');
      expect(g.applied, `${age}`).toEqual([{ label: '村民采集速度 +5%', techs: [887], source: '村民收集、建造和修理的速度 +5%' }]);
      const rome = g.rate,
        base = gatherModel(age, '').rate;
      // 农田另乘 1.038095 是否重复计算由 #197 跟踪；真实成本只乘 1.05，这里锁住现状不变
      expect(rome.farm / base.farm, `${age} farm`).toBeCloseTo(1.05, 12);
      for (const task of ['wood', 'gold', 'stone'] as const) {
        expect(rome[task] / base[task], `${age} ${task}`).toBeGreaterThan(1);
        expect(rome[task] / base[task], `${age} ${task}`).toBeLessThan(1.05);
      }
    }
  });
  it('罗马第 3 条：蝎式弩黄金 -50% 已计入等资源 / 真实成本的折后价（75 木 75 金 到 75 木 37.5 金）', () => {
    expect(used.find((u) => u.civ === 'Romans' && u.idx === 2)).toMatchObject({ src: 'eco', costDiscount: true });
    const scorpion = units.find((u) => u.id === 279)!;
    const d = discountedCost(scorpion, 'Romans', priceAge(scorpion.age, 3));
    expect(d.base).toEqual({ Gold: 75, Wood: 75 }); // aoe2techtree.net data.json Unit 279 SCBAL：Wood 75 / Gold 75
    expect(d.exact).toEqual({ Gold: 37.5, Wood: 75 });
  });
  it('罗马 4 条加成里，第 1、3 条的 src 都是 eco（同一机制），第 2、4 条为 dat 已计入', () => {
    expect(civBonuses(civ('Romans')).map((b) => [b.idx, b.src])).toEqual([
      [0, 'eco'],
      [1, 'dat'],
      [2, 'eco'],
      [3, 'dat'],
      ['team', 'dat'],
    ]);
  });
});

// ---------- #312 ----------
// 公开来源：https://aoecoach.com/en/resources/buildings/town-center/ 「Castle Age Boom: Upon reaching Castle Age, immediately build 2-3 additional Town Centers」
// もち（https://note.com/aoe2_moti/n/ne0367d003ef2）只讲黑暗到封建时代侦察，未讲城镇中心。
describe('#312 侦察辨析：新增城镇中心的来源', () => {
  const walled = scouting.scenarios.find((s) => s.id === 'walled')!;
  const signal = (id: string) => walled.signals.find((s) => s.id === id)!;
  it('extra-tc 只保留 AoE2 Coach 城镇中心页，不再标「本站整理」', () => {
    expect(signal('extra-tc').sourceIds).toEqual(['aoecoach-town-center']);
    expect(signal('extra-tc').editorial ?? false).toBe(false);
  });
  it('AoE2 Coach 来源是公开页面', () => {
    expect(scouting.sources.find((s) => s.id === 'aoecoach-town-center')!.url).toBe('https://aoecoach.com/en/resources/buildings/town-center/');
  });
  it('守卫：forward-building、forward-units 仍为「本站整理」', () => {
    expect(signal('forward-building').editorial).toBe(true);
    expect(signal('forward-units').editorial).toBe(true);
  });
});

// ---------- #265 ----------
// 公开接口 https://support.ageofempires.com/api/v2/help_center/en-us/articles/<id>.json（2026-10-21 18:16 北京时间读取）：
//   15552096234644 created_at 2023-05-10T20:33:21Z（北京 2023-05-11），edited_at 2026-01-20T21:57:09Z
//   31839163606932 created_at 2024-11-04T18:47:03Z（北京 2024-11-05），edited_at 2026-07-17T19:23:26Z
// 验收二选一：改用 created_at 仍叫「发布日期」；或改名为「更新于」。日期取 UTC 还是北京时间未规定，两种都接受。
const SUPPORT_CREATED: Record<string, string[]> = {
  '15552096234644': ['2023-05-10', '2023-05-11'],
  '31839163606932': ['2024-11-04', '2024-11-05'],
};
const SUPPORT_EDITED: Record<string, string[]> = {
  '15552096234644': ['2026-01-20', '2026-01-21'],
  '31839163606932': ['2026-07-17', '2026-07-18'],
};
type Src = { id: string; url: string; publishedAt?: string; [k: string]: unknown };
const supportSources = () =>
  (catalog.products as unknown as { id: string; sources: Src[] }[]).flatMap((p) =>
    p.sources.filter((s) => s.url.includes('support.ageofempires.com')).map((s) => ({ product: p.id, s })),
  );

describe('#265 内容指南：官方支持站文章的日期', () => {
  it('共 3 处引用支持站文章（回归罗马 1 处、编年史 FAQ 2 处）', () => {
    expect(supportSources().map(({ product, s }) => `${product}/${s.id}`)).toEqual([
      'return-of-rome/mode-support',
      'chronicles-battle-for-greece/chronicles-faq',
      'chronicles-alexander-the-great/chronicles-faq',
    ]);
  });
  for (const { product, s } of supportSources()) {
    const article = s.url.match(/articles\/(\d+)/)![1]!;
    it(`${product}/${s.id}：标成发布日期的必须是创建日期（${SUPPORT_CREATED[article]!.join(' 或 ')}），编辑日期不能再记在 publishedAt`, () => {
      if (s.publishedAt !== undefined) expect(SUPPORT_CREATED[article]).toContain(s.publishedAt);
      // 改名方案：若保留编辑日期，必须换成别的字段名（页面显示「更新于」，由 e2e 核对）
      else expect(Object.values(s).some((v) => typeof v === 'string' && SUPPORT_EDITED[article]!.includes(v))).toBe(true);
    });
  }
});

// ---------- #314 ----------
// 选项 1：按游戏内战役列表顺序。《国王时代》战役列表：William Wallace → Joan of Arc → Saladin → Genghis Khan → Barbarossa
//   （https://ageofempires.fandom.com/wiki/Campaigns_(Age_of_Empires_II) ）；《征服者》：Attila the Hun → El Cid → Montezuma，历史战役排在战役之后。
// 选项 2：按英文名（nameEn）字母顺序，比较键从内部 id 改为 nameEn。
const year = (list: readonly Campaign[], y: number) => list.filter((c) => c.releaseYear === y).map((c) => c.nameEn);
const alpha = (names: string[]) => [...names].sort((a, b) => a.localeCompare(b, 'en'));
const IN_GAME_1999 = ['William Wallace', 'Joan of Arc', 'Saladin', 'Genghis Khan', 'Barbarossa'];
const IN_GAME_2000_CAMPAIGNS = ['Attila the Hun', 'El Cid', 'Montezuma'];

describe('#314 战役目录：同一年发行的排序规则', () => {
  const list = filterCampaigns(defaultCampaignFilters());
  it('1999、2000 两组的顺序符合二选一规则之一（英文名字母序，或游戏内列表顺序）', () => {
    const y1999 = year(list, 1999),
      y2000 = year(list, 2000);
    const byName = JSON.stringify(y1999) === JSON.stringify(alpha(y1999)) && JSON.stringify(y2000) === JSON.stringify(alpha(y2000));
    const inGame =
      JSON.stringify(y1999) === JSON.stringify(IN_GAME_1999) &&
      JSON.stringify(y2000.filter((n) => IN_GAME_2000_CAMPAIGNS.includes(n))) === JSON.stringify(IN_GAME_2000_CAMPAIGNS) &&
      y2000.slice(0, 3).every((n) => IN_GAME_2000_CAMPAIGNS.includes(n));
    expect(byName || inGame, `1999：${y1999.join('、')}；2000：${y2000.join('、')}`).toBe(true);
  });
  it('比较键不是内部 id：把某条的 id 改到字母序最前，同年顺序不应随之改变（选「游戏内顺序」且按 id 查表时本条不适用）', () => {
    if (JSON.stringify(year(list, 1999)) === JSON.stringify(IN_GAME_1999)) return;
    const entries = filterCampaigns(defaultCampaignFilters()).map((c) => (c.nameEn === 'William Wallace' ? { ...c, id: 'aaa-william-wallace' } : c));
    const resorted = filterCampaigns(defaultCampaignFilters(), entries);
    expect(year(resorted, 1999)).toEqual(year(list, 1999));
  });
  it('「游戏覆盖历史起始时间」排序：同年平局同样不按内部 id（对调两条的 id，顺序不变）', () => {
    const base = filterCampaigns(defaultCampaignFilters());
    const a = { ...base[0]!, historicalStartYear: 1000 },
      b = { ...base[1]!, historicalStartYear: 1000 };
    const order = (x: Campaign, y: Campaign) => filterCampaigns({ ...defaultCampaignFilters(), sort: 'history' }, [x, y]).map((c) => c.nameEn);
    expect(order({ ...a, id: 'zzz' }, { ...b, id: 'aaa' })).toEqual(order({ ...a, id: 'aaa' }, { ...b, id: 'zzz' }));
  });
});
