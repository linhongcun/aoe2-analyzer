/** #357：建筑时代形态归并后，波斯城镇中心/码头工作效率显示 5/10/15/20%。 */
import { describe, expect, it } from 'vitest';
import { DAT, ecoText } from '../../src/domain/datEffects';

describe('#357 建筑时代形态', () => {
  it('波斯城镇中心与码头按时代显示 +5/10/15/20%，目录形态倍率仍是 1.05', () => {
    const eco = DAT.civs.Persians!.bonus.find((e) => e.tech === 409)!.eco;
    const tc = eco.find((e) => e.unit === 109)!;
    const dock = eco.find((e) => e.unit === 45)!;
    expect(tc).toMatchObject({ a: 13, op: 'mul', v: 1.05, t: [109], byAge: [1.05, 1.1, 1.15, 1.2] });
    expect(dock).toMatchObject({ a: 13, op: 'mul', v: 1.05, t: [45], byAge: [1.05, 1.1, 1.15, 1.2] });
    expect(ecoText(tc, (id) => (id === 109 ? '城镇中心' : undefined))).toBe('城镇中心 工作效率 +5/10/15/20%');
    expect(ecoText(dock, () => '船坞')).toBe('船坞 工作效率 +5/10/15/20%');
  });
});

describe('#356 资源中文名', () => {
  it('中国开局木材是起始木材，玛雅采金产量不再叫交易手续费', () => {
    const name = (civ: string, res: number) => DAT.civs[civ]!.bonus.flatMap((e) => e.eco).find((e) => e.res === res)?.name;
    expect(name('Chinese', 92)).toBe('起始木材');
    expect(name('Chinese', 91)).toBe('起始食物');
    expect(name('Mayans', 47)).toBe('采金产量倍率');
    expect(name('Mayans', 79)).toBe('采石产量倍率');
    expect(name('Mayans', 190)).toBe('食物采集产量倍率');
    expect(name('Tatars', 216)).toBe('牧羊产量倍率');
  });
});
