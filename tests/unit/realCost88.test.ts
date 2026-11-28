// v0.7.0 #88 真实费用 / 等采集时间（Kent 草稿 #120 issuecomment-6157773161）。
// 期望值不抄手算数字：用同一口径直接从 eco.json 按科技 id 独立推一遍，避免数据或规则变化后测试和实现一起漂移。
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import civs from '../../data/game/civs.json';
import eco from '../../data/game/eco.json';
import units from '../../data/game/units.json';
import { discountedCost, priceAge } from '../../src/domain/costDiscount';
import {
  countForTime,
  DEFAULT_MIN,
  DEFAULT_VILS,
  defaultGatherEcoTechIds,
  fmtClock,
  gatherBonusIdx,
  gatherModel,
  gatherUnsupportedSources,
  realCost,
} from '../../src/domain/realCost';
import type { Unit } from '../../src/domain/types';
import { RealCostBlock, uncountedText } from '../../src/shared/ui/RealCost';

type Eff = { kind: string; attr?: string; target?: string; op?: string; v?: number };
const E = eco as unknown as {
  villager: { speed: number; tasks: Record<string, { workRate: number; carry: number }> };
  ecoTechs: Record<string, { effects: Eff[] }>;
  civEco: Record<string, { tech?: number; effects: Eff[] }[]>;
};
const v = (tech: number, target: string, attr: string, civ?: string) => {
  const effs = civ ? E.civEco[civ]!.find((r) => r.tech === tech)!.effects : E.ecoTechs[String(tech)]!.effects;
  return effs.find((e) => e.target === target && e.attr === attr)!.v!;
};
const T = E.villager.tasks;
const carry3 = T.gold!.carry * v(213, 'class:4', 'carry') * v(249, 'class:4', 'carry');
const speed3 = E.villager.speed * v(213, 'class:4', 'speed') * v(249, 'class:4', 'speed');
const eff = (wr: number, carry: number, speed: number) => carry / (carry / wr + 6 / speed);
const gold3 = eff(T.gold!.workRate * v(55, 'task:gold', 'workRate') * v(182, 'task:gold', 'workRate'), carry3, speed3);
const wood3wr = T.wood!.workRate * v(202, 'task:wood', 'workRate') * v(203, 'task:wood', 'workRate');
const wood3 = eff(wood3wr, carry3, speed3);
const wood4 = eff(wood3wr * v(221, 'task:wood', 'workRate'), carry3, speed3);
const farm = T.farm!.workRate;

// #162：文案逐项对照 civs.json 原文，避免沿用泛化原因。
/** 按加成行单独写原因的行（Steve 定稿：波兰大庄园三行） */
const LABEL_REASON: Record<string, string> = { 波兰庄园农田加成: '大庄园替代磨坊，未建模' };
const UNCOUNTED_CASES = [
  ['Danes', '捕鱼船和村民存放的食物 +5%', '存放食物，未建模'],
  ['Malians', '村民存放的黄金额外 +10%', '存放黄金加成，未建模'],
  ['Poles', '石矿工不仅能产生石料，还能产生黄金', '石矿工兼产黄金，未建模'],
  ['Portuguese', '采果工不仅能产生食物，还能产生木材', '采果兼产木材，未建模'],
  ['Shu', '伐木工不仅能产生木材，还能产生食物', '伐木兼产食物，未建模'],
  ['Sicilians', '农田升级提供的食物 +125%', '农田升级，未建模'],
  ['Khmer', '农民不需要磨坊或城镇中心就可以存放食物', '免磨坊存放食物，未建模'],
  ['Aztecs', '村民携带量 +3', '携带量加成，未建模'],
] as const;
const UNCOUNTED_CIVS = ['Bohemians', 'Mayans', ...UNCOUNTED_CASES.map(([civ]) => civ)];

const time = (uid: number, cost: Record<string, number>, civ: string, age = 3) => {
  const d = discountedCost({ id: uid, cost }, civ, priceAge(3, age));
  return { d, rc: realCost(d.cost, gatherModel(age, civ)) };
};

describe('#88 采集速度', () => {
  it('1 通用：城堡金/木、帝王木、农田', () => {
    const g3 = gatherModel(3),
      g4 = gatherModel(4);
    expect(g3.rate.gold).toBeCloseTo(gold3, 6);
    expect(g3.rate.wood).toBeCloseTo(wood3, 6);
    expect(g4.rate.wood).toBeCloseTo(wood4, 6);
    expect(g3.rate.farm).toBe(farm);
    expect(g4.rate.gold).toBeCloseTo(gold3, 6); // 帝王时代没有新的采金科技
  });
  it('3 柏柏尔村民移速计入（金更快）；突厥采金 +25% 计入', () => {
    const b = gatherModel(3, 'Berbers');
    const sp = speed3 * v(584, 'class:4', 'speed', 'Berbers') * v(600, 'class:4', 'speed', 'Berbers');
    expect(b.rate.gold).toBeCloseTo(eff(T.gold!.workRate * v(55, 'task:gold', 'workRate') * v(182, 'task:gold', 'workRate'), carry3, sp), 3);
    expect(b.rate.gold).toBeGreaterThan(gatherModel(3).rate.gold);
    expect(b.applied.map((x) => x.label)).toEqual(['村民移速 +10%']);
    const t = gatherModel(3, 'Turks');
    expect(t.applied.map((x) => x.label)).toEqual(['采金 +25%']);
    expect(t.rate.gold).toBeCloseTo(
      eff(T.gold!.workRate * v(55, 'task:gold', 'workRate') * v(182, 'task:gold', 'workRate') * v(300, 'task:gold', 'workRate', 'Turks'), carry3, speed3),
      6,
    );
  });
  it('S6 马里 res 276 读不准：未计入，按通用速度', () => {
    const m = gatherModel(3, 'Malians');
    expect(m.applied).toEqual([]);
    expect(m.unsupported.map((x) => x.label)).toEqual(['采金加成']);
    expect(m.rate).toEqual(gatherModel(3).rate);
  });
  it('Q5 罗马、斯拉夫的采集加成有 aoe2techtree 来源，已计入（#138）', () => {
    expect(gatherModel(3, 'Romans').applied.map((x) => x.label)).toEqual(['村民采集速度 +5%']);
    expect(gatherModel(3, 'Slavs').applied.map((x) => x.label)).toEqual(['农田采集 +15%']);
    for (const c of ['Romans', 'Slavs']) {
      const g = gatherModel(3, c);
      expect(g.unsupported).toEqual([]);
      expect(g.rate.farm).toBeGreaterThan(gatherModel(3).rate.farm);
    }
  });
});

describe('等采集时间：文明加成来源', () => {
  const render = (civ: string, age: number) => {
    const knight = (units as unknown as Unit[]).find((u) => u.en === 'Knight')!;
    return renderToStaticMarkup(
      createElement(RealCostBlock, {
        k: 'a',
        civ,
        civZh: civs.find((c) => c.en === civ)?.zh ?? civ,
        age,
        d: discountedCost(knight, civ, age),
        vils: 10,
        min: 10,
      }),
    );
  };

  it.each([
    ['Romans', /^Villagers gather/],
    ['Slavs', /^Farmers work/],
    ['Celts', /^Lumberjacks work/],
    ['Koreans', /^Stone miners work/],
    ['Turks', /^Gold miners work/],
    ['Berbers', /^Villagers move/],
  ] as const)('%s 各时代已计入项展示对应的中文文明描述', (civ, bonus) => {
    const data = civs.find((c) => c.en === civ)!;
    const source = data.bon[data.bonEn.findIndex((text) => bonus.test(text))];
    expect(source).toBeTruthy();
    for (const age of [1, 2, 3, 4]) {
      const g = gatherModel(age, civ);
      expect(g.applied).toHaveLength(1);
      expect(g.applied[0]!.source).toBe(source);
      expect(render(civ, age)).toContain(`已计入：${data.zh} ${g.applied[0]!.label}（来源：aoe2techtree 文明描述：${source}）`);
    }
  });

  it.each(UNCOUNTED_CIVS)('%s 未计入项保留原因，不展示已计入来源', (civ) => {
    const data = civs.find((c) => c.en === civ)!;
    const g = gatherModel(4, civ);
    const html = render(civ, 4);
    expect(g.unsupported.length).toBeGreaterThan(0);
    for (const a of g.unsupported) expect(html).toContain(uncountedText(civ, data.zh, a.label));
    expect(html).not.toContain('来源：aoe2techtree 文明描述');
  });

  it('通用文明不展示文明采集加成或来源', () => {
    expect(gatherModel(3).applied).toEqual([]);
    const html = render('', 3);
    expect(html).not.toContain('data-t="rc-applied"');
    expect(html).not.toContain('来源：aoe2techtree 文明描述');
  });
});

describe('#88 单价用时与数量', () => {
  it('S1 法兰克骑士：食物按农田、金按城堡；默认预算 6000 村民秒 floor', () => {
    const { rc } = time(38, { Food: 60, Gold: 75 }, 'Franks');
    expect(rc.per.Food).toBeCloseTo(60 / farm, 6);
    expect(rc.per.Gold).toBeCloseTo(75 / gold3, 6);
    expect(rc.total).toBeCloseTo(60 / farm + 75 / gold3, 6);
    expect(countForTime(rc.total, 10, 10)).toBe(Math.floor(6000 / rc.total));
    expect(rc.hasFood).toBe(true);
  });
  it('S3 柏柏尔骆驼兵：先按折后价，再换算；原价算出的时间不出现', () => {
    const { d, rc } = time(329, { Food: 55, Gold: 60 }, 'Berbers');
    expect(d.cost.Food).toBeLessThan(55);
    expect(d.cost.Gold).toBeLessThan(60);
    const g = gatherModel(3, 'Berbers');
    expect(rc.total).toBeCloseTo(d.cost.Food! / g.rate.farm + d.cost.Gold! / g.rate.gold, 6);
    expect(rc.total).not.toBeCloseTo(55 / g.rate.farm + 60 / g.rate.gold, 1);
  });
  it('S4 僧侣只花金：没有食物', () => {
    const { rc } = time(125, { Gold: 100 }, '');
    expect(rc.hasFood).toBe(false);
    expect(Object.keys(rc.per)).toEqual(['Gold']);
  });
  it('帝王例 重弩手：木按帝王（含双人锯）', () => {
    const { rc } = time(492, { Wood: 25, Gold: 45 }, '', 4);
    expect(rc.per.Wood).toBeCloseTo(25 / wood4, 6);
    expect(rc.per.Gold).toBeCloseTo(45 / gold3, 6);
  });
  it('9 预算 vil=5 / min=5 都是一半', () => {
    const { rc } = time(38, { Food: 60, Gold: 75 }, 'Franks');
    expect(countForTime(rc.total, 5, 10)).toBe(Math.floor(3000 / rc.total));
    expect(countForTime(rc.total, 10, 5)).toBe(Math.floor(3000 / rc.total));
  });
  it('fmtClock：m:ss、满 1 小时 h:mm:ss，与时间线共用向下取整', () => {
    expect(fmtClock(59.4)).toBe('0:59');
    expect(fmtClock(59.5)).toBe('0:59');
    expect(fmtClock(173.65)).toBe('2:53');
    expect(fmtClock(3599.5)).toBe('59:59');
    expect(fmtClock(3600)).toBe('1:00:00');
    expect(fmtClock(3725)).toBe('1:02:05');
  });
});

// Kent 手算表（#120 评论 6157773161；#127 按 0.5 取整后 Kent 复核，6 行不变）：单个用时 ±0.5 s，数量完全相等
describe('#88 Kent 手算表', () => {
  const rows: [string, number, Record<string, number>, string, number, number, number, Record<string, number>?][] = [
    ['S1 法兰克骑士', 38, { Food: 60, Gold: 75 }, 'Franks', 3, 286.86, 20],
    ['S3 柏柏尔骆驼兵', 329, { Food: 55, Gold: 60 }, 'Berbers', 3, 205.25, 29, { Food: 47, Gold: 51 }],
    ['S4 僧侣', 125, { Gold: 100 }, '', 3, 231.54, 25],
    ['S5 土耳其骑士', 38, { Food: 60, Gold: 75 }, 'Turks', 3, 257.01, 23],
    ['S6 马里骑士', 38, { Food: 60, Gold: 75 }, 'Malians', 3, 286.86, 20],
    ['帝王 重弩手', 492, { Wood: 25, Gold: 45 }, '', 4, 152.8, 39],
  ];
  for (const [n, uid, cost, civ, age, sec, cnt, disc] of rows)
    it(n, () => {
      const { d, rc } = time(uid, cost, civ, age);
      if (disc) expect(d.cost).toEqual(disc);
      expect(Math.abs(rc.total - sec)).toBeLessThanOrEqual(0.5);
      expect(countForTime(rc.total, 10, 10)).toBe(cnt);
    });
  it('rate 数值（±1e-4）', () => {
    expect(gatherModel(3).rate.gold).toBeCloseTo(0.4319, 4);
    expect(gatherModel(3).rate.wood).toBeCloseTo(0.47481, 4);
    expect(gatherModel(4).rate.wood).toBeCloseTo(0.51434, 4);
    expect(gatherModel(3, 'Berbers').rate.gold).toBeCloseTo(0.43749, 4);
    expect(gatherModel(3, 'Turks').rate.gold).toBeCloseTo(0.52154, 4);
  });
});

describe('#145 / #162 未计入原因按文明说明', () => {
  const lines = (civ: string, zh: string) => {
    const u = gatherModel(4, civ).unsupported;
    expect(u.length, civ).toBeGreaterThan(0);
    return u.map((a) => uncountedText(civ, zh, a.label));
  };
  const paren = (rows: string[]) => rows.map((s) => s.slice(s.indexOf('（')));

  it('波希米亚改为「需研究科技，未建模」，默认口径仍未计入', () => {
    expect(paren(lines('Bohemians', '波希米亚'))).toEqual(['（需研究科技，未建模）']);
    const g = gatherModel(4, 'Bohemians');
    expect(g.applied).toEqual([]);
    expect(g.rate).toEqual(gatherModel(4).rate);
  });
  it('玛雅改为「资源多持续 15%，不是采集变快，暂不计入」', () => {
    expect(new Set(paren(lines('Mayans', '玛雅')))).toEqual(new Set(['（资源多持续 15%，不是采集变快，暂不计入）']));
  });
  it.each(UNCOUNTED_CASES)('%s 原因归纳自「%s」，各时代仍按同可用科技基准速度', (civ, source, reason) => {
    const data = civs.find((c) => c.en === civ)!;
    expect(data.bon).toContain(source);
    const want = (label: string) => LABEL_REASON[label] ?? reason;
    expect(new Set(paren(lines(civ, data.zh)))).toEqual(new Set(gatherModel(4, civ).unsupported.map((a) => `（${want(a.label)}）`)));
    for (const age of [1, 2, 3, 4]) {
      const g = gatherModel(age, civ);
      expect(g.applied).toEqual([]);
      expect(g.rate).toEqual(gatherModel(age, '', { techIds: defaultGatherEcoTechIds(age, civ) }).rate);
      for (const a of g.unsupported) expect(uncountedText(civ, data.zh, a.label)).toBe(`未计入：${data.zh} ${a.label}（${want(a.label)}）`);
    }
  });
  it('波兰按加成行分别写：大庄园去重为 1 行「大庄园替代磨坊，未建模」，采石行「石矿工兼产黄金，未建模」（#1486）', () => {
    const rows = gatherModel(4, 'Poles').unsupported.map((a) => uncountedText('Poles', '波兰', a.label));
    expect(rows.filter((r) => r.includes('（大庄园替代磨坊，未建模）'))).toHaveLength(1);
    expect(rows.filter((r) => r.includes('（石矿工兼产黄金，未建模）'))).toHaveLength(1);
    // gatherUnsupportedSources 保持按原始 res key 输出供 productionWarnings 归并
    const rawSources = gatherUnsupportedSources(4, 'Poles');
    expect(rawSources.map((s) => s.key)).toEqual(['res:237', 'res:238', 'res:239', 'res:241']);
  });
  it('未覆盖的文明保留通用原因', () => {
    expect(uncountedText('Unknown', '未知文明', '采集加成')).toBe('未计入：未知文明 采集加成（数据读不准，按通用速度算）');
  });
});

describe('未计入行的紧凑显示', () => {
  it.each(UNCOUNTED_CIVS)('%s 保留完整加成数值和原因，并提供完整悬停文本', (civ) => {
    const civZh = civs.find((c) => c.en === civ)!.zh;
    const unit = (units as Unit[]).find((u) => u.civs.includes(civ))!;
    const html = renderToStaticMarkup(
      createElement(RealCostBlock, { k: 'a', civ, civZh, age: 4, d: discountedCost(unit, civ, 4), vils: DEFAULT_VILS, min: DEFAULT_MIN }),
    );
    const rows = [...html.matchAll(/data-t="rc-unsupported">.*?<span title="([^"]*)">([^<]*)<\/span>/g)];
    const expected = gatherModel(4, civ).unsupported.map((a) => uncountedText(civ, civZh, a.label));
    expect(expected.length).toBeGreaterThan(0);
    expect(rows.map((r) => r[1])).toEqual(expected);
    expect(rows.map((r) => r[2])).toEqual(expected);
  });
});

describe('Issue 1473 亚美尼亚正式建模与全 56 文明 civEco 前置/禁用门控', () => {
  it('亚美尼亚在默认口径按可用经济科技叠乘且永不触发禁用项 962/966；gatherBonusIdx 去重返回 [1]', () => {
    expect(gatherBonusIdx('Armenians')).toEqual([1]);
    expect(gatherModel(1, 'Armenians').applied).toEqual([]);
    expect(gatherModel(1, 'Armenians').unsupported).toEqual([]);

    const g2 = gatherModel(2, 'Armenians');
    expect(g2.unsupported).toEqual([]);
    expect(g2.applied).toEqual([
      { label: '伐木 +7%', techs: [960], source: '骡车科技效率 +40%' },
      { label: '采金 +5%', techs: [963], source: '骡车科技效率 +40%' },
      { label: '采石 +5%', techs: [965], source: '骡车科技效率 +40%' },
    ]);

    for (const age of [3, 4]) {
      const g = gatherModel(age, 'Armenians');
      const base = gatherModel(age, '', { techIds: defaultGatherEcoTechIds(age, 'Armenians') });
      expect(g.unsupported, `age=${age}`).toEqual([]);
      expect(g.applied, `age=${age}`).toEqual([
        { label: '伐木 +14%', techs: [960, 961], source: '骡车科技效率 +40%' },
        { label: '采金 +11%', techs: [963, 964], source: '骡车科技效率 +40%' },
        { label: '采石 +5%', techs: [965], source: '骡车科技效率 +40%' },
      ]);
      expect(g.rate.wood).toBeGreaterThan(base.rate.wood);
      expect(g.rate.gold).toBeGreaterThan(base.rate.gold);
      expect(g.rate.stone).toBeGreaterThan(base.rate.stone);
      expect(g.rate.farm).toBe(base.rate.farm);
    }

    const html = renderToStaticMarkup(
      createElement(RealCostBlock, {
        k: 'a',
        civ: 'Armenians',
        civZh: '亚美尼亚',
        age: 4,
        d: discountedCost(
          (units as Unit[]).find((u) => u.id === 4)!,
          'Armenians',
          4,
        ),
        vils: DEFAULT_VILS,
        min: DEFAULT_MIN,
      }),
    );
    expect(html).toContain('已计入：亚美尼亚 伐木 +14%（来源：aoe2techtree 文明描述：骡车科技效率 +40%）');
    expect(html).not.toContain('data-t="rc-unsupported"');
  });

  it('亚美尼亚显式 techIds 仅激活已研可用前置，传入禁用科技 221/279 仍跳过 962/966', () => {
    expect(gatherModel(4, 'Armenians', { techIds: new Set() }).applied).toEqual([]);
    expect(gatherModel(4, 'Armenians', { techIds: new Set() }).unsupported).toEqual([]);
    expect(gatherModel(4, 'Armenians', { techIds: new Set([221, 279]) }).applied).toEqual([]);
    expect(gatherModel(4, 'Armenians', { techIds: new Set([221, 279]) }).unsupported).toEqual([]);
    expect(gatherModel(2, 'Armenians', { techIds: new Set([202]) }).applied.map((a) => a.label)).toEqual(['伐木 +7%']);
    expect(gatherModel(3, 'Armenians', { techIds: new Set([202, 203]) }).applied.map((a) => a.label)).toEqual(['伐木 +14%']);
  });

  it('波希米亚 t:804（前置 252 狂热）区分显式与默认口径；柏柏尔不受 104/101 时代前置误杀', () => {
    // 显式不含 252：不入 unsupported
    expect(gatherModel(3, 'Bohemians', { techIds: new Set([202]) }).unsupported).toEqual([]);
    expect(gatherUnsupportedSources(4, 'Bohemians', { techIds: new Set([202]) })).toEqual([]);
    // 显式含 252：如实入 unsupported 且速率维持通用
    const bohExplicit = gatherModel(3, 'Bohemians', { techIds: new Set([252]) });
    expect(bohExplicit.unsupported.map((x) => x.label)).toEqual(['村民移速 +15%']);
    expect(bohExplicit.rate).toEqual(gatherModel(3, '', { techIds: new Set([252]) }).rate);
    // 默认口径：城堡/帝王保留 unsupported，黑暗/封建为空
    expect(gatherModel(1, 'Bohemians').unsupported).toEqual([]);
    expect(gatherModel(2, 'Bohemians').unsupported).toEqual([]);
    for (const age of [3, 4]) {
      const bohDef = gatherModel(age, 'Bohemians');
      expect(bohDef.unsupported.map((x) => x.label)).toEqual(['村民移速 +15%']);
      expect(uncountedText('Bohemians', '波希米亚', bohDef.unsupported[0]!.label)).toBe('未计入：波希米亚 村民移速 +15%（需研究科技，未建模）');
    }
    // 柏柏尔在默认与显式空 techIds 口径均保留移速加成
    for (const options of [undefined, { techIds: new Set<number>() }]) {
      expect(gatherModel(1, 'Berbers', options).applied.map((x) => x.label)).toEqual(['村民移速 +5%']);
      expect(gatherModel(1, 'Berbers', options).unsupported).toEqual([]);
      for (const age of [2, 3, 4]) {
        expect(gatherModel(age, 'Berbers', options).applied.map((x) => x.label)).toEqual(['村民移速 +10%']);
        expect(gatherModel(age, 'Berbers', options).unsupported).toEqual([]);
      }
    }
  });

  it('全站其余 54 文明在默认与显式口径下 applied/unsupported 零漂移，且 gatherUnsupportedSources 按 label 去重后与 gatherModel 一致', () => {
    const dedupByLabel = (rows: readonly { label: string; techs: number[] }[]) => {
      const out: { label: string; techs: number[] }[] = [];
      const seen = new Map<string, { label: string; techs: number[] }>();
      for (const item of rows) {
        const prev = seen.get(item.label);
        if (prev) {
          for (const tid of item.techs) if (!prev.techs.includes(tid)) prev.techs.push(tid);
        } else {
          const line = { label: item.label, techs: [...item.techs] };
          seen.set(item.label, line);
          out.push(line);
        }
      }
      return out;
    };
    for (const c of civs) {
      for (const age of [1, 2, 3, 4]) {
        const def = gatherModel(age, c.en);
        const exp = gatherModel(age, c.en, { techIds: new Set() });
        expect(dedupByLabel(gatherUnsupportedSources(age, c.en))).toEqual(def.unsupported);
        expect(dedupByLabel(gatherUnsupportedSources(age, c.en, { techIds: new Set() }))).toEqual(exp.unsupported);
        if (c.en !== 'Armenians' && c.en !== 'Bohemians') {
          expect(exp.applied, `${c.en}@${age}`).toEqual(def.applied);
          expect(exp.unsupported, `${c.en}@${age}`).toEqual(def.unsupported);
        }
      }
    }
  });
});

describe('issue 1521 丹麦食物存放加成 res:299 未计入提示与非目标隔离', () => {
  it('丹麦全 4 时代返回 res:299 无数字标签且维持基准速率；RealCostBlock 渲染 UX 定稿文案', () => {
    for (const age of [1, 2, 3, 4]) {
      const g = gatherModel(age, 'Danes');
      expect(g.applied, `age=${age}`).toEqual([]);
      expect(g.unsupported, `age=${age}`).toEqual([{ label: '食物采集加成', techs: [1494] }]);
      expect(gatherUnsupportedSources(age, 'Danes'), `age=${age}`).toEqual([{ key: 'res:299', label: '食物采集加成', techs: [1494], fromTree: false }]);
      expect(g.rate, `age=${age}`).toEqual(gatherModel(age, '', { techIds: defaultGatherEcoTechIds(age, 'Danes') }).rate);
    }

    const expected = '未计入：丹麦人 食物采集加成（存放食物，未建模）';
    for (const unitId of [567, 2712]) {
      const unit = (units as Unit[]).find((u) => u.id === unitId)!;
      const html = renderToStaticMarkup(
        createElement(RealCostBlock, {
          k: 'b',
          civ: 'Danes',
          civZh: '丹麦人',
          age: 4,
          d: discountedCost(unit, 'Danes', 4),
          vils: DEFAULT_VILS,
          min: DEFAULT_MIN,
        }),
      );
      const rows = [...html.matchAll(/data-t="rc-unsupported">.*?<span title="([^"]*)">([^<]*)<\/span>/g)];
      expect(rows.map((r) => [r[1], r[2]])).toEqual([[expected, expected]]);
      expect(html).not.toContain('来源：aoe2techtree 文明描述');
    }
  });

  it('马普切 res:215 与瓦兰吉人 res:298 不在 GATHER_RES 中，全 4 时代不触发未计入告警', () => {
    for (const civ of ['Mapuche', 'Varangians'] as const) {
      for (const age of [1, 2, 3, 4]) {
        expect(gatherModel(age, civ).unsupported, `${civ}@${age}`).toEqual([]);
        expect(gatherUnsupportedSources(age, civ), `${civ}@${age}`).toEqual([]);
      }
    }
  });
});
