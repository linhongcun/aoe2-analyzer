import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import { civs } from '../../src/data';
import { buildOrders } from '../../src/data/buildOrders';
import { civBonuses } from '../../src/domain/civBonus';
import { bonusUsage } from '../../src/domain/bonusUsage';
import { civSimNotes, type EcoData } from '../../src/domain/buildSim';
import { gurjaraNotes, GURJARA_OPENING_NOTE, GURJARA_KNIGHT_NOTE } from '../../src/domain/gurjaraEconomy';
import { buildShareCard, type ShareInput } from '../../src/features/builds/shareCard';
import { simSupport } from '../../src/domain/simSupport';
const E = eco as unknown as EcoData;
const civ = civs.find((entry) => entry.en === 'Gurjaras')!;
describe('#197 Gurjara current-template presentation', () => {
  it('admits Gurjaras while Poles and Romans remain unsupported', () => {
    expect(simSupport('Gurjaras')).toBe(true);
    for (const name of ['Poles', 'Romans']) expect(simSupport(name)).toBe(false);
  });
  it('uses the same explicit omission on the timeline and sharing, with only a Knight exception', () => {
    for (const order of buildOrders) {
      const notes = gurjaraNotes(E, order.id);
      expect(civSimNotes(E, 'Gurjaras', order.id)).toEqual(notes);
      expect(notes).toContain(GURJARA_OPENING_NOTE);
      expect(notes.includes(GURJARA_KNIGHT_NOTE)).toBe(order.id === 'fast-castle-knights');
      const input: ShareInput = {
        view: { top: null, timeout: false, tcIdleTotal: 0 } as ShareInput['view'],
        target: undefined,
        boId: order.id,
        boNameZh: order.name.zh,
        civEn: 'Gurjaras',
        civZh: civ.zh,
        targetZh: '封建',
        dist: 4,
        defaultDist: 4,
        house: true,
        patchBuild: __DATA_SOURCES__.patch.build,
        siteRoot: 'example/',
      };
      const card = buildShareCard(input);
      expect(card.basis).toBe(`按${civ.zh}计 · 走路 4 格 · 游戏版本 ${__DATA_SOURCES__.patch.build}\n${notes.join('\n')}`);
      expect(card.url).toContain('civ=Gurjaras');
    }
  });
  it('marks both finite fruit bushes and unused livestock garrison income as uncounted', () => {
    const bonuses = civBonuses(civ);
    for (const idx of [0, 1]) {
      const line = bonusUsage(bonuses.find((bonus) => !bonus.team && bonus.idx === idx)!).find((entry) => entry.tool === 'sim');
      expect(line).toMatchObject({ on: false });
      expect(line!.note).toContain('未计入');
      expect(line!.note).toContain(idx === 0 ? '果丛' : '未驻畜');
    }
  });
  it('does not attach Gurjara disclosures to Generic or other civilizations', () => {
    for (const other of ['Generic', 'Britons']) expect(civSimNotes(E, other, 'fast-castle-knights')).not.toContain(GURJARA_OPENING_NOTE);
    const changed = structuredClone(E);
    delete changed.civEco.Gurjaras!.find((entry) => entry.tech === 856)!.gurjaraTech;
    expect(civSimNotes(changed, 'Gurjaras', 'scouts-18')).toEqual([]);
  });
});
