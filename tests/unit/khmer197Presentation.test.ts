/** Khmer disclosure separates the current prerequisite policy from actual assigned farming. */
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { civs } from '../../src/data';
import { buildOrders } from '../../src/data/buildOrders';
import { bonusTechs, bonusUsage } from '../../src/domain/bonusUsage';
import { civBonuses } from '../../src/domain/civBonus';
import { civSimNotes, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { buildShareCard, type ShareInput } from '../../src/features/builds/shareCard';
const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const khmer = civs.find((c) => c.en === 'Khmer')!;
const bonus = (idx: number) => civBonuses(khmer).find((b) => !b.team && b.idx === idx)!;
const PREREQ = '当前开局免建筑前置已计入，显式建筑照常付费建造';
const FARM = '农田按免回仓与供给上限连续估算，结果可能低于原通用估算，不代表游戏内加成减益';
const DETAIL = '取消的是回仓往返，田内走点、食物池启动和瞬态、耗尽与续种未模拟；不绑定完成田块与农民人数。';
const FC = ['fast-castle-boom', 'fast-castle-knights'];
const NO_FARM = ['archers-19', 'drush-fc', 'feudal-drush-18', 'hybrid-fish-18', 'maa-archers-18', 'scouts-18'];
const order = (id: string) => buildOrders.find((b) => b.id === id)!;
const share = (id: string): ShareInput => ({
  view: { top: null, timeout: false, tcIdleTotal: 0 } as ShareInput['view'],
  target: undefined,
  boId: id,
  boNameZh: order(id).name.zh,
  civEn: 'Khmer',
  civZh: '高棉',
  targetZh: order(id).target.age === 3 ? '城堡' : '封建',
  dist: 4,
  defaultDist: 4,
  house: true,
  patchBuild: __DATA_SOURCES__.patch.build,
  siteRoot: 'example/',
});
const basis = (i: ShareInput) => `按${i.civZh}计 · 走路 ${i.dist} 格 · 游戏版本 ${i.patchBuild}`;
describe('Khmer source identity and honest current-template presentation', () => {
  it('Khmer0 remains text-sourced without a fabricated positive tech638 mapping, while reporting current prerequisites counted', () => {
    const b = bonus(0);
    expect(b.src).toBe('text');
    expect(bonusTechs(b)).toEqual({ techs: [], treeOnly: false });
    expect(bonusUsage(b).find((x) => x.tool === 'sim')).toMatchObject({ on: true });
    expect(bonusUsage(b).find((x) => x.tool === 'sim')!.note).toContain('当前开局');
    expect(bonusUsage(b).find((x) => x.tool === 'sim')!.note).toContain('显式建筑');
  });
  it('Khmer1 is the farm bonus, distinguishes counted steady mechanism from guaranteed net benefit', () => {
    const b = bonus(1);
    expect(b.src).toBe('eco');
    expect(bonusTechs(b).techs).toContain(654);
    const line = bonusUsage(b).find((x) => x.tool === 'sim');
    expect(line).toMatchObject({ on: true });
    expect(line!.note).toContain(FARM);
    expect(line!.note).not.toContain('固定加速');
    expect(bonusUsage(b).find((x) => x.tool === 'gather')).toMatchObject({ on: false });
  });
  it.each(FC)('%s carries both638 and actual assigned-farm notes into assumptions and share basis', (id) => {
    const b = order(id);
    expect(b.steps.some((s) => s.actions.some((a) => a.type === 'gather' && a.task === 'farm'))).toBe(true);
    expect(civSimNotes(E, 'Khmer', id)).toEqual([PREREQ, FARM]);
    const t = simulateBuild(b, 'Khmer', E, ups, { autoHouses: false });
    expect(t.model.assumptions).toContain(PREREQ);
    expect(t.model.assumptions).toContain(FARM);
    expect(t.model.assumptions).toContain(DETAIL);
    const i = share(id),
      card = buildShareCard(i);
    expect(card.basis).toBe(`${basis(i)}\n${PREREQ}\n${FARM}`);
    expect(card.url).toContain('civ=Khmer');
    expect(civSimNotes(E, 'Khmer', id).join('；')).not.toContain('骑士方案仅供');
  });
  it.each(NO_FARM)('%s has638 disclosure but no farm-income claim', (id) => {
    const b = order(id);
    expect(b.steps.some((s) => s.actions.some((a) => a.type === 'gather' && a.task === 'farm'))).toBe(false);
    expect(civSimNotes(E, 'Khmer', id)).toEqual([PREREQ]);
    const t = simulateBuild(b, 'Khmer', E, ups, { autoHouses: false });
    expect(t.model.assumptions).toContain(PREREQ);
    expect(t.model.assumptions).not.toContain(FARM);
    expect(t.model.assumptions).not.toContain(DETAIL);
    const i = share(id);
    expect(buildShareCard(i).basis).toBe(`${basis(i)}\n${PREREQ}`);
  });
  it.each(FC)('%s preserves each original explicit building and normal total completion counts', (id) => {
    const b = order(id),
      before = JSON.stringify(b);
    const t = simulateBuild(b, 'Khmer', E, ups, { autoHouses: false });
    const expected = new Map<number, number>();
    for (const s of b.steps) for (const a of s.actions) if (a.type === 'build') expected.set(a.building, (expected.get(a.building) ?? 0) + (a.count ?? 1));
    for (const [building, count] of expected) expect(t.buildingsDone.filter((x) => x.building === building)).toHaveLength(count);
    expect(t.anomalies.some((x) => x.type === 'timeout')).toBe(false);
    expect(JSON.stringify(b)).toBe(before);
  });
  it('normal start and house garrison do not grant villagers, stock or housing', () => {
    const t = simulateBuild(order('scouts-18'), 'Khmer', E, ups, { autoHouses: false });
    expect(t.steps[0]!.stock).toEqual({ food: 200, wood: 200, gold: 100, stone: 200 });
    expect(t.steps[0]!.pop).toEqual({ used: 4, cap: 5 });
  });
  it('invalid existing654 source does not advertise a fully counted current model', () => {
    const e = structuredClone(E),
      r = e.civEco.Khmer!.find((x) => x.tech === 654)!;
    r.effects = r.effects.filter((x) => x.kind !== 'res');
    expect(civSimNotes(e, 'Khmer', 'fast-castle-boom')).toEqual([]);
  });
  it('Generic fallback share does not inherit either Khmer disclosure', () => {
    const i = { ...share('fast-castle-boom'), civEn: 'Generic', civZh: '通用' };
    expect(buildShareCard(i).basis).toBe(basis(i));
  });
});
