import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import rawShapes from '../../src/data/garrison_general.json';
import { productionBuildings, type ProductionContext } from '../../src/domain/production';
import {
  PLAN_JSON_BYTES,
  PLAN_TOKEN_LIMIT,
  PLAN_LIMITS,
  TEAM_PLAN_UNIT_IDS,
  TASK_KINDS,
  addPlanPlayer,
  removePlanPlayer,
  defaultTeamPlan,
  exampleTeamPlan,
  emptyPlayerPhase,
  encodeTeamPlan,
  decodeTeamPlan,
  teamPlanShape,
  teamPlanShareUrl,
  teamPlanErrors,
  checkPlanForce,
  planPotentialBuildings,
  planTaskStatus,
  type PlayerPhase,
  type PlanPlayer,
  type TeamPlan,
} from '../../src/domain/teamPlan';

let ctx: ProductionContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});
const player = (civ = 'Franks'): PlanPlayer => ({ id: 'p1', name: 'P1', civ, position: 'unspecified', positionNote: '' });
const row = (fields: Partial<PlayerPhase> = {}): PlayerPhase => ({ ...emptyPlayerPhase('p1'), ...fields });
const force = (unitId: number, buildingId: number) => ({ unitId, buildingId });
const read = (plan: TeamPlan) => decodeTeamPlan('?' + encodeTeamPlan(plan));
function rawQuery(value: unknown): string {
  const token = Buffer.from(JSON.stringify(value)).toString('base64url');
  return '?' + new URLSearchParams({ version: '1', plan: token });
}
function maximumPlan(text: (length: number) => string): TeamPlan {
  const plan = exampleTeamPlan();
  plan.title = text(PLAN_LIMITS.title);
  plan.map.name = text(PLAN_LIMITS.map);
  plan.map.conditions = text(PLAN_LIMITS.agreement);
  for (const p of plan.players) {
    p.name = text(PLAN_LIMITS.name);
    p.civ = text(80);
    p.positionNote = text(PLAN_LIMITS.position);
  }
  for (const phase of plan.phases) {
    for (const r of phase.players) {
      r.supplyNote = text(PLAN_LIMITS.note);
      for (const [key, count] of [
        ['completedBuildings', PLAN_LIMITS.buildings],
        ['completedForms', PLAN_LIMITS.forms],
        ['completedUnlockTechIds', PLAN_LIMITS.techs],
      ] as const)
        r[key] = Array.from({ length: count }, (_, i) => Number.MAX_SAFE_INTEGER - i);
      r.main = force(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
      r.secondary = force(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    }
    phase.tasks = TASK_KINDS.map((kind) => ({
      kind,
      owners: ['p1', 'p2', 'p3', 'p4'],
      intentionalGap: false,
      gapReason: text(PLAN_LIMITS.note),
      note: text(PLAN_LIMITS.note),
    }));
    phase.supportTrigger = phase.rally = phase.retreat = phase.notApplicable = text(PLAN_LIMITS.agreement);
  }
  return plan;
}

describe('#243 exact shapes and independently confirmed prerequisites', () => {
  it('audits every frozen basic/upgrade shape and a potential production location', () => {
    expect(TEAM_PLAN_UNIT_IDS).toHaveLength(39);
    expect(new Set(TEAM_PLAN_UNIT_IDS).size).toBe(39);
    const index = rawShapes.unitUpgradeTechs as Record<string, number[]>;
    for (const id of TEAM_PLAN_UNIT_IDS) {
      const unit = ctx.core.unitById[id]!;
      expect(unit, String(id)).toBeDefined();
      expect(unit.from_ === null || !!index[id]?.length, `${id} upgrade classification`).toBe(true);
      expect(
        unit.civs.some((civ) => planPotentialBuildings(ctx, civ, 4, id).length > 0),
        `${id} production route`,
      ).toBe(true);
    }
    expect(index[567]).toEqual([264, 1174]);
  });
  it('separates civilization, age, unknown references, outside-pool shapes and unselected', () => {
    expect(checkPlanForce(ctx, player('Aztecs'), row(), 4, force(38, 101)).status).toBe('civ-unavailable');
    expect(checkPlanForce(ctx, player(), row(), 2, force(38, 101)).status).toBe('age-unavailable');
    expect(checkPlanForce(ctx, player(), row(), 4, force(999999, 101)).status).toBe('invalid');
    expect(checkPlanForce(ctx, player('Italians'), row(), 4, force(882, 12)).status).toBe('unsupported');
    expect(checkPlanForce(ctx, player(), row(), 2, null).status).toBe('unselected');
  });
  it('selecting a shape confirms nothing; an exact high-shape confirmation includes its prerequisites as a user statement', () => {
    const start = row({ main: force(24, 87) });
    expect(checkPlanForce(ctx, player('Britons'), start, 3, start.main).missingFormIds).toEqual([24]);
    expect(checkPlanForce(ctx, player('Britons'), start, 3, start.main).missingBuildingIds).toEqual([87]);
    expect(start.completedForms).toEqual([]);
    const built = row({ main: force(492, 87), completedForms: [492], completedBuildings: [87] });
    expect(checkPlanForce(ctx, player('Britons'), built, 4, built.main).status).toBe('conditions-met');
    expect(built.completedForms).toEqual([492]);
    const champion = row({ completedForms: [567], completedBuildings: [12] });
    expect(checkPlanForce(ctx, player('Franks'), champion, 4, force(567, 12)).status).toBe('conditions-met');
  });
  it('retains production age exceptions without automatically confirming forms, unlocks or buildings', () => {
    for (const [civ, age, id, building] of [
      ['Armenians', 2, 77, 12],
      ['Armenians', 2, 358, 12],
      ['Burgundians', 3, 283, 101],
      ['Cumans', 2, 1258, 49],
    ] as const) {
      const state = row({ completedForms: [id], completedBuildings: [building] });
      expect(checkPlanForce(ctx, player(civ), state, age, force(id, building)).status).toBe('conditions-met');
    }
    const boh = row({ completedBuildings: [87] });
    expect(checkPlanForce(ctx, player('Bohemians'), boh, 3, force(5, 87)).missingUnlockTechIds).toEqual([47]);
    expect(checkPlanForce(ctx, player('Bohemians'), { ...boh, completedUnlockTechIds: [47] }, 3, force(5, 87)).status).toBe('conditions-met');
    expect(checkPlanForce(ctx, player('Franks'), boh, 3, force(5, 87)).status).toBe('age-unavailable');
  });
  it('free chemistry, cavalry and pike upgrades still need explicit user confirmation', () => {
    expect(checkPlanForce(ctx, player('Turks'), row({ completedBuildings: [49] }), 4, force(36, 49)).missingUnlockTechIds).toEqual([47]);
    expect(checkPlanForce(ctx, player('Turks'), row({ completedBuildings: [101] }), 4, force(441, 101)).missingFormIds).toEqual([441]);
    expect(checkPlanForce(ctx, player('Ethiopians'), row({ completedBuildings: [12] }), 3, force(358, 12)).missingFormIds).toEqual([358]);
  });
  it('rejects exact low shapes superseded by an explicitly completed higher shape', () => {
    const state = row({ main: force(24, 87), completedForms: [492], completedBuildings: [87] });
    expect(checkPlanForce(ctx, player('Britons'), state, 4, state.main).status).toBe('superseded-shape');
    expect(state.main).toEqual(force(24, 87));
    expect(state.completedForms).toEqual([492]);
  });
  it('uses eco/tree routes rather than Unit.b and rejects a wrong or future building', () => {
    expect(ctx.core.unitById[125]!.b).not.toBe(104);
    expect(checkPlanForce(ctx, player(), row({ completedBuildings: [104] }), 3, force(125, 104)).status).toBe('conditions-met');
    expect(checkPlanForce(ctx, player(), row({ completedBuildings: [87] }), 3, force(38, 87)).status).toBe('invalid');
    const plan = defaultTeamPlan();
    plan.phases[0]!.players[0]!.completedBuildings = [82];
    expect(teamPlanErrors(plan, ctx).join()).toContain('时代');
  });
  it('keeps all example assumptions legal and does not change existing production behavior', () => {
    const example = exampleTeamPlan();
    expect(teamPlanErrors(example, ctx)).toEqual([]);
    for (const phase of example.phases)
      for (const r of phase.players)
        for (const f of [r.main, r.secondary])
          if (f)
            expect(
              checkPlanForce(
                ctx,
                example.players.find((p) => p.id === r.playerId)!,
                r,
                phase.age,
                f,
              ).status,
            ).toBe('conditions-met');
    const before = productionBuildings(ctx, { civ: 'Britons', age: 4, techs: [], rows: [], walk: 3, farm: 1 }, ctx.core.unitById[24]!);
    checkPlanForce(ctx, player('Britons'), row({ completedForms: [492] }), 4, force(24, 87));
    expect(productionBuildings(ctx, { civ: 'Britons', age: 4, techs: [], rows: [], walk: 3, farm: 1 }, ctx.core.unitById[24]!)).toEqual(before);
  });
});

describe('#243 agreements, identities and full URL restoration', () => {
  it('supports 2–4 stable identities and duplicate civs without assigning positions or tasks', () => {
    let plan = defaultTeamPlan();
    expect(plan.players.every((p) => p.position === 'unspecified')).toBe(true);
    expect(plan.players.map((p) => p.civ)).toEqual(['Franks', 'Franks']);
    plan = addPlanPlayer(addPlanPlayer(plan));
    expect(addPlanPlayer(plan)).toBe(plan);
    plan.phases[0]!.tasks = [{ kind: 'support', owners: ['p2', 'p3'], intentionalGap: false, gapReason: '', note: '' }];
    plan = removePlanPlayer(plan, 'p2');
    expect(plan.players.map((p) => p.id)).toEqual(['p1', 'p3', 'p4']);
    expect(plan.phases[0]!.tasks[0]!.owners).toEqual(['p3']);
    plan = removePlanPlayer(plan, 'p4');
    expect(removePlanPlayer(plan, 'p3')).toBe(plan);
    plan.players[0]!.position = 'pocket';
    expect(read(plan).plan!.players[0]!.position).toBe('pocket');
  });
  it('never infers task coverage from units and preserves intentional gaps with reasons', () => {
    const plan = defaultTeamPlan();
    plan.phases[0]!.players[0]!.main = force(1258, 49);
    expect(plan.phases[0]!.tasks).toEqual([]);
    const task = { kind: 'breach' as const, owners: [], intentionalGap: false, gapReason: '留给后续阶段', note: '保留理由' };
    expect(planTaskStatus(task)).toBe('unassigned');
    expect(planTaskStatus({ ...task, intentionalGap: true })).toBe('intentional-gap');
    expect(planTaskStatus({ ...task, owners: ['p1'] })).toBe('assigned');
    expect(planTaskStatus({ ...task, owners: ['p1'], intentionalGap: true })).toBe('conflict');
    plan.phases[0]!.tasks = [{ ...task, intentionalGap: true }];
    expect(read(plan).plan!.phases[0]!.tasks).toEqual(plan.phases[0]!.tasks);
  });
  it('preserves all three phases, unknown safe semantic references and separate completion arrays', () => {
    const plan = exampleTeamPlan();
    plan.activeAge = 3;
    plan.phases[2]!.players[0]!.completedUnlockTechIds = [999999];
    plan.phases[1]!.players[1]!.main = force(999999, 999998);
    plan.phases[2]!.tasks[0]!.owners = ['p4'];
    plan.players.pop();
    plan.phases.forEach((p) => p.players.pop());
    expect(read(plan).plan).toEqual(plan);
    const errors = teamPlanErrors(read(plan).plan!, ctx).join();
    expect(errors).toContain('未知兵种');
    expect(errors).toContain('999999');
    expect(errors).toContain('已移除');
    expect(addPlanPlayer(plan)).toBe(plan);
    expect(defaultTeamPlan().phases[0]!.players[0]!.completedForms).toEqual([]);
  });
  it.each(['中文与换行', 'JSON最坏控制字符'])('round-trips every field at its legal maximum: %s', (mode) => {
    const emoji = String.fromCodePoint(0x1f642);
    const fill =
      mode === 'JSON最坏控制字符' ? (length: number) => '\u0000'.repeat(length) : (length: number) => ('中文' + emoji + '\n').repeat(length).slice(0, length);
    const plan = maximumPlan(fill),
      search = encodeTeamPlan(plan);
    expect(new TextEncoder().encode(JSON.stringify(plan)).length).toBeLessThanOrEqual(PLAN_JSON_BYTES);
    expect(new URLSearchParams(search).get('plan')!.length).toBeLessThanOrEqual(PLAN_TOKEN_LIMIT);
    expect(read(plan)).toEqual({ plan, errors: [] });
  });
  it('keeps complete state only in the fragment and normalizes canonical project bases', () => {
    const plan = exampleTeamPlan();
    for (const base of ['https://example.test/aoe2-analyzer/?unrelated=secret#old', 'https://example.test/aoe2-analyzer/team-plan/?tracking=1#old']) {
      const url = new URL(teamPlanShareUrl(plan, base));
      expect(url.pathname).toBe('/aoe2-analyzer/team-plan/');
      expect(url.search).toBe('');
      expect(url.hash.startsWith('#/team-plan?version=1&plan=')).toBe(true);
      expect(decodeTeamPlan(url.hash.slice(url.hash.indexOf('?'))).plan).toEqual(plan);
      expect(url.origin + url.pathname + url.search).not.toContain('plan=');
    }
  });
  it('rejects malformed, duplicate, over-limit or unknown-version structure without a fallback plan', () => {
    const source = exampleTeamPlan(),
      good = '?' + encodeTeamPlan(source);
    const bad = [
      '?version=1',
      good + '&version=1',
      good + '&tracking=1',
      good.replace('version=1', 'version=2'),
      '?version=1&plan=%ZZ',
      '?version=1&plan=A',
      '?version=1&plan=' + 'A'.repeat(PLAN_TOKEN_LIMIT + 1),
      '?version=1&plan=_w',
      rawQuery(null),
      rawQuery({ ...source, added: true }),
      rawQuery({ ...source, patch: 0 }),
      rawQuery({ ...source, title: 'a'.repeat(PLAN_LIMITS.title + 1) }),
    ];
    const duplicate = exampleTeamPlan();
    duplicate.phases[0]!.tasks.push(duplicate.phases[0]!.tasks[0]!);
    bad.push(rawQuery(duplicate));
    const invalidInteger = exampleTeamPlan();
    invalidInteger.phases[0]!.players[0]!.main!.unitId = Number.MAX_SAFE_INTEGER + 1;
    bad.push(rawQuery(invalidInteger));
    const invalidRows = exampleTeamPlan();
    invalidRows.phases[1]!.players[1]!.playerId = 'p1';
    bad.push(rawQuery(invalidRows));
    const overflow = exampleTeamPlan();
    overflow.phases[0]!.players[0]!.completedBuildings = Array.from({ length: 9 }, (_, i) => i + 1);
    bad.push(rawQuery(overflow));
    for (const query of bad) expect(decodeTeamPlan(query), query.slice(0, 100)).toMatchObject({ plan: null, errors: [expect.any(String)] });
    expect(teamPlanShape({ ...source, phases: [] })).toBe(false);
    expect(() => encodeTeamPlan(overflow)).toThrow();
    expect(decodeTeamPlan('').plan).toEqual(defaultTeamPlan());
  });
});
