/** Imported by the continuously registered simulator.test.ts entry. */
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { analyzeChampi, champiPresets, isChampiUnit, type ChampiCandidate, type ChampiContext } from '../../src/domain/champiCounters';
import { duel, fighterFrom } from '../../src/domain/duel';
import { parseSide, type SideSpec } from '../../src/domain/duelState';
import { duelCivs } from '../../src/domain/matchupRoute';
import { makeSimContext, presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import { unitAvailable, techAvailable } from '../../src/domain/unitAvailability';
import { unitAvailable as oldUnitAvailable, techAvailable as oldTechAvailable } from '../../src/features/matchup/availability';

let data: ChampiContext;
beforeAll(async () => {
  data = { core: await loadCore(), trees: await loadTrees() };
});
const copy = () => structuredClone(data);
const ready = (source = data, me = 'Franks', opp = 'Muisca') => {
  const value = analyzeChampi(source, me, opp, 188329);
  expect(value.state).toBe('ready');
  if (value.state !== 'ready') throw new Error('Expected current-data comparison: ' + JSON.stringify(value));
  return value;
};
const ok = (row: ChampiCandidate): Extract<ChampiCandidate, { state: 'ok' }> => {
  expect(row.state).toBe('ok');
  if (row.state !== 'ok') throw new Error(row.reason);
  return row;
};
/** Independent invocation of the existing engine, without using new model helpers. */
function engine(source: ChampiContext, civ: string, id: number, age: number) {
  const unit = source.core.unitById[id]!;
  const sim = makeSimContext(source.core.techs, source.trees);
  const selected = presetUpTo(simTechs(sim, unit, civ), age);
  const stats = simulate(sim, unit, civ, age, selected, new Set());
  return { stats, selected: [...selected].sort((a, b) => a - b), fighter: fighterFrom(unit, stats) };
}
const NO_SIDE: SideSpec = { uid: 0, civ: '', age: 4, techs: [], team: [] };

describe('#657 蔷琵有限同代接触对照', () => {
  it('真实三时代与有限候选固定，全部结果由原引擎独立重算', () => {
    const analysis = ready();
    expect(analysis.cards.map((card) => [card.age, card.champiUnitId, card.candidates.map((row) => row.unitId)])).toEqual([
      [2, 2588, [75, 448, 4]],
      [3, 2552, [38, 77, 24]],
      [4, 2554, [567, 5, 546]],
    ]);
    for (const card of analysis.cards) {
      for (const raw of card.candidates) {
        const row = ok(raw);
        const a = engine(data, 'Franks', row.unitId, card.age);
        const b = engine(data, 'Muisca', card.champiUnitId, card.age);
        expect(row.a.stats).toEqual(a.stats);
        expect(row.b.stats).toEqual(b.stats);
        expect(row.a.techIds).toEqual(a.selected);
        expect(row.b.techIds).toEqual(b.selected);
        expect(row.result).toEqual(duel(a.fighter, b.fighter));
        expect(row.a.spec).toMatchObject({ uid: row.unitId, civ: 'Franks', age: card.age, techs: 'c', team: [] });
        expect(row.b.spec).toMatchObject({ uid: card.champiUnitId, civ: 'Muisca', age: card.age, techs: 'c', team: [] });
        expect(unitAvailable(data, row.a.civ, row.a.unit.id, card.age)).toBe(true);
        expect(unitAvailable(data, row.b.civ, row.b.unit.id, card.age)).toBe(true);
        for (const side of [row.a, row.b]) {
          expect(side.techIds.every((id) => data.core.techById[id]!.age <= card.age)).toBe(true);
          expect(side.techIds.every((id) => techAvailable(data, side.civ, id, card.age))).toBe(true);
        }
      }
    }
  });
  it('主项取固定顺序首个真win，保留长剑draw与远程/轻骑loss', () => {
    const cards = ready().cards;
    expect(cards.map((card) => card.main?.unitId)).toEqual([75, 38, 567]);
    expect(ok(cards[1]!.candidates[1]!).candidateOutcome).toBe('draw');
    for (const row of [cards[0]!.candidates[2]!, cards[2]!.candidates[1]!, cards[2]!.candidates[2]!]) expect(ok(row).candidateOutcome).toBe('loss');
    for (const card of cards) expect(card.main).toBe(card.candidates.find((row) => row.state === 'ok' && row.candidateOutcome === 'win'));
  });
  it('移除获胜候选后，使用首个可算项但不制造优势', () => {
    const c = copy();
    for (const id of [75, 448]) c.trees.t.Franks!.flatMap((block) => block[3]).find((cell) => cell[2] === 'u' && cell[3] === id)![4] = 0;
    const feudal = ready(c).cards[0]!;
    expect(feudal.candidates[0]).toMatchObject({ state: 'unavailable', unitId: 75, civ: 'Franks' });
    expect(feudal.candidates[0]).not.toHaveProperty('pkPath');
    expect(feudal.candidates[1]).toMatchObject({ state: 'unavailable', unitId: 448, civ: 'Franks' });
    expect(feudal.main?.unitId).toBe(4);
    expect(feudal.main?.candidateOutcome).toBe('loss');
  });
  it('实际文明没有帝王候选时保留卡与三个具体不可用项', () => {
    const imperial = ready(data, 'Muisca', 'Muisca').cards[2]!;
    expect(imperial.main).toBeNull();
    expect(imperial.reason).toContain('不代表没有其他应对');
    expect(imperial.candidates.map((row) => row.state)).toEqual(['unavailable', 'unavailable', 'unavailable']);
    for (const row of imperial.candidates) expect(row).not.toHaveProperty('pkPath');
  });
  it.each([
    ['Franks', 'Muisca', 'b', 'a'],
    ['Muisca', 'Franks', 'a', 'b'],
    ['Muisca', 'Incas', 'b', 'a'],
  ] as const)('双方%s/%s动态链接永远A=me/B=opp，敌方含线优先', (me, opp, champiSide, candidateSide) => {
    const analysis = ready(data, me, opp);
    expect(analysis).toMatchObject({ me, opp, champiSide, candidateSide });
    for (const card of analysis.cards) {
      expect(card.champiCiv).toBe(champiSide === 'a' ? me : opp);
      for (const raw of card.candidates) {
        if (raw.state !== 'ok') continue;
        const params = new URLSearchParams(raw.pkPath.split('?')[1]);
        expect(duelCivs(params)).toEqual({ me, opp });
        expect(parseSide(params.get('a'), NO_SIDE)).toMatchObject({ civ: me, age: card.age, techs: 'c', team: [] });
        expect(parseSide(params.get('b'), NO_SIDE)).toMatchObject({ civ: opp, age: card.age, techs: 'c', team: [] });
        expect(params.get('m')).toBe('1');
        expect(raw.candidateOutcome).toBe(raw.result.winner === 'draw' ? 'draw' : raw.result.winner === candidateSide ? 'win' : 'loss');
      }
    }
  });
  it('两条native参考保持Muisca/Franks身份、封建真实弓手和城堡同时击杀', () => {
    const presets = champiPresets(data, 188329);
    expect(presets.map(({ key, age }) => [key, age])).toEqual([
      ['feudal', 2],
      ['castle', 3],
    ]);
    for (const preset of presets) {
      const row = ok(preset.result);
      const params = new URLSearchParams(row.pkPath.split('?')[1]);
      expect(duelCivs(params)).toEqual({ me: 'Muisca', opp: 'Franks' });
      const a = engine(data, row.a.civ, row.a.unit.id, preset.age);
      const b = engine(data, row.b.civ, row.b.unit.id, preset.age);
      expect(row.result).toEqual(duel(a.fighter, b.fighter));
      expect(row.a.spec.techs).toBe('c');
      expect(row.b.spec.team).toEqual([]);
    }
    expect(ok(presets[0]!.result).pkPath).toBe('/duel?a=2588.Muisca.2.c.&b=4.Franks.2.c.&m=1');
    expect(ok(presets[1]!.result).pkPath).toBe('/duel?a=2552.Muisca.3.c.&b=77.Franks.3.c.&m=1');
    expect(ok(presets[1]!.result).candidateOutcome).toBe('draw');
    expect(ok(presets[1]!.result).result.winner).toBe('draw');
  });
  it('双方无蔷琵线隐藏；非法/未知双方不补默认文明', () => {
    expect(analyzeChampi(data, 'Franks', 'Britons', 188329)).toEqual({ state: 'hidden' });
    for (const [me, opp] of [
      ['', 'Muisca'],
      ['Franks', 'unknown'],
      ['unknown', 'Muisca'],
    ]) {
      const result = analyzeChampi(data, me!, opp!, 188329);
      expect(result.state).toBe('unverified');
      expect(JSON.stringify(result)).not.toContain('/duel?');
    }
    expect([2550, 2588, 2552, 2554].every(isChampiUnit)).toBe(true);
    expect(isChampiUnit(492)).toBe(false);
  });

  it.each([undefined, null, {}, 185872, 188330, '188329', NaN])('build=%s安全停止新结果与两个参考链接', (build) => {
    expect(analyzeChampi(data, 'Franks', 'Muisca', build).state).toBe('unverified');
    for (const preset of champiPresets(data, build)) {
      expect(preset.result.state).toBe('unverified');
      expect(preset.result).not.toHaveProperty('pkPath');
    }
  });
  it.each([
    ['id', (c: ChampiContext): unknown => (c.core.unitById[2552]!.id = 2554)],
    ['age', (c: ChampiContext): unknown => (c.core.unitById[2588]!.age = 3)],
    ['from', (c: ChampiContext): unknown => (c.core.unitById[2554]!.from_ = 2550)],
    ['building', (c: ChampiContext): unknown => (c.core.unitById[2550]!.b = 87)],
    ['type', (c: ChampiContext): unknown => (c.core.unitById[2588]!.type = 'UniqueUnit')],
  ] as const)('四形态%s变形须整体unverified，不经旧PK自动升时代/fallback', (_name, change) => {
    const c = copy();
    change(c);
    const result = analyzeChampi(c, 'Franks', 'Muisca', 188329);
    expect(result.state).toBe('unverified');
    expect(JSON.stringify(result)).not.toContain('/duel?');
  });
  it.each([
    ['atks缺失', (u: Record<string, unknown>): unknown => delete u.atks],
    ['atks坏tuple', (u: Record<string, unknown>): unknown => (u.atks = [null])],
    ['缺主攻击', (u: Record<string, unknown>): unknown => (u.atks = [['步兵', 3]])],
    ['armc非数组', (u: Record<string, unknown>): unknown => (u.armc = null)],
    ['armc坏tuple', (u: Record<string, unknown>): unknown => (u.armc = [[null, 0]])],
    ['cls非数组', (u: Record<string, unknown>): unknown => (u.cls = null)],
    ['cls坏元素', (u: Record<string, unknown>): unknown => (u.cls = ['步兵'])],
    ['civs非数组', (u: Record<string, unknown>): unknown => (u.civs = null)],
    ['hp零', (u: Record<string, unknown>): unknown => (u.hp = 0)],
    ['spd零', (u: Record<string, unknown>): unknown => (u.spd = 0)],
    ['rof零', (u: Record<string, unknown>): unknown => (u.rof = 0)],
    ['atkNaN', (u: Record<string, unknown>): unknown => (u.atk = NaN)],
    ['rngNaN', (u: Record<string, unknown>): unknown => (u.rng = NaN)],
    ['accInfinity', (u: Record<string, unknown>): unknown => (u.acc = Infinity)],
    ['id错误', (u: Record<string, unknown>): unknown => (u.id = 492)],
  ] as const)('候选%s只阻断该项，无假0/URL，其余项仍可计算', (_name, change) => {
    const c = copy();
    change(c.core.unitById[75] as unknown as Record<string, unknown>);
    const card = ready(c).cards[0]!;
    expect(card.candidates[0]!.state).toBe('unverified');
    expect(card.candidates[0]).not.toHaveProperty('pkPath');
    expect(card.candidates[0]).not.toHaveProperty('result');
    expect(card.candidates.slice(1).every((row) => row.state === 'ok')).toBe(true);
    expect(card.main).not.toBeNull();
  });
  it('零命中率造成非有限次数时不可算，合法负附加伤害仍能计算', () => {
    const c = copy();
    c.core.unitById[4]!.acc = 0;
    const row = ready(c).cards[0]!.candidates[2]!;
    expect(row.state).toBe('unverified');
    expect(row).not.toHaveProperty('pkPath');
    expect(data.core.unitById[448]!.atks).toContainEqual(['村民', -3]);
    expect(ready().cards[0]!.candidates[1]!.state).toBe('ok');
  });
  it.each([
    ['blocks', (c: ChampiContext): unknown => ((c.trees.t as unknown as Record<string, unknown>).Franks = null)],
    ['block', (c: ChampiContext): unknown => ((c.trees.t.Franks as unknown[])[0] = null)],
    ['cell', (c: ChampiContext): unknown => ((c.trees.t.Franks![0]![3] as unknown[])[0] = null)],
    ['status', (c: ChampiContext): unknown => (c.trees.t.Franks![0]![3][0]![4] = 2)],
    ['techmeta', (c: ChampiContext): unknown => (c.core.techs[0]!.age = NaN)],
    ['techidentity', (c: ChampiContext): unknown => (c.core.techs[0]!.id = 999999)],
  ] as const)('坏%s来源在读取数组和模拟前安全停止', (_name, change) => {
    const c = copy();
    change(c);
    expect(analyzeChampi(c, 'Franks', 'Muisca', 188329).state).toBe('unverified');
  });
  it('有效同源生命/护甲/攻击周期变化真实重算，不固定观察数值或胜者', () => {
    const c = copy();
    c.core.unitById[75]!.hp *= 2;
    c.core.unitById[75]!.ma += 2;
    c.core.unitById[75]!.rof *= 0.8;
    const row = ok(ready(c).cards[0]!.candidates[0]!);
    const a = engine(c, 'Franks', 75, 2);
    const b = engine(c, 'Muisca', 2588, 2);
    expect(row.result).toEqual(duel(a.fighter, b.fighter));
    expect(row.result).not.toEqual(ok(ready().cards[0]!.candidates[0]!).result);
  });
  it('移动速度传播到真实属性，但不宣称接触模型会因此追上', () => {
    const c = copy();
    c.core.unitById[2552]!.spd *= 2;
    const changed = ok(ready(c).cards[1]!.candidates[0]!);
    const base = ok(ready().cards[1]!.candidates[0]!);
    expect(changed.b.stats.spd).toBeCloseTo(base.b.stats.spd * 2);
    expect(changed.result).toEqual(base.result);
  });
  it('调用纯净、重复输入确定；无关说明文字不改变计算', () => {
    const c = copy();
    const before = JSON.stringify(c);
    const first = ready(c);
    expect(ready(c)).toEqual(first);
    expect(JSON.stringify(c)).toBe(before);
    c.core.unitById[2552]!.desc = '无关说明变更';
    const changed = ok(ready(c).cards[1]!.candidates[0]!);
    expect(changed.result).toEqual(ok(first.cards[1]!.candidates[0]!).result);
    expect(changed.b.stats).toEqual(ok(first.cards[1]!.candidates[0]!).b.stats);
  });
});

describe('#657 中立可用性提取保持旧入口和EARLY规则', () => {
  it('feature重导出同一函数，不改变原消费者调用位置', () => {
    expect(oldUnitAvailable).toBe(unitAvailable);
    expect(oldTechAvailable).toBe(techAvailable);
  });
  it.each([
    ['Armenians', 75, 1, true],
    ['Armenians', 77, 2, true],
    ['Britons', 77, 2, false],
    ['Bohemians', 5, 3, true],
    ['Cumans', 1258, 2, true],
    ['Franks', 24, 2, false],
  ] as const)('%s/%s在时代%s保持既有可用性=%s', (civ, id, age, expected) => {
    expect(unitAvailable(data, civ, id, age)).toBe(expected);
  });
  it('单位/科技同数字ID不混淆，目录有文明但树禁用仍不可用', () => {
    expect(unitAvailable(data, 'Incas', 74, 2)).toBe(false);
    expect(techAvailable(data, 'Incas', 74, 2)).toBe(true);
    const c = copy();
    c.trees.t.Franks!.flatMap((block) => block[3]).find((cell) => cell[2] === 'u' && cell[3] === 4)![4] = 0;
    expect(c.core.unitById[4]!.civs).toContain('Franks');
    expect(unitAvailable(c, 'Franks', 4, 2)).toBe(false);
  });
});
