// #42 匈奴：不需要房子（Tech tree res 4 +2000）+ 开局 −100 木（tech 225 res 92）。数值全部来自 src/data/eco.json（.dat 导出）。
// v0.4.0 仍置灰（缺第二条 2020 年后的独立出处）：simSupport('Huns') 为 false；逻辑用 ignoreSourceGate 强制打开测试。
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simSupport as simSupportFn, simSupportReasons } from '../../src/domain/simSupport';
import {
  civNoHouses,
  noHouseCompare,
  simSupport,
  simulateBuild,
  stripHouses,
  unknownCivEffects,
  unhandledEffects,
  SOURCE_PENDING_CIVS,
  type EcoData,
  type UpgradeData,
} from '../../src/domain/buildSim';
import { noHouseCompareText, noteParts } from '../../src/features/builds/timelineModel';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const HOUSE = 70;
const bo = (id: string) => buildOrders.find((b) => b.id === id)!;
const run = (id: string, civ: string, autoHouses = true) => simulateBuild(bo(id), civ, E, ups, { autoHouses });
const targetAge = (id: string) => (['', '', 'feudal', 'castle', 'imperial'] as const)[bo(id).target.age]!;

describe('#42 匈奴：数据与分类', () => {
  it('人口加成与起始木头从 eco.json 读：res 4 +2000、res 92 −100', () => {
    const effs = E.civEco.Huns!.flatMap((r) => r.effects);
    expect(effs).toContainEqual(expect.objectContaining({ kind: 'res', res: 4, op: 'add', v: 2000 }));
    expect(effs).toContainEqual(expect.objectContaining({ kind: 'res', res: 92, op: 'add', v: -100 }));
    expect(civNoHouses(E, 'Huns')).toBe(true);
    expect(civNoHouses(E, 'Generic')).toBe(false);
    expect(civNoHouses(E, 'Franks')).toBe(false);
  });
  it('所有匈奴效果都已分类，没有未实现/未分类的（bo:check 能过）', () => {
    expect(unhandledEffects(E, 'Huns', buildOrders)).toEqual([]);
    expect(unknownCivEffects(E, buildOrders)).toEqual([]);
  });
  it('v0.4.0 仍置灰：simSupport 为 false，原因是出处不足；去掉出处门槛则为 true', () => {
    expect(simSupportFn('Huns')).toBe(false);
    expect(simSupportReasons('Huns')).toEqual([SOURCE_PENDING_CIVS.Huns]);
    expect(simSupport(E, 'Huns', buildOrders, { ignoreSourceGate: true })).toEqual({ supported: true, reasons: [] });
  });
});

describe('#42 匈奴：模拟', () => {
  it.each(buildOrders.map((b) => [b.id] as const))('%s：不建房、不卡人口，自动补房开关不起作用，步骤数不变', (id) => {
    for (const ah of [true, false]) {
      const r = run(id, 'Huns', ah);
      expect(r.noHouses).toBe(true);
      expect(r.housePaidAt).toEqual([]);
      expect(r.buildingsDone.filter((b) => b.building === HOUSE)).toEqual([]);
      expect(r.anomalies.filter((a) => a.type === 'pop_block' || a.type === 'timeout')).toEqual([]);
      expect(JSON.stringify(r.anomalies)).not.toContain('卡人口');
      expect(r.steps).toHaveLength(bo(id).steps.length);
      expect(r.steps.map((s) => s.index)).toEqual(bo(id).steps.map((_, i) => i));
    }
  });
  it.each(buildOrders.map((b) => [b.id] as const))('%s：跳过造房的步骤 = 含造房动作的步骤', (id) => {
    const want = bo(id).steps.flatMap((s, i) => (s.actions.some((a) => a.type === 'build' && a.building === HOUSE) ? [i] : []));
    expect(want.length).toBeGreaterThan(0);
    expect(run(id, 'Huns').skippedHouseSteps).toEqual(want);
    expect(run(id, 'Generic').skippedHouseSteps).toEqual([]);
  });
  it('起始木头比通用少 100：scouts-18 第 1 步（都不付房子木头时）', () => {
    // 第 1 步快照在付房子木头之前；关自动补房
    const h = run('scouts-18', 'Huns', false).steps[0]!;
    const g = run('scouts-18', 'Generic', false).steps[0]!;
    expect(h.stock.wood - g.stock.wood).toBe(-100);
  });
  it.each(buildOrders.map((b) => [b.id] as const))('%s：到达目标时代比通用早；木头净值 = 通用到达前付的房子数乘 25 − 100', (id) => {
    const h = run(id, 'Huns'),
      g = run(id, 'Generic');
    const c = noHouseCompare(h, g, E, 'Huns', targetAge(id))!;
    expect(c.earlierSec).toBeGreaterThan(0);
    expect(c.startWoodDelta).toBe(-100);
    const gReach = g.ageUps.find((a) => a.age === targetAge(id))!.reachAt;
    expect(c.housesSaved).toBe(g.housePaidAt.filter((t) => t <= gReach).length);
    expect(c.woodNet).toBe(c.housesSaved * 25 - 100);
  });
  it('feudal-drush-18：封建早 20.8s、通用到封建前付 4 座房子 时 木头净省 0（防回归）', () => {
    const c = noHouseCompare(run('feudal-drush-18', 'Huns'), run('feudal-drush-18', 'Generic'), E, 'Huns', 'feudal')!;
    expect(c.earlierSec).toBeCloseTo(20.8, 1);
    expect(c.housesSaved).toBe(4);
    expect(c.woodNet).toBe(0);
  });
  it('不需要房子以外的文明不出对比', () => {
    expect(noHouseCompare(run('scouts-18', 'Franks'), run('scouts-18', 'Generic'), E, 'Franks')).toBeNull();
  });
  it('stripHouses：第 1 步的 3 个建造者改去吃羊（默认写法，出处未核实），第 2 步不再从建造调人', () => {
    const s = stripHouses(bo('scouts-18'));
    expect(s.steps[0]!.actions).toEqual([{ type: 'gather', task: 'sheep', count: 3 }]);
    expect(s.steps[1]!.actions.some((a) => a.type === 'gather' && a.from === 'build')).toBe(false);
    expect(s.steps.flatMap((x) => x.actions).some((a) => a.type === 'build' && a.building === HOUSE)).toBe(false);
    expect(s.steps).toHaveLength(bo('scouts-18').steps.length);
  });
});

describe('#42 匈奴：界面文案（flag 打开时的模型，强制支持测）', () => {
  const st = bo('scouts-18').steps;
  it('关闭（置灰/通用）时说明原样一段，不出「不需要」片段', () => {
    for (const s of st) expect(noteParts(s.note ?? '', s.houseText, false).every((p) => !p.skip)).toBe(true);
  });
  it('打开时第 1、2、5 步的造房片段被标出，其余文字不丢', () => {
    for (const i of [0, 1, 4]) {
      const parts = noteParts(st[i]!.note!, st[i]!.houseText, true);
      expect(parts.some((p) => p.skip)).toBe(true);
      expect(parts.map((p) => p.text).join('')).toBe(st[i]!.note);
    }
    const first = noteParts(st[0]!.note!, st[0]!.houseText, true);
    expect(
      first
        .filter((p) => !p.skip)
        .map((p) => p.text)
        .join(''),
    ).toBe('开局 3 个村民：去吃羊；城镇中心立即排村民。');
  });
  it('每个开局含造房动作的步骤都有 houseText，且是 note 的子串', () => {
    for (const b of buildOrders)
      b.steps.forEach((s) => {
        if (s.actions.some((a) => a.type === 'build' && a.building === HOUSE)) expect(s.houseText?.length, `${b.id}`).toBeGreaterThan(0);
        for (const f of s.houseText ?? []) expect(s.note).toContain(f);
      });
  });
  it('对比行文案', () => {
    expect(noHouseCompareText({ earlierSec: 20.8, startWoodDelta: -100, woodNet: 0 }, '封建')).toBe(
      '比通用：到达封建 早 0:20 · 木头按净值省 0（起始少 100 木）',
    );
    expect(noHouseCompareText({ earlierSec: 25.6, startWoodDelta: -100, woodNet: 100 }, '城堡')).toBe(
      '比通用：到达城堡 早 0:25 · 木头按净值省 100（起始少 100 木）',
    );
  });
});

describe('#42 houseText 精确片段（Steve 定稿）：划掉的片段与剩下的句子', () => {
  const CASES: [string, number, string[], string][] = [
    ['archers-19', 0, ['2 人合盖一座房子、1 人盖另一座，盖完都'], '开局 3 个村民：去吃羊；城镇中心立即排村民。'],
    ['archers-19', 1, ['盖房的'], ' 3 人与前 3 个新村民在城镇中心下吃羊（共 6 人）。'],
    ['archers-19', 4, ['盖房子后'], '第 11 个到浆果建磨坊；羊找齐后用侦察骑兵推鹿。'],
    ['archers-19', 8, ['房子和'], '再调 1 人盖兵营、2 人建金矿营地采金；研究双刃斧，暂不研究马轭。'],
    ['drush-fc', 0, ['2 人合盖一座房子、1 人盖另一座，盖完都'], '开局 3 个村民：去吃羊；城镇中心立即排村民。'],
    ['drush-fc', 1, ['盖房的'], ' 3 人与前 3 个新村民在城镇中心下吃羊（共 6 人）。'],
    ['drush-fc', 4, ['盖 2 座房子后'], '第 12 个在前方盖兵营，之后持续用木栅栏筑墙。'],
    [
      'drush-fc',
      8,
      ['其中伐木村民顺手盖 2 座房子（人口上限约 35，够 27 村民 + 侦察 + 3 民兵）；'],
      '4 个加到原伐木场；尽早研究织布机，防对手封建侦察骑兵偷村民。',
    ],
    ['fast-castle-boom', 0, ['2 人合盖一座房子、1 人盖另一座，盖完都'], '开局 3 个村民：去吃羊；城镇中心立即排村民。'],
    ['fast-castle-boom', 1, ['盖房的'], ' 3 人与前 3 个新村民在城镇中心下吃羊（共 6 人）。'],
    ['fast-castle-boom', 4, ['盖房子，再'], '第 11 个到浆果旁建磨坊；侦察骑兵推 3 头鹿到城镇中心。'],
    ['fast-castle-boom', 6, ['；其中一人先盖一座房子（人口上限约 25），避免卡在约 20'], '4 个去浆果。'],
    ['fast-castle-boom', 8, ['；顺手再盖一座房子（人口上限约 30，够 25 村民 + 侦察）'], '4 个去伐木，仍用同一个伐木场。'],
    ['feudal-drush-18', 0, ['2 人合盖一座房子、1 人盖另一座，盖完都'], '开局 3 个村民：去吃羊；城镇中心立即排村民。'],
    ['feudal-drush-18', 1, ['盖房的'], ' 3 人与前 3 个新村民在城镇中心下吃羊（共 6 人）。'],
    ['feudal-drush-18', 4, ['盖房子后'], '第 11 个回来吃肉；羊都找到后用侦察骑兵推鹿。'],
    ['feudal-drush-18', 6, ['，再盖房子'], '第 16 个到基地前方盖兵营。'],
    ['maa-archers-18', 0, ['2 人合盖一座房子、1 人盖另一座，盖完都'], '开局 3 个村民：去吃羊；城镇中心立即排村民。'],
    ['maa-archers-18', 1, ['盖房的'], ' 3 人与前 3 个新村民在城镇中心下吃羊（共 6 人）。'],
    ['maa-archers-18', 2, ['；房子顺势摆成墙的一部分'], '3 个去伐木并建伐木场。'],
    ['maa-archers-18', 5, ['和前方房子'], '1 人盖兵营，2 人吃肉；找齐羊、侦察对手，研究织布机后点封建。'],
    ['scouts-18', 0, ['2 人合盖一座房子、1 人盖另一座，盖完都'], '开局 3 个村民：去吃羊；城镇中心立即排村民。'],
    ['scouts-18', 1, ['盖房的'], ' 3 人与前 3 个新村民在城镇中心下吃羊（共 6 人）。'],
    ['scouts-18', 4, ['先盖房子，再'], '第 10 个到浆果旁建磨坊并采浆果。'],
  ];
  it.each(CASES)('%s 第 %i 步（下标）', (id, i, struck, rest) => {
    const s = bo(id).steps[i]!;
    const parts = noteParts(s.note!, s.houseText, true);
    expect(parts.filter((p) => p.skip).map((p) => p.text)).toEqual(struck);
    expect(
      parts
        .filter((p) => !p.skip)
        .map((p) => p.text)
        .join(''),
    ).toBe(rest);
  });
  it('覆盖所有带 houseText 的步骤', () => {
    expect(buildOrders.flatMap((b) => b.steps.filter((s) => s.houseText?.length))).toHaveLength(CASES.length);
  });
});
