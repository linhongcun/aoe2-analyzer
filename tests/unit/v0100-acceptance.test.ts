import { describe, expect, it } from 'vitest';
import civs from '../../src/data/civs.json';
import units from '../../src/data/units.json';
import buildings from '../../src/data/buildings.json';
import techs from '../../src/data/techs.json';
import { gatherModel } from '../../src/domain/realCost';
import { uncountedText } from '../../src/features/duel/components/RealCost';
import { search, pyMatch, PY_RESERVE, TIER, score, type SearchItem } from '../../src/domain/search';

/** v0.10.0 验收（#156）。Kent 写，先失败，功能做完后应全部通过。 */

describe('A #156 亚美尼亚、波希米亚「未计入」原因改为「需研究科技，未建模」', () => {
  const CASES = [
    // aoe2techtree 120193：Mule Cart technology effects +40% / 骡车科技效率 +40%
    {
      en: 'Armenians',
      zh: '亚美尼亚',
      ages: [2, 3, 4] as const,
      bonus: '骡车科技效率 +40%',
      labelsByAge: {
        2: ['伐木 +7%', '采金 +5%', '采石 +5%'],
        3: ['伐木 +14%', '采金 +11%', '采石 +11%'],
        4: ['伐木 +18%', '采金 +11%', '采石 +11%'],
      } as Record<number, string[]>,
    },
    // aoe2techtree 120188：Fervor and Sanctity affect Villagers / 狂热和圣洁会影响村民
    {
      en: 'Bohemians',
      zh: '波希米亚',
      ages: [3, 4] as const,
      bonus: '狂热和圣洁会影响村民',
      labelsByAge: { 3: ['村民移速 +15%'], 4: ['村民移速 +15%'] } as Record<number, string[]>,
    },
  ];

  for (const { en, zh, ages, bonus, labelsByAge } of CASES) {
    it(`A1 ${zh}：每条未计入原因都是「需研究科技，未建模」`, () => {
      expect(civs.find((c) => c.en === en)?.bon).toContain(bonus);
      for (const age of ages) {
        const g = gatherModel(age, en);
        expect(g.unsupported.map((x) => x.label), `${en}@${age}`).toEqual(labelsByAge[age]);
        for (const line of g.unsupported) {
          expect(uncountedText(en, zh, line.label), `${en}@${age}`).toBe(
            `未计入：${zh} ${line.label}（需研究科技，未建模）`,
          );
        }
      }
    });

    it(`A2 ${zh}：改文案不等于启用加成，四个时代速度仍等于通用`, () => {
      for (const age of [1, 2, 3, 4]) {
        const g = gatherModel(age, en);
        expect(g.applied, `${en}@${age}`).toEqual([]);
        expect(g.rate, `${en}@${age}`).toEqual(gatherModel(age).rate);
      }
    });
  }

  it('A3 玛雅原因不变，仍未计入且速度等于通用', () => {
    const g = gatherModel(4, 'Mayans');
    expect(g.applied).toEqual([]);
    expect(g.unsupported.length).toBeGreaterThan(0);
    expect(g.rate).toEqual(gatherModel(4).rate);
    for (const line of g.unsupported) {
      expect(uncountedText('Mayans', '玛雅', line.label)).toBe(
        `未计入：玛雅 ${line.label}（资源多持续 15%，不是采集变快，暂不计入）`,
      );
    }
  });

  it('A4 边界：尚无相关科技的时代不凭空增加未计入行', () => {
    expect(gatherModel(1, 'Armenians').unsupported).toEqual([]);
    expect(gatherModel(1, 'Bohemians').unsupported).toEqual([]);
    expect(gatherModel(2, 'Bohemians').unsupported).toEqual([]);
  });

  it('A5 边界：未覆盖原因的文明仍使用原有兜底原因', () => {
    // v0.11.0 A（#162）会给马里等 7 家写具体原因，这里用不在范围内的假文明守住兜底。
    expect(uncountedText('NoSuchCiv', '某文明', '采金加成')).toBe(
      '未计入：某文明 采金加成（数据读不准，按通用速度算）',
    );
  });
});

// B 的实际换行由 e2e 用 Range 测量，这里不检查 CSS 字符串。

type Row = { zh: string; en: string; py?: string; pyi?: string; id?: number };
const KINDS = { civs: 'civ', units: 'unit', buildings: 'building', techs: 'tech' } as const;
const DATA = { civs, units, buildings, techs } as unknown as Record<keyof typeof KINDS, Row[]>;
const items: SearchItem[] = (Object.keys(KINDS) as (keyof typeof KINDS)[]).flatMap((key) =>
  DATA[key].map(
    (r) =>
      ({
        ...r,
        kind: KINDS[key],
        id: String(r.id ?? r.en),
        href: '',
        sub: '',
      }) as SearchItem,
  ),
);

const item = (id: string, fields: Partial<SearchItem>): SearchItem => ({
  kind: 'unit',
  id,
  zh: id,
  en: '',
  href: '',
  sub: '',
  ...fields,
});
const exact = item('exact', { zh: '精确英文命中', en: 'ba' });
const pinyin = Array.from({ length: 12 }, (_, i) =>
  item(`py-${i}`, { zh: `靶站${i}`, en: `Target ${i}`, py: 'bazhan', pyi: 'bz' }),
);
const crowded = [
  exact,
  ...Array.from({ length: 40 }, (_, i) => item(`name-${i}`, { zh: `名称命中${i}`, en: `candidate ba${i}` })),
  ...pinyin,
];

/** 固定 v0.9.0 旧尾部边界（末尾 5 位）；改 PY_RESERVE 本身不能让「往前提」断言跟着松掉。 */
const LIMIT = 30;
const OLD_TAIL_START = LIMIT - 5;

describe('C #156 拼音命中往前提，中英文仍优先，limit<5 不越界', () => {
  /** #159 设计：先放中英文精确/前缀命中（至少首条），紧接最多 PY_RESERVE 条纯拼音，再放其余中英文命中。 */
  const expectDesignOrder = (result: SearchItem[], q: string) => {
    const tiers = result.map((r) => score(r, q));
    const firstPy = tiers.indexOf(TIER.py);
    expect(firstPy, '应有纯拼音命中').toBeGreaterThan(0);
    const headCount = Math.max(1, tiers.slice(0, firstPy).filter((t) => t >= TIER.prefix).length);
    expect(firstPy, '拼音紧跟在精确/前缀命中之后').toBe(headCount);
    expect(tiers.slice(0, firstPy).every((t) => t > TIER.py)).toBe(true);
    let end = firstPy;
    while (end < tiers.length && tiers[end] === TIER.py) end++;
    expect(end - firstPy, '拼音块最多 5 条（#159 设计值，不读 PY_RESERVE）').toBeLessThanOrEqual(5);
    return { firstPy, end, tiers };
  };

  it('C1 真实数据「ba」超过 30 命中时，拼音紧跟在前缀/精确命中之后、其余中英文之前，最多 5 条', () => {
    expect(items.filter((r) => score(r, 'ba') > 0).length).toBeGreaterThan(LIMIT);
    const result = search(items, 'ba');
    expect(result).toHaveLength(LIMIT);
    const { firstPy, end, tiers } = expectDesignOrder(result, 'ba');
    expect(firstPy).toBeLessThan(OLD_TAIL_START);
    expect(pyMatch(result[firstPy]!, 'ba')).toBe(true);
    // 拼音块之后还有中英文命中（其余文字命中排在拼音后面）
    expect(tiers.slice(end).some((t) => t > TIER.py)).toBe(true);
  });

  it('C2 构造拥挤结果：精确命中，然后 5 条拼音，再其余名称命中', () => {
    expect(pinyin.every((r) => pyMatch(r, 'ba') && score(r, 'ba') === TIER.py)).toBe(true);
    const result = search(crowded, 'ba', LIMIT);
    expect(result).toHaveLength(LIMIT);
    expect(new Set(result.map((r) => r.id)).size).toBe(result.length);
    expect(result[0]).toBe(exact);
    const { firstPy, end, tiers } = expectDesignOrder(result, 'ba');
    expect(firstPy).toBe(1);
    expect(end - firstPy).toBe(5);
    expect(tiers.slice(end).every((t) => t > TIER.py)).toBe(true);
  });

  it('C2b 构造：精确与前缀命中全部在拼音前，按 ID 断言', () => {
    const prefixes = Array.from({ length: 3 }, (_, i) => item(`pre-${i}`, { zh: `前缀${i}`, en: `bax${i}` }));
    const words = Array.from({ length: 4 }, (_, i) => item(`w-${i}`, { zh: `词${i}`, en: `x ba${i}` }));
    const ids = search([...words, ...pinyin.slice(0, 7), ...prefixes, exact], 'ba', 30).map((r) => r.id);
    expect(ids.slice(0, 4)).toEqual(['exact', 'pre-0', 'pre-1', 'pre-2']);
    expect(ids.slice(4, 9)).toEqual(['py-0', 'py-1', 'py-2', 'py-3', 'py-4']);
    expect(ids.slice(9, 13).sort()).toEqual(['w-0', 'w-1', 'w-2', 'w-3']);
    expect(ids.slice(13)).toEqual(['py-5', 'py-6']);
  });

  it('C3 保留 v0.9.0 E：「ba」有百夫长，弹道学排在百夫长之前', () => {
    const names = search(items, 'ba').map((r) => r.zh);
    expect(names).toContain('百夫长');
    expect(names.indexOf('弹道学')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('弹道学')).toBeLessThan(names.indexOf('百夫长'));
  });

  it.each([0, 1, 2, 3, 4])('C4 limit=%i：拥挤结果长度不得超过 limit', (limit) => {
    const result = search(crowded, 'ba', limit);
    expect(result.length).toBeLessThanOrEqual(limit);
    expect(result).toHaveLength(limit);
    expect(new Set(result.map((r) => r.id)).size).toBe(result.length);
  });

  it.each([1, 2, 3, 4])('C5 limit=%i：英文精确命中不能被拼音预留位挤掉', (limit) => {
    // 旧实现 keepPy=min(py,5)，slice(0, limit-keepPy) 在 limit<5 时会丢掉唯一英文命中
    const result = search([...pinyin, exact], 'ba', limit);
    expect(score(exact, 'ba')).toBe(TIER.exact);
    expect(result).toHaveLength(limit);
    expect(result[0]).toBe(exact);
  });

  it('C6 边界：limit 等于 PY_RESERVE 时也保留英文精确命中', () => {
    const result = search([...pinyin, exact], 'ba', PY_RESERVE);
    expect(result).toHaveLength(PY_RESERVE);
    expect(result[0]).toBe(exact);
  });

  it('C7 边界：全是拼音命中时，limit=0 返回空数组', () => {
    expect(search(pinyin, 'ba', 0)).toEqual([]);
  });

  it('C8 边界：总命中未超过 limit 时不删结果，中英文仍排在拼音前', () => {
    const prefix = item('prefix', { zh: '英文前缀命中', en: 'Ballistics' });
    const result = search([pinyin[0]!, prefix, exact], 'ba', 3);
    expect(result.map((r) => r.id)).toEqual(['exact', 'prefix', 'py-0']);
  });

  it('C9 边界：没有拼音命中时，不因预留位而少返回结果', () => {
    const namesOnly = crowded.filter((r) => score(r, 'ba') > TIER.py);
    expect(search(namesOnly, 'ba', LIMIT)).toHaveLength(LIMIT);
    expect(search(namesOnly, 'ba', 1)).toEqual([exact]);
  });

  it('C10 边界：同时命中名称与拼音的条目只出现一次，且按更高档排序', () => {
    const both = item('both', { zh: '靶子', en: 'ba', py: 'bazi', pyi: 'bz' });
    expect(score(both, 'ba')).toBe(TIER.exact);
    const result = search([both, ...pinyin], 'ba', 3);
    expect(result.filter((r) => r.id === 'both')).toHaveLength(1);
    expect(result[0]).toBe(both);
  });

  it('C11 边界：小 limit 支持大小写和空白归一化；空查询返回空', () => {
    expect(search([...pinyin, exact], ' B A ', 1)).toEqual([exact]);
    expect(search(crowded, '   ', 1)).toEqual([]);
  });
});

const SOURCES = [
  { en: 'Romans', label: '村民采集速度 +5%', bonus: '村民收集、建造和修理的速度 +5%' },
  { en: 'Slavs', label: '农田采集 +15%', bonus: '农民工作速度 +15%' },
  { en: 'Celts', label: '伐木 +15%', bonus: '伐木工工作速度 +15%' },
  { en: 'Koreans', label: '采石 +20%', bonus: '石矿工的工作速度 +20%' },
  { en: 'Turks', label: '采金 +25%', bonus: '金矿矿工的工作速度 +25%' },
  { en: 'Berbers', label: '村民移速 +10%', bonus: '村民在黑暗时代的移动速度 +5%，从封建时代开始 +10%' },
] as const;

describe('D #156 已计入采集加成携带 aoe2techtree 原文要点（civs.json bon）', () => {
  for (const { en, label, bonus } of SOURCES) {
    it(`D1 ${en}：applied[].source 非空并包含对应 bon 原文`, () => {
      const civ = civs.find((c) => c.en === en)!;
      expect(civ.bon).toContain(bonus);

      for (const age of [1, 2, 3, 4]) {
        const g = gatherModel(age, en);
        const expectedLabel = en === 'Berbers' && age === 1 ? '村民移速 +5%' : label;
        expect(g.applied.map((line) => line.label), `${en}@${age}`).toEqual([expectedLabel]);
        expect(g.unsupported, `${en}@${age}`).toEqual([]);

        for (const line of g.applied) {
          // 运行时检查 source，避免当前类型上没有该字段时在编译期就挂掉
          const source = (line as typeof line & { source?: unknown }).source;
          expect(typeof source, `${en}@${age} ${line.label}`).toBe('string');
          expect((source as string).trim()).not.toBe('');
          expect(source).toContain(bonus);
        }
      }
    });
  }

  it('D2 边界：通用文明没有已计入行，不凭空生成来源', () => {
    for (const age of [1, 2, 3, 4]) expect(gatherModel(age).applied).toEqual([]);
  });
});
