import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import rules from '../../src/content/mixed-army-rules.json';
import { loadCore, loadTrees } from '../../src/data';
import { productionTechAge, type ProductionContext } from '../../src/domain/production';
import {
  MIXED_ARMY_CONTENT,
  defaultMixedArmyConfig,
  mixedArmyConfirmationErrors,
  mixedArmyUnlockTechIds,
  mixedUnitPrerequisites,
  planMixedArmy,
  type MixedArmyConfig,
} from '../../src/domain/mixedArmy';

let ctx: ProductionContext;
const originalContent = structuredClone(MIXED_ARMY_CONTENT);
const originalRules = structuredClone(rules);
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});
afterEach(() => {
  Object.assign(MIXED_ARMY_CONTENT, structuredClone(originalContent));
  Object.assign(rules, structuredClone(originalRules));
});

const britons = (patch: Partial<MixedArmyConfig> = {}): MixedArmyConfig => ({
  ...defaultMixedArmyConfig(),
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
const turks = (patch: Partial<MixedArmyConfig> = {}): MixedArmyConfig => ({
  ...britons(),
  scenario: 'arena-wagon-cannon',
  civ: 'Turks',
  mode: 'one-v-one-arena',
  ownMain: 5,
  enemy: 'wagons-cannon-halberdiers',
  wagon: 1706,
  cannon: 1709,
  completedForms: [441],
  completedUnlockTechIds: [47, 10],
  completedBuildings: [87, 101, 49],
  ...patch,
});
const result = (config: MixedArmyConfig, strategy: string) => planMixedArmy(ctx, config).cards.find((row) => row.card.strategy === strategy)!;
const outcomes = (config: MixedArmyConfig) => {
  const plan = planMixedArmy(ctx, config);
  return { ...plan, cards: plan.cards.map(({ card, ...outcome }) => ({ strategy: card.strategy, ...outcome })) };
};

describe('#278 finite mixed-army content policies', () => {
  it('pairs every reviewed card and scenario with exactly one maintained rule', () => {
    for (const kind of ['cards', 'scenarios'] as const) {
      const ids = rules[kind].map((row) => row.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.slice().sort()).toEqual(MIXED_ARMY_CONTENT[kind].map((row) => row.id).sort());
    }
    expect(MIXED_ARMY_CONTENT.scenarios.some((row) => row.id === rules.defaultScenarioId)).toBe(true);
    expect(MIXED_ARMY_CONTENT.cards.some((row) => row.id === rules.exampleCardId)).toBe(true);
  });

  it('loads policy changes from the separate rule file and joins by ID regardless of row order', async () => {
    const changedRules = structuredClone(originalRules);
    changedRules.cards.reverse();
    changedRules.scenarios.reverse();
    const card = changedRules.cards.find((row) => row.strategy === 'light-cavalry-access')!;
    card.strategy = 'anti-cavalry-screen';
    const scenario = changedRules.scenarios.find((row) => row.observationProfile === 'archer-cover')!;
    scenario.confirmationFormIds = [550, 546];
    vi.doMock('../../src/content/mixed-army-rules.json', () => ({ default: changedRules }));
    vi.resetModules();
    try {
      const changed = await import('../../src/domain/mixedArmy');
      const config = britons({ enemy: 'cavalry', terrain: 'narrow', flank: 'blocked', woodGold: 'gold-tight' });
      const outcome = changed.planMixedArmy(ctx, config).cards.find((row) => row.card.id === card.id)!;
      expect(outcome.status).toBe('conditions-met');
      expect(outcome.card.title).toBe(originalContent.cards.find((row) => row.id === card.id)!.title);
      expect(changed.MIXED_ARMY_CONTENT.scenarios.find((row) => row.id === scenario.id)!.confirmationFormIds).toEqual([550, 546]);
      expect(changed.MIXED_ARMY_CONTENT.cards.map((row) => row.id)).toEqual(originalContent.cards.map((row) => row.id));
    } finally {
      vi.doUnmock('../../src/content/mixed-army-rules.json');
      vi.resetModules();
    }
  });

  it('renaming every card leaves all six policies and reason ordering unchanged', () => {
    const configurations = [
      britons(),
      britons({ enemy: 'cavalry' }),
      britons({ completedForms: [492], terrain: 'narrow', flank: 'unknown', retreat: 'unsafe', food: 'unknown' }),
      britons({ enemy: 'skirmishers', woodGold: 'gold-tight' }),
      turks(),
      turks({ enemy: 'wagons', cannon: 'unknown' }),
      turks({ flank: 'blocked', position: 'unsafe', retreat: 'unknown' }),
      turks({ completedUnlockTechIds: [47] }),
    ];
    const before = configurations.map(outcomes);
    for (const [index, card] of MIXED_ARMY_CONTENT.cards.entries()) card.id = 'renamed-card-' + index;
    expect(configurations.map(outcomes)).toEqual(before);
  });

  it('uses the declared policy instead of inferring a role from a card identifier', () => {
    const card = MIXED_ARMY_CONTENT.cards.find((row) => row.strategy === 'light-cavalry-access')!;
    const config = britons({ enemy: 'cavalry', terrain: 'narrow', flank: 'blocked', woodGold: 'gold-tight' });
    expect(result(config, card.strategy).status).toBe('conditions-not-met');
    card.strategy = 'anti-cavalry-screen';
    const changed = planMixedArmy(ctx, config).cards.find((row) => row.card.id === card.id)!;
    expect(changed.status).toBe('conditions-met');
    expect(changed.reasons).toEqual([]);
  });

  it('refuses an unknown policy instead of treating it as another route', () => {
    const card = MIXED_ARMY_CONTENT.cards[0]!;
    card.strategy = 'unknown-policy';
    const changed = planMixedArmy(ctx, britons()).cards.find((row) => row.card.id === card.id)!;
    expect(changed.status).toBe('unsupported');
    expect(changed.reasons).toEqual(['本卡片的条件策略暂未支持。']);
  });

  it('reads the mixed-threat supplemental unit and its trigger from each card', () => {
    const config = britons({ completedForms: [492, 546, 550] });
    const card = MIXED_ARMY_CONTENT.cards.find((row) => row.strategy === 'light-cavalry-access')!;
    expect(result(config, card.strategy).status).toBe('missing-prerequisites');
    card.conditionalUnits[0]!.unitIds = [550];
    expect(result(config, card.strategy).status).toBe('conditions-met');
    card.conditionalUnits[0]!.unitIds = [359];
    card.conditionalUnits[0]!.enemyCompositions = ['cavalry'];
    expect(result(config, card.strategy).status).toBe('conditions-met');
  });

  it('accepts unit unlocks and card-only research from their combined content list', () => {
    expect(mixedArmyUnlockTechIds()).toEqual([47, 10]);
    expect(mixedArmyConfirmationErrors(ctx, turks())).toEqual([]);
    const research = ctx.core.techs.find(
      (tech) =>
        !mixedArmyUnlockTechIds().includes(tech.id) &&
        tech.civs.includes('Turks') &&
        productionTechAge(tech, 'Turks') <= 4 &&
        (ctx.trees.t.Turks ?? []).some((block) => block[3].some((cell) => cell[2] === 't' && cell[3] === tech.id && cell[4] === 1)),
    )!;
    expect(research).toBeDefined();
    MIXED_ARMY_CONTENT.cards.find((card) => card.strategy === 'protected-artillery')!.techIds = [research.id, 47];
    const config = turks({ completedUnlockTechIds: [47, research.id] });
    expect(mixedArmyConfirmationErrors(ctx, config)).toEqual([]);
    expect(result(config, 'protected-artillery').status).toBe('conditions-met');
    expect(mixedArmyConfirmationErrors(ctx, turks()).join(' ')).toContain('不是本页收录的必要研究');
  });

  it('reads mandatory unit research from the content map rather than a copied unit table', () => {
    MIXED_ARMY_CONTENT.requiredUnlocks['36'] = [10];
    const prerequisite = mixedUnitPrerequisites(ctx, {
      civ: 'Turks',
      age: 4,
      unitId: 36,
      completedForms: [],
      completedUnlockTechIds: [10],
      completedBuildings: [49],
    });
    expect(prerequisite.status).toBe('conditions-met');
    expect(prerequisite.missingUnlockTechIds).toEqual([]);
  });

  it('reads allowed wagon and cannon forms from the scenario metadata', () => {
    const scenario = MIXED_ARMY_CONTENT.scenarios.find((row) => row.observationProfile === 'wagon-cannon')!;
    scenario.enemyMainUnitIds = [1704];
    expect(planMixedArmy(ctx, turks()).notices).toContain('这种胡斯派战车暂未覆盖，请保留观察或修正。');
    scenario.enemyMainUnitIds = [1704, 1706];
    scenario.enemyCannonUnitIds = [36];
    expect(planMixedArmy(ctx, turks()).notices).toContain('这种后排炮暂未覆盖，请保留观察或修正。');
    expect(planMixedArmy(ctx, turks({ cannon: 36 })).status).toBe('covered');
  });

  it('preserves prerequisite priority and prerequisite, pending, blocked reason order', () => {
    const config = britons({ completedForms: [492], terrain: 'narrow', flank: 'unknown', retreat: 'unsafe', food: 'unknown' });
    const card = result(config, 'light-cavalry-access');
    expect(card.status).toBe('missing-prerequisites');
    expect(card.reasons).toEqual([
      `尚未明确确认${ctx.core.unitById[546]!.zh}所需形态升级实际完成。`,
      `尚未明确确认${ctx.core.unitById[359]!.zh}所需形态升级实际完成。`,
      '尚未确认：存在无需穿过护军的到场路线。',
      '尚未确认：食物能够持续补兵。',
      '地形允许侧向接近。',
      '到场后能够安全撤回。',
    ]);
    expect(result({ ...config, completedForms: [492, 359, 546] }, 'light-cavalry-access').status).toBe('conditions-not-met');
  });

  it('keeps the wood-only allowance and flank main-army safety as distinct policies', () => {
    expect(result(britons({ woodGold: 'gold-tight' }), 'anti-cavalry-screen').status).toBe('conditions-met');
    expect(result(britons({ woodGold: 'gold-tight' }), 'protected-onager').reasons).toContain('当前木材或黄金持续投入不足。');
    expect(result(turks({ position: 'unsafe' }), 'flank-opening').reasons).toEqual(['分兵后主力仍有受保护的位置。']);
  });

  it('keeps pure-wagon exclusions separate from the conditional reposition policy', () => {
    const config = turks({ enemy: 'wagons', cannon: 'unknown', flank: 'blocked', position: 'unknown' });
    expect(result(config, 'protected-artillery').status).toBe('conditions-not-met');
    expect(result(config, 'flank-opening').status).toBe('conditions-not-met');
    expect(result(config, 'reposition').status).toBe('conditions-met');
    expect(result({ ...config, retreat: 'unknown' }, 'reposition').reasons).toEqual(['尚未确认：先查明能撤回到可继续采集与补兵的位置。']);
    expect(result(turks(), 'reposition').reasons).toEqual(['当前填报未显示必须转移的条件；保留此卡作条件变化时参考。']);
    expect(result(turks({ completedUnlockTechIds: [] }), 'reposition').status).toBe('missing-prerequisites');
  });
});
