import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { GENERAL_GARRISON_DATA } from '../../src/domain/garrisonGeneral';
import type { ProductionContext } from '../../src/domain/production';
import {
  MIXED_ARMY_CONTENT,
  MIXED_ARMY_URL_LIMIT,
  decodeMixedArmy,
  defaultMixedArmyConfig,
  encodeMixedArmy,
  mixedArmyGaps,
  mixedArmyConfirmationErrors,
  mixedArmyInputErrors,
  mixedFormNeedsConfirmation,
  mixedUnitPrerequisites,
  planMixedArmy,
  type MixedArmyConfig,
  type MixedPrerequisiteInput,
} from '../../src/domain/mixedArmy';

let ctx: ProductionContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});
const config = (patch: Partial<MixedArmyConfig> = {}): MixedArmyConfig => ({ ...defaultMixedArmyConfig(), ...patch });
const prereq = (patch: Partial<MixedPrerequisiteInput> = {}) =>
  mixedUnitPrerequisites(ctx, {
    civ: 'Britons',
    age: 4,
    unitId: 492,
    completedForms: [],
    completedUnlockTechIds: [],
    completedBuildings: [],
    ...patch,
  });
const britons = (patch: Partial<MixedArmyConfig> = {}) =>
  config({
    ownMain: 492,
    enemy: 'cavalry-skirmishers',
    terrain: 'open',
    flank: 'clear',
    retreat: 'safe',
    position: 'safe',
    formation: 'grouped',
    food: 'sustainable',
    woodGold: 'sustainable',
    completedForms: [492, 359, 546, 550],
    completedBuildings: [87, 12, 101, 49],
    ...patch,
  });
const turks = (patch: Partial<MixedArmyConfig> = {}) =>
  config({
    scenario: 'arena-wagon-cannon',
    civ: 'Turks',
    mode: 'one-v-one-arena',
    ownMain: 5,
    enemy: 'wagons-cannon-halberdiers',
    wagon: 1706,
    cannon: 1709,
    terrain: 'open',
    flank: 'clear',
    position: 'safe',
    retreat: 'safe',
    food: 'sustainable',
    woodGold: 'sustainable',
    completedForms: [441],
    completedUnlockTechIds: [47, 10],
    completedBuildings: [87, 101, 49],
    ...patch,
  });
const card = (value: MixedArmyConfig, id: string) => planMixedArmy(ctx, value).cards.find((row) => row.card.id === id)!;

describe('#298 missing observations stay on the first screen', () => {
  it('lists every unknown the default Britons card actually asks', () => {
    expect(mixedArmyGaps(defaultMixedArmyConfig())).toEqual([
      '现有主力准确形态',
      '实际敌军组合',
      '地图与模式',
      '交战地形',
      '敌方步行目标阵型',
      '侧向到场与后排空当',
      '己方保护射击位置',
      '撤回与替代资源',
      '食物持续能力',
      '木材与黄金持续能力',
    ]);
  });
  it('drops filled fields and only adds wagon questions for that scenario', () => {
    expect(mixedArmyGaps(britons())).toEqual(['地图与模式']);
    expect(mixedArmyGaps(turks({ formation: 'spread' }))).toEqual([]);
    expect(mixedArmyGaps(turks({ formation: 'spread', wagon: 'unknown', cannon: 'unknown', enemy: 'wagons' }))).toEqual(['已见胡斯派战车（普通或精锐）']);
    expect(mixedArmyGaps(turks({ formation: 'spread', wagon: 'unknown', cannon: 'unknown' }))).toEqual([
      '已见胡斯派战车（普通或精锐）',
      '已见后排炮（手推炮或榴弹炮）',
    ]);
  });
});
describe('#241 honest unit prerequisites', () => {
  it('separates civilization, age, shape and an actual production building', () => {
    expect(prereq({ civ: 'Aztecs', unitId: 38 }).status).toBe('civ-unavailable');
    expect(prereq({ civ: 'Franks', age: 2, unitId: 38 }).status).toBe('age-unavailable');
    expect(prereq({ age: 3, unitId: 24 }).missingFormIds).toEqual([24]);
    const shaped = prereq({ age: 3, unitId: 24, completedForms: [24] });
    expect(shaped.status).toBe('missing-prerequisites');
    expect(shaped.missingBuildingAlternatives).toEqual([87]);
    expect(prereq({ age: 3, unitId: 24, completedForms: [24], completedBuildings: [87] }).status).toBe('conditions-met');
  });
  it('does not auto-confirm shape upgrades, including free upgrades', () => {
    for (const [civ, unitId, buildingId] of [
      ['Turks', 441, 101],
      ['Turks', 546, 101],
      ['Ethiopians', 358, 12],
    ] as const) {
      expect(prereq({ civ, unitId, completedBuildings: [buildingId] }).missingFormIds).toEqual([unitId]);
      expect(prereq({ civ, unitId, completedForms: [unitId], completedBuildings: [buildingId] }).status).toBe('conditions-met');
    }
  });
  it('requires actual chemistry confirmation independently of automatic production prerequisites', () => {
    for (const [civ, age] of [
      ['Bohemians', 3],
      ['Turks', 4],
    ] as const) {
      const notConfirmed = prereq({ civ, age, unitId: 5, completedBuildings: [87] });
      expect(notConfirmed.missingUnlockTechIds).toEqual([47]);
      expect(notConfirmed.status).toBe('missing-prerequisites');
      expect(prereq({ civ, age, unitId: 5, completedBuildings: [87], completedUnlockTechIds: [47] }).status).toBe('conditions-met');
    }
    expect(prereq({ civ: 'Franks', age: 3, unitId: 5, completedBuildings: [87], completedUnlockTechIds: [47] }).status).toBe('age-unavailable');
  });
  it('reuses potential production age exceptions without copying the early-unit table', () => {
    for (const [civ, age, unitId, buildingId] of [
      ['Armenians', 2, 358, 12],
      ['Armenians', 2, 77, 12],
      ['Burgundians', 3, 283, 101],
      ['Cumans', 2, 1258, 49],
    ] as const) {
      expect(prereq({ civ, age, unitId, completedForms: [unitId], completedBuildings: [buildingId] }).status).toBe('conditions-met');
    }
  });
  it('uses actual monk production location rather than the catalog Unit.b', () => {
    const unit = ctx.core.unitById[125]!;
    const result = prereq({ civ: 'Britons', age: 3, unitId: 125, completedBuildings: [104] });
    expect(unit.b).not.toBe(104);
    expect(result.potentialBuildingIds).toContain(104);
    expect(result.status).toBe('conditions-met');
    expect(prereq({ unitId: 125, completedBuildings: [unit.b] }).status).toBe('missing-prerequisites');
  });
  it('retains a lower selected shape and reports its replacement conflict', () => {
    const result = prereq({ unitId: 24, completedForms: [24, 492], completedBuildings: [87] });
    expect(result.status).toBe('superseded-shape');
    expect(result.reasons.join('')).toContain('已被升级取代');
    expect(prereq({ unitId: 492, completedForms: [492], completedBuildings: [87] }).status).toBe('conditions-met');
  });
  it('does not AND all candidate upgrade technologies or infer a research chain from them', () => {
    expect(GENERAL_GARRISON_DATA.unitUpgradeTechs?.[567]?.length).toBeGreaterThan(1);
    expect(prereq({ civ: 'Britons', unitId: 567, completedForms: [567], completedBuildings: [12] }).status).toBe('conditions-met');
  });
  it('audits the finite shape index and pauses unsupported special/pool-external units', () => {
    for (const id of MIXED_ARMY_CONTENT.prerequisiteUnitIds) {
      const unit = ctx.core.unitById[id]!;
      expect(unit).toBeDefined();
      if (unit.from_ !== null) expect(mixedFormNeedsConfirmation(ctx, id), `${unit.zh}: missing shape index`).toBe(true);
      else expect(mixedFormNeedsConfirmation(ctx, id), `${unit.zh}: unexpected shape index`).toBe(false);
    }
    expect(prereq({ civ: 'Goths', unitId: 759, completedUnlockTechIds: [16], completedBuildings: [12] }).status).toBe('unsupported');
    expect(prereq({ civ: 'Bohemians', unitId: 1706 }).status).toBe('unsupported');
    expect(prereq({ civ: 'Sicilians', unitId: 1786 }).status).toBe('unsupported');
    expect(prereq({ civ: 'Sicilians', unitId: 93 }).potentialBuildingIds).not.toContain(1665);
  });
  it('retains stale or future confirmations for correction rather than treating them as complete', () => {
    const value = config({
      scenario: 'arena-wagon-cannon',
      civ: 'Turks',
      completedForms: [550],
      completedUnlockTechIds: [10],
      age: 3,
      completedBuildings: [209],
    });
    const errors = mixedArmyConfirmationErrors(ctx, value);
    expect(errors.some((error) => error.includes('中型投石车'))).toBe(true);
    expect(errors.some((error) => error.includes('火炮术'))).toBe(true);
    expect(value.completedForms).toEqual([550]);
    expect(planMixedArmy(ctx, value).status).toBe('invalid');
  });
});

describe('#241 finite scenarios and task differences', () => {
  it('collects exactly two scenarios and six complete conditional cards with dated sources', () => {
    expect(MIXED_ARMY_CONTENT.scenarios).toHaveLength(2);
    expect(MIXED_ARMY_CONTENT.cards).toHaveLength(6);
    for (const row of MIXED_ARMY_CONTENT.cards) {
      expect(row.conditions.length).toBeGreaterThan(0);
      for (const text of [row.problem, row.roles.main, row.roles.cover, row.roles.siege, row.cost, row.counterexample, row.alternative, row.next])
        expect(text.length).toBeGreaterThan(10);
      for (const id of row.sourceIds) expect(MIXED_ARMY_CONTENT.sources.find((source) => source.id === id)?.publishedAt).toMatch(/^20[2-9]\d-\d\d-\d\d$/);
    }
  });
  it('changes the threat explanation and tasks when cavalry gains skirmisher cover', () => {
    const alone = planMixedArmy(ctx, britons({ enemy: 'cavalry' })),
      mixed = planMixedArmy(ctx, britons());
    expect(alone.summary).not.toBe(mixed.summary);
    expect(mixed.summary).toContain('不能解决后方掷矛手');
    expect(card(britons({ enemy: 'cavalry' }), 'britons-light-cav-access').status).toBe('conditions-not-met');
    expect(card(britons(), 'britons-light-cav-access').status).toBe('conditions-met');
  });
  it('unknown or blocked access never becomes an immediate side attack', () => {
    expect(card(britons({ flank: 'unknown' }), 'britons-light-cav-access').status).toBe('needs-observation');
    expect(card(britons({ flank: 'blocked', terrain: 'narrow' }), 'britons-light-cav-access').status).toBe('conditions-not-met');
    expect(card(britons({ flank: 'blocked', terrain: 'narrow' }), 'britons-protected-onager').status).toBe('conditions-met');
  });
  it('cavalry plus skirmishers needs a confirmed anti-cavalry screen in the supplemental routes', () => {
    expect(card(britons({ completedForms: [492, 546, 550] }), 'britons-light-cav-access').status).toBe('missing-prerequisites');
    expect(card(britons({ completedForms: [492, 546, 550], enemy: 'skirmishers' }), 'britons-light-cav-access').status).toBe('conditions-met');
  });
  it('keeps pre-Imperial cards in preparation and does not confuse a tech-tree cell with completion', () => {
    const value = config({ age: 3, ownMain: 8, enemy: 'cavalry', completedBuildings: [82] });
    expect(planMixedArmy(ctx, value).cards.every((row) => row.status === 'age-unavailable')).toBe(true);
    expect(card(britons({ completedForms: [492] }), 'britons-halb-screen').status).toBe('missing-prerequisites');
  });
  it('keeps food and wood-gold constraints separate for different tasks', () => {
    expect(card(britons({ woodGold: 'gold-tight' }), 'britons-halb-screen').status).toBe('conditions-met');
    expect(card(britons({ woodGold: 'gold-tight' }), 'britons-protected-onager').status).toBe('conditions-not-met');
    expect(card(britons({ food: 'tight' }), 'britons-light-cav-access').status).toBe('conditions-not-met');
  });
  it('distinguishes lone wagons, added cannon and halberdier protection', () => {
    expect(planMixedArmy(ctx, turks({ enemy: 'wagons' })).summary).toContain('尚未出现后排反攻城威胁');
    expect(card(turks({ enemy: 'wagons' }), 'turks-protected-artillery').status).toBe('conditions-not-met');
    const plan = planMixedArmy(ctx, turks());
    expect(plan.summary).toContain('长戟兵封住通路');
    expect(card(turks(), 'turks-protected-artillery').status).toBe('conditions-met');
  });
  it('separates artillery research, chemistry, the workshop and safety', () => {
    for (const patch of [{ completedUnlockTechIds: [47] }, { completedUnlockTechIds: [10] }, { completedBuildings: [87, 101] }])
      expect(card(turks(patch), 'turks-protected-artillery').status).toBe('missing-prerequisites');
    expect(card(turks({ cannon: 'unknown' }), 'turks-protected-artillery').status).toBe('needs-observation');
    expect(card(turks({ position: 'unsafe' }), 'turks-protected-artillery').status).toBe('conditions-not-met');
    expect(card(turks({ completedForms: [] }), 'turks-flank-opening').status).toBe('missing-prerequisites');
  });
  it('allows a conditional change of position and does not declare unknown withdrawal safe', () => {
    expect(card(turks({ flank: 'blocked', position: 'unsafe' }), 'turks-reposition').status).toBe('conditions-met');
    expect(card(turks({ flank: 'blocked', retreat: 'unknown' }), 'turks-reposition').status).toBe('needs-observation');
  });
  it('retains unsupported civilization, mode, main and enemy choices without synthesizing a generic army', () => {
    expect(planMixedArmy(ctx, turks({ civ: 'Britons' })).status).toBe('not-covered');
    for (const patch of [
      { civ: 'Franks', completedForms: [], completedUnlockTechIds: [] },
      { mode: 'team' as const },
      { ownMain: 38 },
      { enemy: 'other' as const },
    ]) {
      const value = turks(patch);
      const result = planMixedArmy(ctx, value);
      expect(result.status).toBe('not-covered');
      expect(result.cards).toEqual([]);
      expect(decodeMixedArmy(encodeMixedArmy(value)).config).toEqual(value);
    }
  });
  it('starts with unknown observations and no automatic completions or adoptable route', () => {
    const value = defaultMixedArmyConfig();
    expect(value.completedForms).toEqual([]);
    expect(value.completedUnlockTechIds).toEqual([]);
    expect(value.completedBuildings).toEqual([]);
    expect(planMixedArmy(ctx, value).status).toBe('needs-observation');
    expect(planMixedArmy(ctx, value).cards.some((row) => row.status === 'conditions-met')).toBe(false);
  });
});

describe('#241 strict complete URL state', () => {
  it('round trips every input and each independent completion list, including unknowns', () => {
    const value = turks({ formation: 'spread', woodGold: 'wood-tight', retreat: 'unknown' });
    expect(decodeMixedArmy('?' + encodeMixedArmy(value))).toEqual({ config: value, errors: [], locked: false });
    expect(decodeMixedArmy('').config).toEqual(defaultMixedArmyConfig());
  });
  it('rejects truncated, duplicate, unknown, invalid UTF-8 and version-mismatched structures', () => {
    const good = encodeMixedArmy(turks());
    for (const search of [
      '?mv=1',
      good + '&age=4',
      good + '&extra=1',
      good.replace('mv=1', 'mv=2'),
      good.replace('build=185872', 'build=0'),
      good.replace('civ=Turks', 'civ=%FF'),
      good.replace('completedForms=441', 'completedForms=441%2C441'),
      good.replace('age=4', 'age=04'),
      'x'.repeat(MIXED_ARMY_URL_LIMIT + 1),
    ]) {
      const decoded = decodeMixedArmy(search);
      expect(decoded.locked, search.slice(0, 100)).toBe(true);
      expect(decoded.errors.length).toBeGreaterThan(0);
    }
  });
  it('preserves safe semantic errors for correction without producing a default plan', () => {
    for (const value of [config({ age: 9 }), config({ civ: 'NotACivilization' }), config({ ownMain: 999999 }), config({ completedForms: [999999] })]) {
      const decoded = decodeMixedArmy(encodeMixedArmy(value));
      expect(decoded.config).toEqual(value);
      expect(decoded.locked).toBe(false);
      expect(decoded.errors.length).toBeGreaterThan(0);
      expect(planMixedArmy(ctx, decoded.config).status).toBe('invalid');
    }
  });
  it('rejects invalid array structure and never mutates user arrays during planning or encoding', () => {
    expect(() => encodeMixedArmy(config({ completedBuildings: [87, 87] }))).toThrow();
    const value = britons(),
      before = structuredClone(value);
    expect(mixedArmyInputErrors(value)).toEqual([]);
    planMixedArmy(ctx, value);
    encodeMixedArmy(value);
    expect(value).toEqual(before);
  });
});
