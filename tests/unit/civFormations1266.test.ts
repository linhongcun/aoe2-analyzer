import { describe, expect, it } from 'vitest';
import { civByEn, loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { projectFormation } from '../../src/domain/civFormations';
import { DAT } from '../../src/domain/datEffects';
import { civStatus, presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import { ctx, techById, units } from './helpers';

const formationContent = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const imperial = (civ: string, id: number, omit?: number) => {
  const unit = units.find((entry) => entry.id === id)!;
  const selected = presetUpTo(simTechs(ctx, unit, civ), 4, civ);
  if (omit !== undefined) selected.delete(omit);
  return simulate(ctx, unit, civ, 4, selected, new Set());
};

describe('#1266 七个文明阵容的机制与条件边界', () => {
  it('马普切两条原路线保留，按现有科技树和目录区分科那与突袭', () => {
    const status = civStatus(ctx.trees, 'Mapuche');
    expect([81, 82, 80, 435, 39, 201, 437, 436].every((id) => !status['t' + id])).toBe(true);
    expect(status.u359).toBe(1);
    expect([67, 68, 75, 74, 76, 77].every((id) => status['t' + id] === 1)).toBe(true);
    expect(imperial('Mapuche', 2568)).toMatchObject({ ma: 0, pa: 5 });
    expect(imperial('Mapuche', 2571)).toMatchObject({ hp: 65, rng: 7, rof: 2 });
    expect(techById[1379]!.desc).toBe('掷石绳骑兵、投石手和掷矛手可造成穿透伤害。');
    for (const route of formationContent('Mapuche').routes) {
      expect(route).toMatchObject({ status: 'approved', playtest: 'unreported', limitation: expect.stringContaining('突袭（1379）不含科那') });
      expect(route.adjustments).toContainEqual(
        expect.objectContaining({ text: expect.stringContaining('未实战验证'), requires: [{ kind: 'unit', id: 359, age: 4 }] }),
      );
    }
  });

  it('法兰克射程 7 需便携弯弩装置，且保留五项缺口', () => {
    const status = civStatus(ctx.trees, 'Franks');
    expect([201, 437, 219, 435, 436].every((id) => !status['t' + id])).toBe(true);
    expect(imperial('Franks', 2701)).toMatchObject({ hp: 66, atk: 11, ma: 4, pa: 2, rng: 7, rof: 2.5 });
    expect(imperial('Franks', 2701, 1452).rng).toBe(6);
    const route = formationContent('Franks').routes.find(({ id }) => id === 'franks-heavy-mounted-crossbow-light-cav')!;
    expect(route.limitation).toMatch(/便携弯弩装置（1452）.*射程 7.*只取消该科技时射程 6/);
  });

  it('波斯免金弩手保持原主路，四个条件依赖分别投影', async () => {
    const { routes, source } = formationContent('Persians');
    const route = routes[0]!;
    const catalog = { core: await loadCore(), trees: await loadTrees() };
    const status = civStatus(catalog.trees, 'Persians');
    expect([status.u492, status.t201]).toEqual([0, 0]);
    expect(civByEn('Persians')!.bon).toContain('在城堡时代可使用帕提亚战术');
    expect(route.evidence.links).toContainEqual({
      label: '波斯城堡时代帕提亚加成',
      href: 'https://linhongcun.github.io/aoe2-analyzer/#/civ/Persians#bonuses',
    });
    expect(imperial('Persians', 24)).toMatchObject({ hp: 35, atk: 8, rng: 7 });
    const project = (core = catalog.core) => projectFormation(route, 'Persians', DATA_PATCH, { core, trees: catalog.trees }, routes, source);
    const view = project();
    if (view.status !== 'current') throw new Error(view.status);
    expect(view.required.map(({ entity }) => entity.id)).toEqual([1813, 24, 36]);
    expect(view.adjustments.map(({ text }) => text)).toEqual(['重装骑射手', '火枪手', '重装骆驼兵', '长戟兵'].map((name) => expect.stringContaining(name)));
    const unitById = { ...catalog.core.unitById };
    delete unitById[474];
    const fallback = project({ ...catalog.core, unitById });
    if (fallback.status !== 'current') throw new Error(fallback.status);
    expect(fallback.adjustments.filter(({ unavailable }) => unavailable).map(({ id }) => id)).toEqual(['persian-heavy-cavalry-archer']);
  });

  it('吴的黑光是独立抗弓前排条件选项，帝王攻击与步兵回复各有对象', () => {
    const status = civStatus(ctx.trees, 'Wu');
    expect([status.t219, status.t437]).toEqual([0, 0]);
    expect(imperial('Wu', 1970).rof).toBe(3.5);
    expect(imperial('Wu', 1946)).toMatchObject({ hp: 110, atk: 18, ma: 7, pa: 7 });
    const frontline = formationContent('Wu').routes.find(({ id }) => id === 'wu-jian-heiguang-frontline')!;
    const blackLight = frontline.choices?.find(({ entities }) => entities.some(({ id }) => id === 1946));
    expect(frontline).toMatchObject({ status: 'approved', playtest: 'pending' });
    expect(blackLight).toMatchObject({
      entities: [{ id: 1946, age: 4, role: expect.stringMatching(/帝王攻击 \+2.*每分钟恢复 30 生命是帝王步兵加成/) }],
    });
  });

  it('格鲁吉亚减人口和高地减伤按机制表述，掷矛支援保留护甲短板', () => {
    const route = formationContent('Georgians').routes[0]!;
    expect(civStatus(ctx.trees, 'Georgians').t219).toBe(0);
    expect(techById[924]!.desc).toContain('骑乘单位所占人口空间 -20%');
    expect(civByEn('Georgians')!.bon).toContain('在高海拔战斗时，单位和建筑受到的伤害 -15%');
    expect(route.limitation).toContain('满人口阵容战果未模拟');
    expect(route.adjustments?.find(({ id }) => id === 'ranged')?.text).toContain('缺射手锁甲');
  });

  it('不列颠普通巨投满科技 17 射程与战狼号 100% 准确度生效，取消战狼号保持 92% 基线', () => {
    const trebuchet = units.find(({ id }) => id === 331)!;
    expect(imperial('Britons', 331)).toMatchObject({ rng: 17, acc: 100 });
    expect(imperial('Britons', 331, 461)).toMatchObject({ rng: 17, acc: 92 });
    expect(simTechs(ctx, trebuchet, 'Britons').find(({ t }) => t.id === 461)?.ef).toEqual([{ s: 'acc', op: 'set', v: 100 }]);
    expect(DAT.techs.Warwolf!.rules.filter(({ fx }) => fx.some(({ s, v }) => s === 'acc' && v === 100)).map(({ t }) => t)).toEqual([[331, 1942]]);
    expect(civStatus(ctx.trees, 'Britons').u588).toBe(0);
    const route = formationContent('Britons').routes[0]!;
    expect(route.adjustments).toContainEqual(
      expect.objectContaining({
        when: '成群弩炮或掷矛手，且本就计划用巨投推进',
        text: expect.stringContaining('未实战验证'),
        requires: [
          { kind: 'unit', id: 331, age: 4 },
          { kind: 'tech', id: 461, age: 4 },
        ],
      }),
    );
  });

  it('阿兹特克帝王主路置顶并保留鹰＋掷矛限定候选，重投不强制与僧侣同出', async () => {
    const { routes, source } = formationContent('Aztecs');
    const [imperialMain, eagleCandidate] = routes;
    expect(imperialMain).toMatchObject({ id: 'aztecs-garland-infantry', status: 'approved', playtest: 'pending', age: 4 });
    expect(imperialMain!.source?.content).toMatch(/\/blob\/[a-f0-9]{40}\/role\/game-strategy\.md#L1111-L1153$/);
    expect(eagleCandidate).toMatchObject({ id: 'aztecs-eagle-skirmisher', status: 'candidate', playtest: 'unreported', age: 3 });
    expect(eagleCandidate!.source?.content).toMatch(/\/blob\/[a-f0-9]{40}\/role\/game-strategy\.md#L1111-L1153$/);
    expect(imperial('Aztecs', 726)).toMatchObject({ atk: 27, bonus: { 步兵: 6 } });
    expect(imperial('Aztecs', 588).rng).toBe(9);
    const core = await loadCore();
    const trees = await loadTrees();
    const project = (currentCore = core) => projectFormation(imperialMain!, 'Aztecs', DATA_PATCH, { core: currentCore, trees }, routes, source);
    const view = project();
    if (view.status !== 'current') throw new Error(view.status);
    expect(view.required.map(({ entity }) => entity.id)).toEqual([752]);
    expect(view.choices.map(({ entities }) => entities.map(({ entity }) => entity.id))).toEqual([[567], [726]]);
    expect(view.prerequisites.map(({ entity }) => entity.id)).toEqual([24]);
    expect(view.supplements.map(({ entities }) => entities.map(({ entity }) => entity.id))).toEqual([[588, 377], [125], [24, 492]]);
    const unitById = { ...core.unitById };
    delete unitById[588];
    const withoutSiege = project({ ...core, unitById });
    if (withoutSiege.status !== 'current') throw new Error(withoutSiege.status);
    expect(withoutSiege.supplements.flatMap(({ entities }) => entities.map(({ entity }) => entity.id))).toEqual([125, 24, 492]);
  });
});
