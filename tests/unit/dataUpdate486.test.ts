/** #486: current DE188329 facts verified against the official article and both pinned game sources. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pins from '../../scripts/data_sources.json';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';
import { ctx, unit, units } from './helpers';

const datSha = 'd0aefd92428e2215d6f4d9b1d544901e6f171e19183f9e0b88218de5153a337f';

describe('#486 current DE188329 data', () => {
  it('pins the three reviewed commits and their Beijing dates', () => {
    expect(pins.patch.build).toBe(188329);
    expect(pins.patch.date).toBe('2026-10-28');
    expect(pins.sources.dat.commit).toBe('e293dc106b0f3b0ceac2db98409fbcc5c921190b');
    expect(pins.sources.dat.sha256).toBe(datSha);
    expect(pins.sources.aoe2techtree.commit).toBe('e56728e76b7d08301fba7b18d5f16bc8554c109a');
    expect(pins.sources.halfon.commit).toBe('7f96c37fc5f63c7141ec7d88e91c627beb375b28');
    for (const source of Object.values(pins.sources)) expect(source.date).toBe('2026-10-28');
    expect(pins.sources.dat.markers).toEqual({ civs: 63, techs: 1510, effects: 1500, newestCivs: ['Saxons', 'Varangians', 'Danes'] });
  });

  it.each([
    ['Elephant Archer', 220],
    ['Elite Elephant Archer', 270],
  ] as const)('%s has the new base HP and cost', (name, hp) => {
    expect(unit(name).hp).toBe(hp);
    expect(unit(name).cost).toEqual({ Food: 70, Gold: 80 });
  });

  it('slows only the non-elite Bolas Rider', () => {
    expect(unit('Bolas Rider').spd).toBe(1.45);
    expect(unit('Elite Bolas Rider').spd).toBe(1.5);
  });

  it('exports Champi Scout attack classes 8 and 30 with +2 each', () => {
    const attacks = Object.fromEntries(unit('Champi Scout').atks);
    expect([attacks['骑兵'], attacks['骆驼']]).toEqual([2, 2]);
    const runner = Object.fromEntries(unit('Champi Runner').atks);
    expect([runner['骑兵'] ?? 0, runner['骆驼'] ?? 0]).toEqual([0, 0]);
  });

  it('resolves an unupgraded Dravidian Elephant Archer in Duel using the new HP and training price', () => {
    const byId = Object.fromEntries(units.map((entry) => [entry.id, entry]));
    const side = resolve(ctx, byId, { uid: 873, civ: 'Dravidians', age: 3, techs: [], team: [] }, 569);
    expect(isUnavail(side)).toBe(false);
    if (isUnavail(side)) throw new Error('Dravidians must retain Elephant Archer availability');
    expect(side.F.hp).toBe(220);
    expect(side.F.cost).toEqual({ Food: 70, Gold: 80 });
    expect(side.S.hp).toBe(220);
  });

  it.each(['eco', 'market', 'garrison', 'garrison_general', 'garrison_healing', 'trade_income', 'construction', 'relic_income', 'generate_resource'])(
    '%s export records the current DAT provenance',
    (name) => {
      const data = JSON.parse(readFileSync(`src/data/${name}.json`, 'utf8')) as { meta?: { patch?: string; datSha256?: string; sha256?: string } };
      expect(data.meta?.patch).toBe('DE Update 188329 (2026-10-28)');
      if (data.meta?.datSha256 !== undefined) expect(data.meta.datSha256).toBe(datSha);
      if (data.meta?.sha256 !== undefined) expect(data.meta.sha256).toBe(datSha);
    },
  );

  it('records the same reviewed DAT in effects and team-source exports', () => {
    const effects = JSON.parse(readFileSync('src/data/effects.json', 'utf8')) as {
      meta: { sources: { id: string; commit: string; sha256?: string; patch: string }[] };
    };
    const source = effects.meta.sources.find((entry) => entry.id === 'DAT');
    expect(source?.commit).toBe('e293dc1');
    expect(source?.sha256).toBe(datSha);
    expect(source?.patch).toBe('DE Update 188329 (2026-10-28)');
    const teams = JSON.parse(readFileSync('src/data/team_bonuses.json', 'utf8')) as {
      meta: { patch: number; dat: { commit: string; sha256: string } };
    };
    expect(teams.meta.patch).toBe(188329);
    expect(teams.meta.dat.commit).toBe(pins.sources.dat.commit);
    expect(teams.meta.dat.sha256).toBe(datSha);
  });

  it('reports no effect-rule changes when the two pinned exports contain identical rules', () => {
    expect(readFileSync('docs/EFFECTS-AUDIT.md', 'utf8')).toContain('小计：科技 0 个、加成 0 条有数值变化');
  });
});
