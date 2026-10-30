import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import { civs } from '../../src/data';
import { buildOrders } from '../../src/data/buildOrders';
import { civBonuses } from '../../src/domain/civBonus';
import { bonusUsage } from '../../src/domain/bonusUsage';
import { civSimNotes, type EcoData } from '../../src/domain/buildSim';
import { mapucheNotes, MAPUCHE_OPENING_NOTE, MAPUCHE_TRAIN_NOTE } from '../../src/domain/mapucheEconomy';
import { buildShareCard, type ShareInput } from '../../src/features/builds/shareCard';
import { simSupport } from '../../src/domain/simSupport';
const E = eco as unknown as EcoData;
const mapuche = civs.find((c) => c.en === 'Mapuche')!;
describe('#197 Mapuche current support and disclosures', () => {
  it('admits Mapuche alongside the final Poles and Romans batch', () => {
    expect(simSupport('Mapuche')).toBe(true);
    for (const civ of ['Poles', 'Romans']) expect(simSupport(civ)).toBe(true);
  });
  it('keeps notes identical on the timeline and actual share-card basis', () => {
    for (const bo of buildOrders) {
      const notes = mapucheNotes(E, bo.id);
      expect(civSimNotes(E, 'Mapuche', bo.id)).toEqual(notes);
      const input: ShareInput = {
        view: { top: null, timeout: false, tcIdleTotal: 0 } as ShareInput['view'],
        target: undefined,
        boId: bo.id,
        boNameZh: bo.name.zh,
        civEn: 'Mapuche',
        civZh: '马普切',
        targetZh: '封建',
        dist: 4,
        defaultDist: 4,
        house: true,
        patchBuild: __DATA_SOURCES__.patch.build,
        siteRoot: 'example/',
      };
      const card = buildShareCard(input);
      for (const note of notes) expect(card.basis).toContain(note);
      expect(card.basis).toContain(MAPUCHE_OPENING_NOTE);
      expect(card.url).toContain('civ=Mapuche');
    }
  });
  it('distinguishes counted berry income from unused settlement military production', () => {
    const bonuses = civBonuses(mapuche);
    expect(bonusUsage(bonuses.find((b) => !b.team && b.idx === 0)!).find((line) => line.tool === 'sim')?.on).toBe(true);
    expect(bonusUsage(bonuses.find((b) => !b.team && b.idx === 1)!).find((line) => line.tool === 'sim')).toMatchObject({
      on: false,
      note: `未计入：${MAPUCHE_TRAIN_NOTE}`,
    });
  });
});
