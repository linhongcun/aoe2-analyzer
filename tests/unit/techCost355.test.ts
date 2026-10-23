/** #355：科技费用/研究时间的 C 字段。c=2 乘，c=1 与 c=-1 加；费用 B=-1 为全部资源。 */
import { describe, expect, it } from 'vitest';
import { DAT, ecoText } from '../../src/domain/datEffects';

const text = (x: Parameters<typeof ecoText>[0]) => ecoText(x, () => undefined);

describe('#355 科技费用与研究时间', () => {
  it('马来 101 研究时间 ×0.60241', () => {
    const x = DAT.civs.Malay!.bonus.find((e) => e.tech === 634)!.eco.find((e) => e.tid === 101 && e.what === '研究时间')!;
    expect(x).toMatchObject({ tech: 'Feudal Age', tid: 101, what: '研究时间', op: 'mul', v: 0.60241 });
    expect(text(x)).toBe('科技「Feudal Age」研究时间 ×0.60241');
  });

  it('意大利 101 全部费用 ×0.85', () => {
    const x = DAT.civs.Italians!.bonus.flatMap((e) => e.eco).find((e) => e.tid === 101)!;
    expect(x).toMatchObject({ tech: 'Feudal Age', tid: 101, what: '全部资源', op: 'mul', v: 0.85 });
    expect(text(x)).toBe('科技「Feudal Age」全部资源 ×0.85');
  });

  it('波希米亚 812 信仰 黄金 -750 / 食物 +750', () => {
    // .dat effect 812 = 波希米亚特色科技 Hussite Reforms（tech 785）
    const faith = DAT.techs['Hussite Reforms']!.eco.filter((e) => e.tech === 'Faith');
    expect(DAT.techs['Hussite Reforms']!.id).toBe(785);
    expect(faith).toEqual([
      { tech: 'Faith', tid: 45, what: '黄金', op: 'add', v: -750 },
      { tech: 'Faith', tid: 45, what: '食物', op: 'add', v: 750 },
    ]);
    expect(faith.map(text)).toEqual(['科技「Faith」黄金 -750', '科技「Faith」食物 +750']);
  });
});
