import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import { civs } from '../../src/data';
import { buildOrders } from '../../src/data/buildOrders';
import { civBonuses } from '../../src/domain/civBonus';
import { bonusUsage } from '../../src/domain/bonusUsage';
import { civSimNotes, type EcoData } from '../../src/domain/buildSim';
import { CHINESE_OPENING_NOTE } from '../../src/domain/chineseEconomy';
import { buildShareCard, type ShareInput } from '../../src/features/builds/shareCard';
import { simSupport } from '../../src/domain/simSupport';

const E = eco as unknown as EcoData;
const chinese = civs.find((c) => c.en === 'Chinese')!;
describe('#197 Chinese current support and shared disclosures', () => {
  it('admits Chinese while the four other incomplete civilizations retain their reasons', () => {
    expect(simSupport('Chinese')).toBe(true);
    for (const civ of ['Gurjaras', 'Mapuche', 'Poles', 'Romans']) expect(simSupport(civ)).toBe(false);
  });
  it('shares the exact source boundary between the normal opening and share-card basis', () => {
    const bo = buildOrders[0]!;
    expect(civSimNotes(E, 'Chinese', bo.id)).toEqual([CHINESE_OPENING_NOTE]);
    const input: ShareInput = {
      view: { top: null, timeout: false, tcIdleTotal: 0 } as ShareInput['view'],
      target: undefined,
      boId: bo.id,
      boNameZh: bo.name.zh,
      civEn: 'Chinese',
      civZh: '中国',
      targetZh: '封建',
      dist: 4,
      defaultDist: 4,
      house: true,
      patchBuild: __DATA_SOURCES__.patch.build,
      siteRoot: 'example/',
    };
    expect(buildShareCard(input).basis).toBe(`按中国计 · 走路 4 格 · 游戏版本 ${__DATA_SOURCES__.patch.build}\n${CHINESE_OPENING_NOTE}`);
    expect(buildShareCard(input).url).toContain('civ=Chinese');
    const invalid = structuredClone(E);
    delete invalid.civEco.Chinese!.find((r) => r.tech === 425)!.chineseTech;
    expect(civSimNotes(invalid, 'Chinese', bo.id)).toEqual([]);
    expect(civSimNotes(E, 'Generic', bo.id)).not.toContain(CHINESE_OPENING_NOTE);
  });
  it('records TC population as used even though its raw commands have no economic decoder effects', () => {
    const bonus = civBonuses(chinese).find((b) => !b.team && b.idx === 2)!;
    const usage = bonusUsage(bonus).find((line) => line.tool === 'sim');
    expect(usage?.on).toBe(true);
    expect(usage?.note).toContain('提供15人口');
    expect(usage?.note).toContain('视野未模拟');
  });
  it('marks the ordinary technology discount as used and farm storage team bonus as uncounted', () => {
    const bonuses = civBonuses(chinese);
    expect(bonusUsage(bonuses.find((b) => !b.team && b.idx === 1)!).find((line) => line.tool === 'sim')?.on).toBe(true);
    expect(bonusUsage(bonuses.find((b) => b.team)!).find((line) => line.tool === 'sim')?.on).toBe(false);
  });
});
