import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import pins from '../../scripts/data_sources.json';
import guideContent from '../../src/content/game-guide.json';
import planContent from '../../src/content/team-plan.json';
import { civs, loadCore, loadTrees } from '../../src/data';
import { reviewedTeachingContent188329, TEACHING_COMPATIBILITY_188329 as review } from '../../src/data/teachingCompatibility188329';
import { GAME_GUIDE_CARDS, GAME_GUIDE_CATALOG, gameGuideCatalogErrors } from '../../src/domain/gameGuide';
import {
  checkPlanForce,
  decodeTeamPlan,
  encodeTeamPlan,
  exampleTeamPlan,
  planPotentialBuildings,
  requiredPlanUnlocks,
  teamPlanErrors,
  teamPlanShape,
  teamPlanShareUrl,
} from '../../src/domain/teamPlan';
import { productionTechs, type ProductionContext } from '../../src/domain/production';
import { buildingAge } from '../../src/domain/availabilityAge';

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const rawSearch = (value: unknown) => '?' + new URLSearchParams({ version: '1', plan: Buffer.from(JSON.stringify(value)).toString('base64url') });
let ctx: ProductionContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});
afterEach(() => {
  vi.doUnmock('../../src/data/meta');
  vi.doUnmock('../../src/content/game-guide.json');
  vi.doUnmock('../../src/content/team-plan.json');
  vi.doUnmock('../../scripts/data_sources.json');
  vi.resetModules();
});

describe('#486 fixed 188329 teaching compatibility', () => {
  it('binds the exact historical JSON bytes and current upstream identities', () => {
    expect(review.originalPatch).toBe(185872);
    expect(review.approvedPatch).toBe(188329);
    expect(review.reviewedAt).toBe('2026-10-29');
    for (const [id, content] of [
      ['game-guide', guideContent],
      ['team-plan', planContent],
    ] as const) {
      const identity = review.content[id];
      expect(sha256(readFileSync(identity.path)), identity.path).toBe(identity.sha256);
      expect(reviewedTeachingContent188329(id, content, pins)).toBe(true);
      expect(reviewedTeachingContent188329(id, { ...content, checkedAt: '2026-10-29' }, pins)).toBe(false);
    }
    expect(guideContent.dataVersion).toBe('DE185872');
    expect(planContent.patch).toBe(185872);
    expect(planContent.example.patch).toBe(185872);
    expect(guideContent.checkedAt).toBe('2026-10-20');
    expect(planContent.checked).toBe('2026-10-20');
  });

  it('refuses qualification when any approved upstream identity changes', () => {
    for (const name of ['dat', 'aoe2techtree', 'halfon'] as const) {
      for (const field of ['repo', 'commit', 'path'] as const) {
        const changed = structuredClone(pins);
        changed.sources[name][field] += '-changed';
        expect(reviewedTeachingContent188329('game-guide', guideContent, changed), `${name}.${field}`).toBe(false);
        expect(reviewedTeachingContent188329('team-plan', planContent, changed), `${name}.${field}`).toBe(false);
      }
    }
    const changedHash = structuredClone(pins);
    changedHash.sources.dat.sha256 = '0'.repeat(64);
    expect(reviewedTeachingContent188329('game-guide', guideContent, changedHash)).toBe(false);
    const future = structuredClone(pins);
    future.patch.build = 188330;
    expect(reviewedTeachingContent188329('team-plan', planContent, future)).toBe(false);
  });

  it('locks every referenced generated fact and its unchanged prerequisite/tree/effect projections to the audited baseline', () => {
    const read = (name: string) => JSON.parse(readFileSync(`src/data/${name}.json`, 'utf8'));
    const withoutMeta = (data: Record<string, unknown>) => {
      const payload = { ...data };
      delete payload.meta;
      return payload;
    };
    const ids = [...planContent.unitIds, 83];
    const units = read('units') as { id: number }[];
    const techs = read('techs') as { id: number }[];
    const eco = read('eco');
    const projections = {
      units: ids.map((id) => units.find((unit) => unit.id === id)),
      techs: [47, 101, 102, 103].map((id) => techs.find((tech) => tech.id === id)),
      buildings: read('buildings'),
      trees: read('trees'),
      eco: { units: ids.map((id) => [id, eco.units[id]]), ageReq: eco.ageReq, ecoTechs: eco.ecoTechs, civEco: eco.civEco },
      effects: withoutMeta(read('effects')),
      garrison: withoutMeta(read('garrison_general')),
      exampleCivs: (read('civs') as { en: string }[]).filter((civ) => ['Britons', 'Franks', 'Huns', 'Ethiopians'].includes(civ.en)),
    };
    for (const name of Object.keys(projections) as (keyof typeof projections)[]) {
      expect(sha256(JSON.stringify(projections[name])), name).toBe(review.audit[name]);
    }
  });

  const routesByCiv = new Map<string, [string, number, number, number[]][]>();
  it.each(civs)('retains all 117 age/shape production qualifications for $en', (civ) => {
    const routes = ([2, 3, 4] as const).flatMap((age) =>
      planContent.unitIds.map((id): [string, number, number, number[]] => [civ.en, age, id, planPotentialBuildings(ctx, civ.en, age, id)]),
    );
    expect(routes).toHaveLength(117);
    routesByCiv.set(civ.en, routes);
  });

  it('retains all 6552 civilization/age/shape production qualifications from the independent baseline audit', () => {
    expect(routesByCiv.size).toBe(civs.length);
    const routes = civs.flatMap((civ) => routesByCiv.get(civ.en) ?? []);
    expect(routes).toHaveLength(6552);
    expect(sha256(JSON.stringify(routes))).toBe(review.audit.routes);
  });

  it('changes only the explicitly approved version view and keeps all business content and source dates', () => {
    expect(GAME_GUIDE_CATALOG).toEqual({ ...guideContent, dataVersion: 'DE188329' });
    expect(GAME_GUIDE_CARDS).toEqual(guideContent.cards);
    expect(GAME_GUIDE_CARDS).toHaveLength(6);
    expect(gameGuideCatalogErrors()).toEqual([]);
    const plan = exampleTeamPlan();
    expect(plan).toEqual({ ...planContent.example, patch: 188329 });
    expect(teamPlanShape(plan)).toBe(true);
    expect(teamPlanErrors(plan, ctx)).toEqual([]);
    const search = '?' + encodeTeamPlan(plan);
    expect(decodeTeamPlan(search)).toEqual({ plan, errors: [] });
    const shared = new URL(teamPlanShareUrl(plan, 'https://example.org/aoe2-analyzer/'));
    expect(decodeTeamPlan(shared.hash.slice(shared.hash.indexOf('?')))).toEqual({ plan, errors: [] });
    plan.players[0]!.name = 'edited';
    expect(exampleTeamPlan()).toEqual({ ...planContent.example, patch: 188329 });
  });

  it('checks every example force, completed form, building and unlock for its exact civilization and age', () => {
    const plan = exampleTeamPlan();
    for (const phase of plan.phases) {
      for (const row of phase.players) {
        const player = plan.players.find((p) => p.id === row.playerId)!;
        const label = `${player.civ}/${phase.age}`;
        for (const force of [row.main, row.secondary]) {
          if (!force) continue;
          expect(checkPlanForce(ctx, player, row, phase.age, force).status, `${label}/${force.unitId}`).toBe('conditions-met');
          expect(ctx.core.unitById[force.unitId]!.civs, label).toContain(player.civ);
          expect(planPotentialBuildings(ctx, player.civ, phase.age, force.unitId), label).toContain(force.buildingId);
          expect(
            requiredPlanUnlocks(force.unitId).every((id) => row.completedUnlockTechIds.includes(id)),
            label,
          ).toBe(true);
        }
        for (const id of row.completedForms) {
          expect(ctx.core.unitById[id]!.civs, `${label}/form${id}`).toContain(player.civ);
          expect(planPotentialBuildings(ctx, player.civ, phase.age, id).length, `${label}/form${id}`).toBeGreaterThan(0);
        }
        for (const id of row.completedBuildings) {
          const building = ctx.core.buildingById[id]!;
          expect(building.civs, `${label}/building${id}`).toContain(player.civ);
          expect(buildingAge(building, player.civ, ctx.trees), `${label}/building${id}`).toBeLessThanOrEqual(phase.age);
        }
        for (const id of row.completedUnlockTechIds) {
          expect(
            productionTechs(ctx, { civ: player.civ, age: phase.age }).map((tech) => tech.id),
            `${label}/tech${id}`,
          ).toContain(id);
        }
      }
    }
    // All twelve example unlock lists are intentionally empty: none of its thirteen forces require chemistry.
    expect(plan.phases.flatMap((phase) => phase.players.flatMap((row) => row.completedUnlockTechIds))).toEqual([]);
  });

  it('rejects original saved 185872 links without migration', () => {
    const original = structuredClone(planContent.example);
    expect(teamPlanShape(original)).toBe(false);
    expect(decodeTeamPlan(rawSearch(original)).plan).toBeNull();
    expect(original.patch).toBe(185872);
    expect(() => encodeTeamPlan(original as ReturnType<typeof exampleTeamPlan>)).toThrow();
  });

  it('keeps the approved 188329 view fixed when a future current-version guard changes', async () => {
    vi.doMock('../../src/data/meta', () => ({ DATA_PATCH_BUILD: 188330 }));
    vi.resetModules();
    const planModule = await import('../../src/domain/teamPlan');
    const guideModule = await import('../../src/domain/gameGuide');
    expect(planModule.exampleTeamPlan()).toEqual({ ...planContent.example, patch: 188329 });
    expect(planModule.teamPlanShape(planModule.exampleTeamPlan())).toBe(false);
    expect(() => planModule.encodeTeamPlan(planModule.exampleTeamPlan())).toThrow();
    expect(planModule.decodeTeamPlan(rawSearch(exampleTeamPlan())).plan).toBeNull();
    expect(guideModule.GAME_GUIDE_CATALOG.dataVersion).toBe('DE188329');
    expect(guideModule.gameGuideCatalogErrors()).toContain('资料版本未识别。');
  });

  it('leaves changed imported content historical and rejected instead of certifying the edit', async () => {
    const changedGuide = structuredClone(guideContent);
    changedGuide.cards[0]!.answer += 'changed';
    const changedPlan = structuredClone(planContent);
    changedPlan.example.phases[0]!.players[0]!.completedBuildings = [];
    vi.doMock('../../src/content/game-guide.json', () => ({ default: changedGuide }));
    vi.doMock('../../src/content/team-plan.json', () => ({ default: changedPlan }));
    vi.resetModules();
    const guideModule = await import('../../src/domain/gameGuide');
    const planModule = await import('../../src/domain/teamPlan');
    expect(guideModule.GAME_GUIDE_COMPATIBILITY).toBeNull();
    expect(guideModule.GAME_GUIDE_CATALOG.dataVersion).toBe('DE185872');
    expect(guideModule.gameGuideCatalogErrors()).toContain('资料版本未识别。');
    expect(planModule.TEAM_PLAN_COMPATIBILITY).toBeNull();
    expect(planModule.exampleTeamPlan().patch).toBe(185872);
    expect(planModule.teamPlanShape(planModule.exampleTeamPlan())).toBe(false);
  });

  it('leaves the imported catalogues historical if the source pin differs', async () => {
    const changed = structuredClone(pins);
    changed.sources.dat.commit = '0'.repeat(40);
    vi.doMock('../../scripts/data_sources.json', () => ({ default: changed }));
    vi.resetModules();
    const guideModule = await import('../../src/domain/gameGuide');
    const planModule = await import('../../src/domain/teamPlan');
    expect(guideModule.GAME_GUIDE_COMPATIBILITY).toBeNull();
    expect(guideModule.gameGuideCatalogErrors()).toContain('资料版本未识别。');
    expect(planModule.TEAM_PLAN_COMPATIBILITY).toBeNull();
    expect(planModule.teamPlanShape(planModule.exampleTeamPlan())).toBe(false);
  });
});
