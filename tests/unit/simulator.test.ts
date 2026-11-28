import { describe, expect, it } from 'vitest';
import { damageSources } from '../../src/domain/damageBreakdown';
import { duel, fighterFrom } from '../../src/domain/duel';
import { TEAM_BONUSES } from '../../src/domain/effects';
import { allNumeric, parseUnitPath, presetUpTo, simTechs, simulate, totalCost, unitPath, type SimStep } from '../../src/domain/simulator';
import { ctx, unit, units } from './helpers';

const full = (en: string, civ: string, team = new Set<number>()) => {
  const u = unit(en);
  return simulate(ctx, u, civ, 4, allNumeric(simTechs(ctx, u, civ)), team);
};
const unitById = (id: number) => units.find((u) => u.id === id)!;

describe('simulator', () => {
  it('Franks Paladin full tech = 192 HP / 18 atk / 5-7 armor', () => {
    const s = full('Paladin', 'Franks');
    expect(s.hp).toBe(192);
    expect(s.atk).toBe(18);
    expect(s.ma).toBe(5);
    expect(s.pa).toBe(7);
  });
  it('Britons Arbalester full tech: range 5+3+2+1(Yeomen)=11, atk 6+3+1=10, armor 3/4', () => {
    const s = full('Arbalester', 'Britons');
    expect(s.rng).toBe(11);
    expect(s.atk).toBe(10);
    expect(s.ma).toBe(3);
    expect(s.pa).toBe(4);
    expect(s.acc).toBe(90); // Britons 无拇指环
  });
  it('no techs selected = base stats (+ age civ bonus)', () => {
    const u = unit('Paladin');
    const s = simulate(ctx, u, 'Britons', 4, new Set(), new Set());
    expect([s.hp, s.atk, s.ma, s.pa]).toEqual([u.hp, u.atk, u.ma, u.pa]);
  });
  it('team bonus toggle (Franks: knight line LOS +2)', () => {
    const u = unit('Paladin');
    const i = TEAM_BONUSES.findIndex((x) => x[0] === 'Franks');
    expect(simulate(ctx, u, 'Britons', 4, new Set(), new Set([i])).los).toBe(u.los + 2);
  });
  it('cost totals', () => {
    const u = unit('Paladin'),
      av = simTechs(ctx, u, 'Franks');
    const { cost, time } = totalCost(av, allNumeric(av));
    expect(cost.Food).toBeGreaterThan(0);
    expect(time).toBeGreaterThan(0);
  });
  it('URL round-trip', () => {
    const p = unitPath(569, 'Franks', 4, [1, 2], [0]);
    expect(parseUnitPath(p)).toEqual({ id: 569, civ: 'Franks', age: 4, ids: [1, 2], team: [0] });
    expect(parseUnitPath('unit/569')).toEqual({ id: 569, civ: undefined, age: undefined, ids: [], team: [] });
  });
});

describe('#1517 方案 B1：逐时代自动升级先于同代常驻文明加成与科技乘数', () => {
  it('瞿折罗骆驼斥候（1755）封建/城堡/帝王满科技额外伤害、畜牧移速、对库曼 448 PK 与 trace 顺序', () => {
    const camelScout = unitById(1755);
    const avail = simTechs(ctx, camelScout, 'Gurjaras');
    const feudal = simulate(ctx, camelScout, 'Gurjaras', 2, presetUpTo(avail, 2, 'Gurjaras'), new Set());
    const castle = simulate(ctx, camelScout, 'Gurjaras', 3, presetUpTo(avail, 3, 'Gurjaras'), new Set());
    const impSel = allNumeric(avail);
    const imp = simulate(ctx, camelScout, 'Gurjaras', 4, impSel, new Set());

    expect(feudal.bonus['骑兵']).toBeCloseTo(4.8, 6);
    expect(feudal.bonus['船只']).toBeCloseTo(2.4, 6);
    expect(feudal.bonus['骆驼']).toBeCloseTo(2.4, 6);
    expect(feudal.spd).toBeCloseTo(1.45, 6);

    expect(castle.bonus['骑兵']).toBeCloseTo(5.328, 6);
    expect(castle.bonus['船只']).toBeCloseTo(2.664, 6);
    expect(castle.bonus['骆驼']).toBeCloseTo(2.664, 6);
    expect(castle.spd).toBeCloseTo(1.595, 6);
    expect(castle.spd.toFixed(2)).toBe('1.59');

    expect(imp.bonus['骑兵']).toBeCloseTo(5.5944, 6);
    expect(imp.bonus['船只']).toBeCloseTo(2.7972, 6);
    expect(imp.bonus['骆驼']).toBeCloseTo(2.7972, 6);
    expect(imp.spd).toBeCloseTo(1.595, 6);
    expect(imp.spd.toFixed(2)).toBe('1.59');

    // 帝王 1v1 PK 库曼斥候骑兵（448）：单击 9.5944，7 刀击杀
    const scout = unitById(448);
    const cumanScout = simulate(ctx, scout, 'Cumans', 4, allNumeric(simTechs(ctx, scout, 'Cumans')), new Set());
    const r = duel(fighterFrom(camelScout, imp), fighterFrom(scout, cumanScout));
    expect(r.ab.dmg).toBeCloseTo(9.5944, 6);
    expect(r.ab.hits).toBe(7);
    expect(r.winner).toBe('a');

    // trace 与 damageSources 顺序：时代自动规则位于瞿折罗 3 档乘数之前，且零空步、零重复步
    const rawSteps: SimStep[] = [];
    simulate(ctx, camelScout, 'Gurjaras', 4, impSel, new Set(), (step) => rawSteps.push(step));
    expect(rawSteps.filter((s) => s.source === '时代与单位特殊规则')).toHaveLength(1);
    const autoIdx = rawSteps.findIndex((s) => s.source === '时代与单位特殊规则');
    const civBonusIndices = rawSteps.flatMap((s, i) => (s.source.startsWith('文明加成：') ? [i] : []));
    expect(autoIdx).toBe(0);
    expect(civBonusIndices).toEqual([1, 2, 3]);

    const ds = damageSources(ctx, camelScout, 'Gurjaras', 4, impSel, new Set());
    expect(ds.sources[0]?.source).toBe('时代与单位特殊规则');
    expect(ds.sources[0]?.changes.find((c) => c.stat === '对骑兵加成')).toEqual({ stat: '对骑兵加成', before: 0, after: 4 });
    expect(ds.sources.slice(1, 4).map((s) => s.changes.find((c) => c.stat === '对骑兵加成')?.after)).toEqual([
      expect.closeTo(4.8, 6),
      expect.closeTo(5.328, 6),
      expect.closeTo(5.5944, 6),
    ]);
    expect(ds.sources.every((s) => s.changes.length > 0)).toBe(true);
    expect(ds.sources.filter((s) => s.source === '时代与单位特殊规则')).toHaveLength(1);
  });

  it('全站 50 国斥候骑兵（448）移速校准：47 国畜牧 1.705(1.70)、库曼三时代 1.6275/1.708875/1.79431875、条顿/维京 1.55', () => {
    const scout = unitById(448);
    expect(scout.civs).toHaveLength(50);

    const husbandryCivs: string[] = [];
    const noHusbandryNonCuman: string[] = [];
    for (const civ of scout.civs) {
      const avail = simTechs(ctx, scout, civ);
      const hasHusbandry = avail.some((x) => x.t.id === 39);
      if (civ === 'Cumans') {
        expect(hasHusbandry).toBe(false);
        const f = simulate(ctx, scout, 'Cumans', 2, presetUpTo(avail, 2, 'Cumans'), new Set());
        const c = simulate(ctx, scout, 'Cumans', 3, presetUpTo(avail, 3, 'Cumans'), new Set());
        const i = simulate(ctx, scout, 'Cumans', 4, allNumeric(avail), new Set());
        expect(f.spd).toBeCloseTo(1.6275, 8);
        expect(c.spd).toBeCloseTo(1.708875, 8);
        expect(i.spd).toBeCloseTo(1.79431875, 8);
        expect([f.spd.toFixed(2), c.spd.toFixed(2), i.spd.toFixed(2)]).toEqual(['1.63', '1.71', '1.79']);
      } else if (hasHusbandry) {
        husbandryCivs.push(civ);
        const c = simulate(ctx, scout, civ, 3, presetUpTo(avail, 3, civ), new Set());
        const i = simulate(ctx, scout, civ, 4, allNumeric(avail), new Set());
        expect(c.spd, `${civ} castle spd`).toBeCloseTo(1.705, 8);
        expect(i.spd, `${civ} imp spd`).toBeCloseTo(1.705, 8);
        expect(i.spd.toFixed(2), `${civ} imp toFixed(2)`).toBe('1.70');
      } else {
        noHusbandryNonCuman.push(civ);
        const i = simulate(ctx, scout, civ, 4, allNumeric(avail), new Set());
        expect(i.spd, `${civ} baseline spd`).toBeCloseTo(1.55, 8);
        expect(i.spd.toFixed(2), `${civ} baseline toFixed(2)`).toBe('1.55');
      }
    }
    expect(husbandryCivs).toHaveLength(47);
    expect(noHusbandryNonCuman.sort()).toEqual(['Teutons', 'Vikings']);
  });

  it('反例 1（防方案 A 逆年代序）：萨拉森运输船（545）城堡/帝王 S.gar 保持 5 / 15，不畸变为 10 / 30', () => {
    const transport = unitById(545);
    expect(simulate(ctx, transport, 'Saracens', 3, new Set(), new Set()).gar).toBe(5);
    expect(simulate(ctx, transport, 'Saracens', 4, new Set(), new Set()).gar).toBe(15);
  });

  it('反例 2（防方案 C 混入 simTechs）：蒙古 5 单位与魏 3 单位帝王满科技血量不变，萨拉森/法兰克/维京血统叠加不变', () => {
    const expectedHp: [string, number, number][] = [
      ['Mongols', 448, 78.536],
      ['Mongols', 546, 98.048],
      ['Mongols', 441, 117.56],
      ['Mongols', 1370, 98.048],
      ['Mongols', 1372, 124.064],
      ['Wei', 1952, 59.528],
      ['Wei', 1944, 97.99976],
      ['Wei', 1946, 136.99964],
      ['Saracens', 329, 145],
      ['Saracens', 330, 170],
      ['Franks', 38, 120],
      ['Franks', 283, 144],
      ['Franks', 569, 192],
      ['Vikings', 567, 84],
    ];
    for (const [civ, uid, hp] of expectedHp) {
      const u = unitById(uid);
      const s = simulate(ctx, u, civ, 4, allNumeric(simTechs(ctx, u, civ)), new Set());
      expect(s.hp, `${civ}/${uid}`).toBeCloseTo(hp, 5);
    }
  });
});

// Current-build #657 cases stay in every existing simulator consumer profile.
import './champi657Cases';
import './coreTrees657Cases';
