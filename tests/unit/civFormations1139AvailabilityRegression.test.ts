import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { loadCore, loadTrees } from '../../src/data';
import { projectFormation } from '../../src/domain/civFormations';

const siegeRouteIds = [
  'byzantines-cataphract',
  'malians-light-cavalry-gbeto',
  'goths-huskarl-halberdier',
  'koreans-fire-lancer-garrison',
  'jurchens-fire-lancer-tower',
  'teutons-paladin-skirmisher',
  'teutons-halberdier-handcannon',
  'teutons-elite-knight-skirmisher',
  'franks-throwing-axeman-light-cav',
  'lithuanians-leitis-skirmisher',
  'poles-obuch-winged-hussar',
  'poles-arbalest-winged-hussar',
  'poles-discount-knights',
  'bulgarians-krepost-konnik',
];
const stalePositiveClauses = [
  '少量手推炮或巨投按已有兵量和射击机会择一',
  '已有巨型投石机可先沿用，不要求另产手推炮',
  '攻城器仅按实际目标配置',
  '攻城器不作固定主力，按目标与已有基础选配',
  '保护攻城器推进',
  '烈堤司以近战处理重甲并保护攻城器',
  '按需攻城器拆关键防御',
  '保护己方攻城器',
  '和现有攻城候选',
];

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => byCiv(civ).routes.find((entry) => entry.id === id)!;
const removeUnit = (core: Awaited<ReturnType<typeof loadCore>>, id: number) => {
  const unitById = { ...core.unitById };
  delete unitById[id];
  return { ...core, unitById };
};
const removeTech = (core: Awaited<ReturnType<typeof loadCore>>, id: number) => {
  const techById = { ...core.techById };
  delete techById[id];
  return { ...core, techById };
};
const removeBuilding = (core: Awaited<ReturnType<typeof loadCore>>, id: number) => {
  const buildingById = { ...core.buildingById };
  delete buildingById[id];
  return { ...core, buildingById };
};
const project = (civ: string, id: string, core: Awaited<ReturnType<typeof loadCore>>, trees: Awaited<ReturnType<typeof loadTrees>>) => {
  const content = byCiv(civ);
  return projectFormation(route(civ, id), civ, DATA_PATCH, { core, trees }, content.routes, content.source);
};
const visibleRouteText = (view: Extract<ReturnType<typeof projectFormation>, { status: 'current' }>) =>
  [view.route.condition, view.route.reason, view.route.attack, view.route.defense, view.route.limitation, ...view.adjustments.map(({ text }) => text)]
    .filter((text): text is string => Boolean(text))
    .join(' ');

describe('#1139 optional siege and source-backed availability regressions', () => {
  it('projects each of the 14 siege choice groups with every single candidate missing and with the whole group missing', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const groups = civFormationContent.flatMap((entry) =>
      entry.routes.flatMap((formation) => {
        const group = formation.supplements.find(({ mode }) => mode === 'choice');
        return group && siegeRouteIds.includes(formation.id) ? [{ civ: entry.civ, formation, group }] : [];
      }),
    );
    expect(groups.map(({ formation }) => formation.id).sort()).toEqual([...siegeRouteIds].sort());
    expect(groups).toHaveLength(14);

    for (const { civ, formation, group } of groups) {
      const full = project(civ, formation.id, core, trees);
      expect(full.status, formation.id).toBe('current');
      if (full.status !== 'current') continue;
      const fullGroup = full.supplements.find(({ mode }) => mode === 'choice');
      expect(fullGroup?.condition).toBe(group.condition);
      expect(fullGroup?.entities.map(({ entity, role }) => [entity.id, role])).toEqual(group.entities.map(({ id, role }) => [id, role]));
      expect(group.condition).not.toMatch(/二选一|两种|择一/);

      for (const missing of group.entities) {
        const partial = project(civ, formation.id, removeUnit(core, missing.id), trees);
        expect(partial.status, `${formation.id} missing ${missing.id}`).toBe('current');
        if (partial.status !== 'current') continue;
        const partialGroup = partial.supplements.find(({ mode }) => mode === 'choice');
        expect(partialGroup?.entities.map(({ entity }) => entity.id)).toEqual(group.entities.filter(({ id }) => id !== missing.id).map(({ id }) => id));
        expect(partialGroup).toBeDefined();
        expect(partialGroup!.condition).not.toMatch(/手推炮|巨型投石机|巨投|重型冲车|二选一|两种/);
        const prose = visibleRouteText(partial);
        expect(prose).not.toContain(group.condition);
        for (const clause of stalePositiveClauses) expect(prose).not.toContain(clause);
      }

      const empty = project(
        civ,
        formation.id,
        group.entities.reduce((next, entity) => removeUnit(next, entity.id), core),
        trees,
      );
      expect(empty.status, `${formation.id} missing entire choice group`).toBe('current');
      if (empty.status === 'current') {
        expect(empty.supplements.some(({ mode }) => mode === 'choice')).toBe(false);
        expect(visibleRouteText(empty)).not.toContain(group.condition);
        for (const clause of stalePositiveClauses) expect(visibleRouteText(empty)).not.toContain(clause);
      }
    }

    expect(route('Byzantines', 'byzantines-cataphract').supplements.find(({ mode }) => mode === 'choice')!.condition).toContain('已有兵量和射击机会');
    expect(route('Goths', 'goths-huskarl-halberdier').supplements.find(({ mode }) => mode === 'choice')!.entities[1]!.role).toContain('已有巨型投石机可先沿用');
    expect(route('Malians', 'malians-light-cavalry-gbeto').supplements.find(({ mode }) => mode === 'choice')!.entities[1]!.role).toContain('远程攻城器威胁时');
    expect(route('Koreans', 'koreans-fire-lancer-garrison').supplements.find(({ mode }) => mode === 'choice')!.entities[0]!.role).toContain('必要时退守');
    expect(route('Lithuanians', 'lithuanians-leitis-skirmisher').supplements.find(({ mode }) => mode === 'choice')!.entities[0]!.role).toContain('按需');
  });

  it('keeps China 283 and Turks 330 advice gated, and Bohemian optional branches locally hidden', async () => {
    const core = await loadCore();
    const trees = await loadTrees();

    const china = route('Chinese', 'china-chu-ko-nu');
    const chinaNormal = project('Chinese', china.id, core, trees);
    expect(chinaNormal.status).toBe('current');
    if (chinaNormal.status === 'current') expect(chinaNormal.adjustments.find(({ id }) => id.endsWith('-knight-replacement'))?.text).toContain('评估重装骑士');
    const chinaMissing = project('Chinese', china.id, removeUnit(core, 283), trees);
    expect(chinaMissing.status).toBe('current');
    if (chinaMissing.status === 'current') {
      expect(chinaMissing.adjustments.find(({ id }) => id.endsWith('-knight-replacement'))).toMatchObject({
        unavailable: true,
        text: china.adjustments![0]!.fallback,
      });
      const missing283Text = visibleRouteText(chinaMissing);
      expect(missing283Text).not.toContain('黄金与骑士科技足够时只替换部分轻骑');
      expect(missing283Text).not.toContain('黄金充足且有骑士科技时可评估重装骑士替换部分轻骑');
    }

    const turks = route('Turks', 'turks-hussar-handcannon');
    expect(turks.condition).not.toContain('骆驼');
    const turksNormal = project('Turks', turks.id, core, trees);
    expect(turksNormal.status).toBe('current');
    if (turksNormal.status === 'current') expect(turksNormal.adjustments[0]?.text).toContain('补重装骆驼');
    const turksMissing = project('Turks', turks.id, removeUnit(core, 330), trees);
    expect(turksMissing.status).toBe('current');
    if (turksMissing.status === 'current') expect(turksMissing.adjustments[0]).toMatchObject({ unavailable: true, text: turks.adjustments![0]!.fallback });

    const bohemia = route('Bohemians', 'bohemians-handcannon-halberdier');
    expect(bohemia.reason).toContain('延续城堡时代火枪基础可降低转型负担');
    expect(bohemia.supplements.find(({ mode }) => mode === 'upgrade')?.condition).toBe('经济与炮量允许升级。');
    expect(bohemia.required.map(({ id }) => id)).toEqual([5, 359, 36]);
    const no1709 = project('Bohemians', bohemia.id, removeUnit(core, 1709), trees);
    expect(no1709.status).toBe('current');
    if (no1709.status === 'current') {
      expect(no1709.supplements.some(({ mode }) => mode === 'upgrade')).toBe(false);
      const missing1709Text = visibleRouteText(no1709);
      expect(missing1709Text).not.toContain('经济与炮量允许升级');
      expect(missing1709Text).not.toContain('按经济和已有炮量升级榴弹炮');
    }
    expect(bohemia.age).toBe(4);
    expect(bohemia.supplements.find(({ mode }) => mode === 'upgrade')?.entities.map(({ id }) => id)).toEqual([1709]);

    const construction = bohemia.adjustments!.find(({ id }) => id.endsWith('-construction-variant'))!;
    expect(construction.requires).toEqual([
      { kind: 'building', id: 235 },
      { kind: 'unit', id: 1704 },
      { kind: 'unit', id: 83 },
    ]);
    for (const missing of [
      { kind: 'building', id: 235 },
      { kind: 'unit', id: 1704 },
      { kind: 'unit', id: 83 },
    ] as const) {
      const reduced = missing.kind === 'building' ? removeBuilding(core, missing.id) : removeUnit(core, missing.id);
      const view = project('Bohemians', bohemia.id, reduced, trees);
      expect(view.status).toBe('current');
      if (view.status === 'current') {
        expect(view.adjustments.find(({ id }) => id.endsWith('-construction-variant'))).toMatchObject({
          unavailable: true,
          text: bohemia.adjustments!.find(({ id }) => id.endsWith('-construction-variant'))!.fallback,
        });
        const missingConstructionText = visibleRouteText(view);
        expect(missingConstructionText).not.toContain('黄金采集支持火药单位，石头采集支持前线箭塔');
        expect(missingConstructionText).not.toContain('按需用胡斯派战车对射、掩护，取得施工空间后再让村民进场');
        if (missing.id === 235) expect(missingConstructionText).not.toContain('部分火枪驻塔可增加箭支并改变交战条件');
        if (missing.id === 83) expect(missingConstructionText).not.toContain('村民的生命与移动加成可用于前线施工、生存与撤退');
        if (missing.id !== 83) expect(view.supplements.some(({ mode }) => mode === 'position-variant')).toBe(false);
      }
    }

    const monk = bohemia.adjustments!.find(({ id }) => id.endsWith('-monk-variant'))!;
    expect(monk.requires).toEqual([
      { kind: 'unit', id: 125 },
      { kind: 'tech', id: 231 },
      { kind: 'tech', id: 252 },
    ]);
    for (const missing of [
      { kind: 'unit', id: 125 },
      { kind: 'tech', id: 231 },
      { kind: 'tech', id: 252 },
    ] as const) {
      const reduced = missing.kind === 'unit' ? removeUnit(core, missing.id) : removeTech(core, missing.id);
      const view = project('Bohemians', bohemia.id, reduced, trees);
      expect(view.status).toBe('current');
      if (view.status === 'current')
        expect(view.adjustments.find(({ id }) => id.endsWith('-monk-variant'))).toMatchObject({ unavailable: true, text: monk.fallback });
    }

    const villagerTech = bohemia.adjustments!.find(({ id }) => id.endsWith('-villager-tech-effects'))!;
    expect(villagerTech.requires).toEqual([
      { kind: 'unit', id: 83 },
      { kind: 'tech', id: 231 },
      { kind: 'tech', id: 252 },
    ]);
    const normalBohemia = project('Bohemians', bohemia.id, core, trees);
    expect(normalBohemia.status).toBe('current');
    if (normalBohemia.status === 'current')
      expect(normalBohemia.adjustments.find(({ id }) => id.endsWith('-villager-tech-effects'))?.text).toContain('实际研究圣洁与狂热后');
    for (const missing of [
      { kind: 'unit', id: 83 },
      { kind: 'tech', id: 231 },
      { kind: 'tech', id: 252 },
    ] as const) {
      const reduced = missing.kind === 'unit' ? removeUnit(core, missing.id) : removeTech(core, missing.id);
      const view = project('Bohemians', bohemia.id, reduced, trees);
      expect(view.status).toBe('current');
      if (view.status === 'current')
        expect(view.adjustments.find(({ id }) => id.endsWith('-villager-tech-effects'))).toMatchObject({ unavailable: true, text: villagerTech.fallback });
    }
  });

  it('keeps the Aztec trebuchet optional and Saxon text byte-for-byte aligned with 9f3b43a', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const aztec = route('Aztecs', 'aztecs-eagle-skirmisher');
    expect([aztec.status, aztec.playtest, aztec.age]).toEqual(['candidate', 'unreported', 3]);
    const normal = project('Aztecs', aztec.id, core, trees);
    expect(normal.status).toBe('current');
    if (normal.status === 'current')
      expect(normal.supplements.find(({ mode }) => mode === 'as-needed')?.entities.map(({ entity, age }) => [entity.id, age])).toContainEqual([331, 4]);
    const missing = project('Aztecs', aztec.id, removeUnit(core, 331), trees);
    expect(missing.status).toBe('current');
    if (missing.status === 'current') expect(missing.supplements.some(({ entities }) => entities.some(({ entity }) => entity.id === 331))).toBe(false);

    expect(civFormationContent).toHaveLength(28);
    expect(civFormationContent.flatMap(({ routes }) => routes)).toHaveLength(43);
    const saxons = route('Saxons', 'saxons-retainer-tower');
    expect(createHash('sha256').update(JSON.stringify(saxons)).digest('hex')).toBe('8c48661503d9674e06757b033fd0c90d5c8a9f14f6a3a6f14952ac250d0e02e6');
  });
});
