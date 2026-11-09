import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCOUTING_OBSERVATIONS, SCOUTING_SCENARIOS, SCOUTING_STAGES, SCOUTING_STATES } from '../../src/domain/scouting';
import { MIXED_ARMY_ENEMIES, MIXED_ARMY_SCENARIOS } from '../../src/domain/mixedArmy';
import { PLAN_AGES, PLAN_EXAMPLES, PLAN_OPENNESSES, POSITION_NAMES, SUPPLY_NAMES, TASK_KINDS } from '../../src/domain/teamPlan';
import { CONTENT_ACQUISITIONS, CONTENT_EVIDENCE_STATUSES, CONTENT_KINDS, CONTENT_MODES } from '../../src/domain/contentCatalog';
import { GLOSSARY_CATEGORIES } from '../../src/domain/glossary';
import mixedContent from '../../src/content/mixed-army.json';

type Schema = Record<string, unknown>;
const schema = (name: string): Schema => JSON.parse(readFileSync(`src/content/schema/${name}.json`, 'utf8')) as Schema;
const at = (value: unknown, path: string): unknown => path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], value);
const values = (value: unknown, path: string): unknown[] => at(value, path) as unknown[];
const sorted = (values: readonly unknown[]) => [...values].sort();

describe('content schema 与 domain 允许值一致（issue 838）', () => {
  it('scouting：场景/观察完全相等，阶段与状态是 domain 子集', () => {
    const s = schema('content-scouting');
    expect(sorted(values(s, '$defs.scenario.properties.id.enum'))).toEqual(sorted(SCOUTING_SCENARIOS));
    for (const path of [
      'properties.observations.items.properties.id.enum',
      '$defs.rule.properties.observation.enum',
      '$defs.scenario.properties.observationIds.items.enum',
    ]) {
      expect(sorted(values(s, path)), path).toEqual(sorted(SCOUTING_OBSERVATIONS));
    }
    for (const value of values(s, '$defs.scenario.properties.stage.enum')) expect(SCOUTING_STAGES).toContain(value);
    for (const value of values(s, '$defs.rule.properties.state.enum')) expect(SCOUTING_STATES).toContain(value);
  });

  it('mixedArmy：敌人枚举相等，卡片场景都存在于场景表', () => {
    const s = schema('content-mixed-army');
    expect(sorted(values(s, '$defs.scenario.properties.enemyCompositions.items.enum'))).toEqual(sorted(MIXED_ARMY_ENEMIES));
    const cards = (mixedContent as { cards: { scenario: string }[] }).cards;
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(MIXED_ARMY_SCENARIOS, card.scenario).toContain(card.scenario);
    }
  });

  it('teamPlan：年龄/任务/位置/补给/开放度/示例都相等', () => {
    const s = schema('content-team-plan');
    expect(sorted(values(s, '$defs.phase.properties.age.enum'))).toEqual(sorted(PLAN_AGES));
    expect(sorted(values(s, '$defs.example.properties.activeAge.enum'))).toEqual(sorted(PLAN_AGES));
    expect(sorted(values(s, '$defs.task.properties.kind.enum'))).toEqual(sorted(TASK_KINDS));
    expect(sorted(values(s, '$defs.player.properties.position.enum'))).toEqual(sorted(Object.keys(POSITION_NAMES)));
    expect(sorted(values(s, '$defs.phasePlayer.properties.supply.enum'))).toEqual(sorted(Object.keys(SUPPLY_NAMES)));
    expect(sorted(values(s, '$defs.example.properties.map.properties.openness.enum'))).toEqual(sorted(PLAN_OPENNESSES));
    expect(sorted(values(s, '$defs.example.properties.example.enum'))).toEqual(sorted(PLAN_EXAMPLES));
  });

  it('contentCatalog：模式/种类去掉 all 后相等，获取方式与证据状态相等', () => {
    const s = schema('content-contentCatalog');
    const modes = Object.keys(CONTENT_MODES).filter((key) => key !== 'all');
    const kinds = Object.keys(CONTENT_KINDS).filter((key) => key !== 'all');
    expect(sorted(values(s, '$defs.block.properties.mode.enum'))).toEqual(sorted(modes));
    expect(sorted(values(s, '$defs.block.properties.kind.enum'))).toEqual(sorted(kinds));
    expect(sorted(values(s, '$defs.product.properties.acquisition.properties.kind.enum'))).toEqual(sorted(Object.keys(CONTENT_ACQUISITIONS)));
    expect(sorted(values(s, '$defs.source.properties.status.enum'))).toEqual(sorted(CONTENT_EVIDENCE_STATUSES));
    expect(sorted(values(s, '$defs.product.properties.prerequisites.properties.status.enum'))).toEqual(sorted(CONTENT_EVIDENCE_STATUSES));
  });

  it('glossary：分类相等', () => {
    const s = schema('content-glossary');
    expect(sorted(values(s, '$defs.term.properties.category.enum'))).toEqual(sorted(GLOSSARY_CATEGORIES));
  });
});
