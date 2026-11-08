import { describe, expect, it, vi } from 'vitest';
import { DAT as REAL_DAT } from '../../src/domain/datEffects';
import { unit } from './helpers';

type Dat = typeof REAL_DAT;

async function loadEffects(mutate: (dat: Dat) => void) {
  vi.resetModules();
  const dat = structuredClone(REAL_DAT);
  mutate(dat);
  vi.doMock('../../src/domain/datEffects', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/domain/datEffects')>();
    return { ...actual, DAT: dat };
  });
  return import('../../src/domain/effects');
}

describe('#795 手工回退效果表', () => {
  it('当前 188329 数据下没有手工回退', async () => {
    const effects = await loadEffects(() => {});
    expect(Object.values(effects.TECH_SRC)).not.toContain('manual');
    expect(Object.values(effects.BONUS_SRC).flatMap((m) => Object.values(m))).not.toContain('manual');
  });

  it('缺少 Fletching 时回退到手工规则并作用于弓箭手', async () => {
    const effects = await loadEffects((dat) => {
      delete dat.techs.Fletching;
    });
    expect(effects.TECH_SRC.Fletching).toBe('manual');
    const archer = unit('Archer');
    const hit = (effects.TECH_EFFECTS.Fletching ?? []).find(([pred]) => pred(archer));
    expect(hit?.[1]).toContainEqual({ s: 'atk', v: 1 });
  });

  it('缺少 Masonry 时回退到手工建筑规则', async () => {
    const effects = await loadEffects((dat) => {
      delete dat.techs.Masonry;
    });
    expect(effects.TECH_SRC.Masonry).toBe('manual');
    const hit = (effects.BUILDING_EFFECTS.Masonry ?? []).find(([, fx]) => fx.some((e) => e.s === 'hp' && e.op === 'mul'));
    expect(hit?.[1]).toContainEqual({ s: 'hp', op: 'mul', v: 1.1 });
  });

  it('BUILDING_TEXT_ONLY 仍是独立文本层', async () => {
    const effects = await loadEffects(() => {});
    expect(Object.keys(effects.BUILDING_TEXT_ONLY)).toContain('Ballistics');
    expect(Object.keys(effects.BUILDING_TEXT_ONLY)).toContain('Keep');
    expect(effects.TECH_SRC.Fletching).toBe('dat');
  });
});
