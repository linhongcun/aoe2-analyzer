import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import type { Trees } from '../../src/domain/types';
import { decodeTeamFit, encodeTeamFit } from '../../src/domain/teamFitQuery';
import { fitShapes, fitTeamPlan, fitToolLinks, fitUnitRoles, projectTeamFit } from '../../src/domain/teamFit';
import { decodeTeamBonuses } from '../../src/domain/teamBonuses';
import { decodeTeamPlan, teamPlanErrors } from '../../src/domain/teamPlan';
let core: Core, trees: Trees;
beforeAll(async () => {
  [core, trees] = await Promise.all([loadCore(), loadTrees()]);
});
const project = (candidate: string, mates: string[]) => projectTeamFit(core, trees, { candidate, mates });
describe('#558 full-tree shape identity and sources', () => {
  it('Franks add the six audited shapes, preserving two knight branches and mounted crossbow role overlap', () => {
    const result = project('Franks', ['Persians', 'Mayans']);
    expect(result.added.map((s) => s.unit.id).sort((a, b) => a - b)).toEqual([281, 531, 567, 569, 2700, 2701]);
    expect(result.forward.filter((r) => r.isNew).map((r) => r.key)).toEqual(['p:Franks-team']);
    expect(result.after.some((s) => s.rawIds.includes(1813))).toBe(true);
    expect(result.after.some((s) => s.rawIds.includes(569))).toBe(true);
    expect(result.added.find((s) => s.rawIds.includes(2700))!.roles).toEqual(['cavalry', 'archer']);
    expect(result.before.some((s) => s.rawIds.includes(39))).toBe(true);
    expect(result.forward[0]!.relations.find((r) => r.civ === 'Persians')!.direct).toContain(1813);
    expect(result.forward[0]!.relations.find((r) => r.civ === 'Mayans')!.direct).toEqual([]);
    expect(result.reverse.find((r) => r.key === 'p:Mayans-team')!.relations[0]!.buildings.sort((a, b) => a - b)).toEqual([72, 117, 155, 487, 792]);
  });
  it('normalizes same-en production aliases before differencing without collapsing Elite', () => {
    const result = project('Sicilians', ['Franks']);
    expect(result.added.map((s) => s.key).sort()).toEqual(['Arbalester', 'Elite Serjeant', 'Serjeant', 'Siege Onager', 'Siege Ram'].sort());
    for (const [base, alias] of [
      [93, 1786],
      [358, 1787],
      [359, 1788],
    ]) {
      expect(result.after.find((s) => s.rawIds.includes(base!))!.rawIds).toContain(alias);
    }
    const huns = fitShapes(core, trees, ['Huns']);
    expect(huns.filter((s) => s.key === 'Tarkan')).toHaveLength(1);
    expect(huns.find((s) => s.key === 'Tarkan')!.rawIds.sort()).toEqual([755, 886]);
    expect(huns.find((s) => s.key === 'Elite Tarkan')!.rawIds.sort()).toEqual([757, 887]);
    expect(huns.find((s) => s.key === 'Tarkan')!.locations.find((l) => l.rawId === 886 && l.building === 101)!.techs).toContain(483);
  });
  it('compares source identities rather than renumbered providers and uses consistent UT potential', () => {
    const duplicate = project('Franks', ['Franks']);
    expect(duplicate.added).toEqual([]);
    expect(duplicate.forward[0]!.isNew).toBe(false);
    expect(duplicate.forward[0]!.providers).toHaveLength(2);
    const result = project('Cumans', ['Berbers']);
    expect(result.reverse.find((r) => r.key === 't:578')!.isNew).toBe(false);
    expect(result.forward.find((r) => r.key === 't:690')!.isNew).toBe(true);
    expect(result.after.flatMap((s) => s.rawIds)).not.toContain(1260);
    expect(result.after.flatMap((s) => s.rawIds)).toEqual(expect.arrayContaining([1231, 1233]));
    expect(result.forward.find((r) => r.key === 't:690')!.unlocks).toContain(1260);
  });
  it('keeps conditional openings and partial/unknown coverage separate from ordinary civ eligibility', () => {
    const berbers = project('Berbers', ['Franks']);
    expect(berbers.forward.find((r) => r.key === 'p:Berbers-team')!.unlocks).toEqual([1010, 1012]);
    expect(berbers.forward[0]!.source.targetCoverage).toBe('partial');
    const incas = project('Incas', ['Franks']);
    expect(incas.forward[0]!.source.targetCoverage).toBe('unknown');
    const mapuche = project('Mapuche', ['Franks']);
    expect(mapuche.forward.find((r) => r.key === 't:1380')!.source.targetUnits).toEqual([2569, 2571]);
    expect(mapuche.after.flatMap((s) => s.rawIds)).toEqual(expect.arrayContaining([2569, 2571]));
  });
  it('retains each civilization’s own route endpoint instead of letting an ally upgrade hide it', () => {
    const result = project('Mayans', ['Franks', 'Berbers']);
    expect(result.directions.find((d) => d.role === 'cavalry')!.existing.find((r) => r.key === 'Knight')!.terminalKeys).toEqual(
      expect.arrayContaining(['Cavalier', 'Paladin']),
    );
    const bohemians = project('Bohemians', []);
    expect(bohemians.directions.find((d) => d.role === 'siege')!.added.find((r) => r.key === 'Bombard Cannon')!.terminalKeys).toEqual(['Houfnice']);
    expect(project('', ['Franks']).forward).toEqual([]);
    expect(project('Italians', ['Franks']).forward.find((r) => r.key === 'p:Italians-team')!.unlocks).toEqual([882]);
    expect(
      project('Cumans', ['Berbers'])
        .reverse.find((r) => r.key === 't:578')!
        .relations.every((r) => !r.production.includes(1260)),
    ).toBe(true);
  });
  it('checks both tree and unit-civ eligibility', () => {
    const changed = { ...core, units: core.units.map((u) => (u.id === 569 ? { ...u, civs: [] } : u)) };
    expect(fitShapes(changed, trees, ['Franks']).some((s) => s.rawIds.includes(569))).toBe(false);
    expect(fitShapes(core, { ...trees, t: { ...trees.t, Franks: [] } }, ['Franks'])).toEqual([]);
  });
  it('does not let roster numbering or caller edits contaminate cached immutable snapshots', () => {
    const first = fitShapes(core, trees, ['Huns']);
    const tarkan = first.find((s) => s.key === 'Tarkan')!;
    tarkan.rawIds.length = 0;
    tarkan.providers[0]!.player = 99;
    tarkan.locations.find((l) => l.rawId === 886)!.techs.length = 0;
    const next = fitShapes(core, trees, ['Franks', 'Huns', 'Huns']).find((s) => s.key === 'Tarkan')!;
    expect(next.rawIds.sort()).toEqual([755, 886]);
    expect(next.providers.map((p) => p.player)).toEqual([2, 3]);
    expect(next.locations.filter((l) => l.rawId === 886).map((l) => l.player)).toEqual([2, 3]);
    expect(next.locations.filter((l) => l.rawId === 886).every((l) => l.techs.includes(483))).toBe(true);
    const replacement = { ...core, units: core.units.filter((u) => u.id !== 886) };
    expect(fitShapes(replacement, trees, ['Huns']).find((s) => s.key === 'Tarkan')!.rawIds).toEqual([755]);
    expect(fitShapes(core, { ...trees, t: { ...trees.t, Huns: [] } }, ['Huns'])).toEqual([]);
  });
  it('distinguishes armor directory membership from actual combat and marks siege transport', () => {
    expect(fitUnitRoles(core.unitById[775]!)).toEqual([]);
    expect(fitUnitRoles(core.unitById[1811]!)).toContain('infantry');
    expect(fitUnitRoles(core.unitById[1105]!)).toContain('siege');
    expect(fitShapes(core, trees, ['Spanish']).find((s) => s.rawIds.includes(1105))!.transport).toBe(true);
  });
  it('retains the complete new/existing sets beneath deterministic route presentation', () => {
    const result = project('Franks', ['Persians', 'Mayans']);
    for (const direction of result.directions) {
      expect(direction.added.flatMap((r) => r.forms.map((s) => s.key)).sort()).toEqual(
        result.added
          .filter((s) => s.roles.includes(direction.role))
          .map((s) => s.key)
          .sort(),
      );
      expect(direction.existing.flatMap((r) => r.forms.map((s) => s.key)).sort()).toEqual(
        result.before
          .filter((s) => s.roles.includes(direction.role))
          .map((s) => s.key)
          .sort(),
      );
    }
  });
});
describe('#558 strict lightweight URL and blank cross-tool state', () => {
  it('has a truly empty route and roundtrips editable intermediates and repeated players', () => {
    expect(decodeTeamFit('')).toEqual({ config: { candidate: '', mates: [] }, errors: [], locked: false });
    for (const config of [
      { candidate: '', mates: ['Persians'] },
      { candidate: 'Franks', mates: ['Franks', 'Mayans', 'Franks'] },
    ])
      expect(decodeTeamFit(encodeTeamFit(config))).toEqual({ config, errors: [], locked: false });
    expect(fitToolLinks({ candidate: '', mates: ['Persians'] })).toBeNull();
  });
  it.each([
    'v=2&mates=&candidate=Franks',
    'v=1&mates=&candidate=Bad',
    'v=1&mates=Bad&candidate=',
    'v=1&mates=Franks,Mayans,Huns,Incas&candidate=Franks',
    'v=1&mates=&candidate=Franks&candidate=Huns',
    'v=1&candidate=Franks',
    'v=1&mates=&candidate=Franks&bad=1',
    '%Q',
    'a'.repeat(4097),
  ])('locks malformed state: %s', (query) => expect(decodeTeamFit(query).locked).toBe(true));
  it('cross-tool links carry exact civs with no invented research, roles, tasks or completion', () => {
    const config = { candidate: 'Franks', mates: ['Persians', 'Mayans'] };
    const links = fitToolLinks(config)!;
    const bonuses = decodeTeamBonuses(links.bonuses.split('?')[1]!);
    expect(bonuses.locked).toBe(false);
    expect(bonuses.config).toEqual({ players: ['Franks', 'Persians', 'Mayans'], age: 4, target: 'all', unit: null, researched: [] });
    const plan = decodeTeamPlan(links.plan!.split('?')[1]!).plan!;
    expect(teamPlanErrors(plan, { core, trees })).toEqual([]);
    expect(plan.players.map((p) => p.civ)).toEqual(['Franks', 'Persians', 'Mayans']);
    for (const phase of plan.phases) {
      expect(phase.tasks).toEqual([]);
      expect([phase.supportTrigger, phase.rally, phase.retreat, phase.notApplicable]).toEqual(['', '', '', '']);
      for (const p of phase.players)
        expect(p).toMatchObject({ main: null, secondary: null, completedBuildings: [], completedForms: [], completedUnlockTechIds: [], supply: 'unchecked' });
    }
    expect(fitTeamPlan({ candidate: 'Franks', mates: [] })).toBeNull();
  });
});
