import { beforeAll, describe, expect, it } from 'vitest';
import ecoRaw from '../../data/game/eco.json';
import { loadCore, loadTrees, type Core } from '../../src/data';
import { simulateBuilding } from '../../src/domain/buildingSim';
import { DAT } from '../../src/domain/datEffects';
import { fighterFrom } from '../../src/domain/duel';
import { GENERIC_FX, genericFx, matchingGenericFx } from '../../src/domain/effects';
import { calculateGarrisonHealing, DEFAULT_HEALING_CONFIG, maxHealingHp } from '../../src/domain/garrisonHealing';
import { calculateProduction, DEFAULT_PRODUCTION, type ProductionConfig, type ProductionContext } from '../../src/domain/production';
import { makeSimContext, simulate, type SimContext } from '../../src/domain/simulator';
import type { Trees } from '../../src/domain/types';
import { unitAgeChanges } from '../../src/domain/unitAgeChanges';
import { wallAgeChange } from '../../src/features/buildings/components/WallAgeChanges';

let core: Core;
let trees: Trees;
let simCtx: SimContext;
let prodCtx: ProductionContext;

const eco = ecoRaw as unknown as {
  units: Record<string, { trainTime: number; timeAt?: Record<string, number>; cost: Record<string, number> }>;
  civEco: Record<string, { tech?: number; effects: { attr?: string; target?: string; v?: number }[] }[]>;
};

beforeAll(async () => {
  core = await loadCore();
  trees = await loadTrees();
  simCtx = makeSimContext(core.techs, trees);
  prodCtx = { core, trees };
});

const sim = (unitId: number, civ: string, age: number, sel: number[] = []) => simulate(simCtx, core.unitById[unitId]!, civ, age, new Set(sel), new Set());

const prod = (overrides: Partial<ProductionConfig>) =>
  calculateProduction(prodCtx, {
    ...DEFAULT_PRODUCTION,
    techs: [],
    ...overrides,
  });

describe('#1324 升时代自动效果（斥候线、萨金特卫兵、鹰斥候）', () => {
  it('斥候线四个单位（448/546/441/1707）在黑暗/封建/城堡/帝王视野逐时代 +2', () => {
    const scout = core.unitById[448]!;
    expect(scout.los).toBe(4);
    expect([1, 2, 3, 4].map((age) => sim(448, 'Armenians', age).los)).toEqual([4, 6, 8, 10]);
    // 科技 20 的攻击与移速只在封建起生效一次，城堡/帝王不重复叠加
    expect([1, 2, 3, 4].map((age) => sim(448, 'Armenians', age).atk)).toEqual([3, 5, 5, 5]);
    expect([1, 2, 3, 4].map((age) => Number(sim(448, 'Armenians', age).spd.toFixed(3)))).toEqual([1.2, 1.55, 1.55, 1.55]);

    for (const [uid, civ] of [
      [546, 'Armenians'],
      [441, 'Franks'],
      [1707, 'Poles'],
    ] as const) {
      const base = core.unitById[uid]!.los;
      expect(base).toBe(4);
      expect([1, 2, 3, 4].map((age) => sim(uid, civ, age).los)).toEqual([4, 6, 8, 10]);
    }
  });

  it('西西里两版萨金特卫兵（1658/1660）进城堡自动获得 75/8/4/2，仅 1660 训练时间由 16s 变为 12s', () => {
    const castleDark = sim(1658, 'Sicilians', 2);
    expect([castleDark.hp, castleDark.atk, castleDark.ma, castleDark.pa, castleDark.bt]).toEqual([50, 5, 2, 1, 12]);
    const castleAge = sim(1658, 'Sicilians', 3);
    expect([castleAge.hp, castleAge.atk, castleAge.ma, castleAge.pa, castleAge.bt]).toEqual([75, 8, 4, 2, 12]);
    const castleImp = sim(1658, 'Sicilians', 4);
    expect([castleImp.hp, castleImp.atk, castleImp.ma, castleImp.pa, castleImp.bt]).toEqual([75, 8, 4, 2, 12]);

    const donjonFeudal = sim(1660, 'Sicilians', 2);
    expect([donjonFeudal.hp, donjonFeudal.atk, donjonFeudal.ma, donjonFeudal.pa, donjonFeudal.bt]).toEqual([50, 5, 2, 1, 16]);
    const donjonCastle = sim(1660, 'Sicilians', 3);
    expect([donjonCastle.hp, donjonCastle.atk, donjonCastle.ma, donjonCastle.pa, donjonCastle.bt]).toEqual([75, 8, 4, 2, 12]);
    const donjonImp = sim(1660, 'Sicilians', 4);
    expect([donjonImp.hp, donjonImp.atk, donjonImp.ma, donjonImp.pa, donjonImp.bt]).toEqual([75, 8, 4, 2, 12]);

    // PK 与驻军回血自动经 simulate 同步到 75 HP
    const f = fighterFrom(core.unitById[1658]!, castleAge);
    expect(f.hp).toBe(75);
    expect(f.attack['近战']).toBe(8);
    expect(f.armor['近战']).toBe(4);
    expect(f.armor['穿刺']).toBe(2);

    const healCtx = { core, trees };
    expect(maxHealingHp(healCtx, { ...DEFAULT_HEALING_CONFIG, civ: 'Sicilians', age: 2, unitId: 1660, techs: [] })).toBe(50);
    expect(maxHealingHp(healCtx, { ...DEFAULT_HEALING_CONFIG, civ: 'Sicilians', age: 3, unitId: 1660, techs: [] })).toBe(75);
    expect(maxHealingHp(healCtx, { ...DEFAULT_HEALING_CONFIG, civ: 'Sicilians', age: 3, unitId: 1658, techs: [] })).toBe(75);
    const heal = calculateGarrisonHealing(healCtx, {
      ...DEFAULT_HEALING_CONFIG,
      buildingId: 82,
      civ: 'Sicilians',
      age: 3,
      unitId: 1658,
      entry: 'enter',
      currentHp: '25',
      targetHp: '75',
      techs: [],
    });
    expect(heal.errors).toEqual([]);
    expect(heal.status).toBe('valid');
    expect(heal.maxHp).toBe(75);
  });

  it('鹰斥候（751）在玛雅/阿兹特克进城堡只应用一次科技 387；他文明与未传文明 fail-closed；升级形态不受影响', () => {
    const u751 = core.unitById[751]!;
    const baseBonus = Object.fromEntries(u751.atks.filter(([k]) => k !== '近战' && k !== '穿刺'));
    const aztecMul = eco.civEco.Aztecs!.flatMap((r) => r.effects).find((e) => e.attr === 'trainTime' && e.target === 'class:6')!.v!;

    for (const civ of ['Mayans', 'Aztecs'] as const) {
      const feudal = sim(751, civ, 2);
      const castle = sim(751, civ, 3);
      const imp = sim(751, civ, 4);

      expect(feudal.atk).toBe(4);
      expect(feudal.bonus['骑兵']).toBe(baseBonus['骑兵']);
      expect(feudal.bonus['船只']).toBe(baseBonus['船只']);
      expect(feudal.bonus['骆驼']).toBe(baseBonus['骆驼']);

      expect(castle.atk).toBe(7);
      expect(castle.bonus['骑兵']).toBe((baseBonus['骑兵'] ?? 0) + 2);
      expect(castle.bonus['船只']).toBe((baseBonus['船只'] ?? 0) + 1);
      expect(castle.bonus['骆驼']).toBe((baseBonus['骆驼'] ?? 0) + 1);
      const expectedBt = civ === 'Aztecs' ? 46 * aztecMul * 0.76 : 46 * 0.76;
      expect(castle.bt).toBeCloseTo(expectedBt, 5);

      // 帝王时代不再二次叠加
      expect(imp.atk).toBe(castle.atk);
      expect(imp.bonus).toEqual(castle.bonus);
      expect(imp.bt).toBeCloseTo(castle.bt, 6);
    }

    // 非鹰文明（含曾拥有鹰线的印加）及省略 civ 参数时 fail-closed 不触发 387
    for (const nonEagleCiv of ['Franks', 'Incas'] as const) {
      const s = sim(751, nonEagleCiv, 3);
      expect(s.atk).toBe(4);
      expect(s.bonus['骑兵']).toBe(baseBonus['骑兵']);
      expect(s.bt).toBeCloseTo(46, 5);
    }
    expect(matchingGenericFx(u751, false, 3, () => false).some((g) => g.tech === 387)).toBe(false);
    expect(genericFx(u751, false, 3, () => false).some((f) => f.s === 'bt')).toBe(false);
    expect(matchingGenericFx(u751, false, 3, () => false, 'Mayans').some((g) => g.tech === 387)).toBe(true);

    // 升级形态鹰勇士（753）与精锐鹰勇士（752）不受 387 影响
    expect(sim(753, 'Mayans', 3).atk).toBe(core.unitById[753]!.atk);
    expect(sim(753, 'Mayans', 3).bt).toBe(core.unitById[753]!.tt);
    expect(sim(752, 'Mayans', 4).atk).toBe(core.unitById[752]!.atk);
    expect(sim(752, 'Mayans', 4).bt).toBe(core.unitById[752]!.tt);
  });

  it('持续生产同步应用通用/限定文明自动训练时间（751 鹰斥候、1660 城楼萨金特、1699 弗拉芒民兵）', () => {
    const aztecMul = eco.civEco.Aztecs!.flatMap((r) => r.effects).find((e) => e.attr === 'trainTime' && e.target === 'class:6')!.v!;

    // 玛雅鹰斥候：封建 46s → 城堡 34.96s → 帝王 34.96s
    const mayanF = prod({ civ: 'Mayans', age: 2, rows: [{ unit: 751, building: 12, count: '1' }] });
    const mayanC = prod({ civ: 'Mayans', age: 3, rows: [{ unit: 751, building: 12, count: '1' }] });
    const mayanI = prod({ civ: 'Mayans', age: 4, rows: [{ unit: 751, building: 12, count: '1' }] });
    expect(mayanF.errors).toEqual([]);
    expect(mayanF.lines[0]!.seconds).toBeCloseTo(46, 6);
    expect(mayanF.lines[0]!.applied).not.toContain('城堡时代自动训练时间修正');
    expect(mayanC.errors).toEqual([]);
    expect(mayanC.lines[0]!.seconds).toBeCloseTo(34.96, 6);
    expect(mayanC.lines[0]!.applied).toContain('城堡时代自动训练时间修正');
    expect(mayanI.lines[0]!.seconds).toBeCloseTo(34.96, 6);

    // 阿兹特克鹰斥候：城堡叠乘文明步兵训练倍率与 387
    const aztecF = prod({ civ: 'Aztecs', age: 2, rows: [{ unit: 751, building: 12, count: '1' }] });
    const aztecC = prod({ civ: 'Aztecs', age: 3, rows: [{ unit: 751, building: 12, count: '1' }] });
    expect(aztecF.lines[0]!.seconds).toBeCloseTo(46 * aztecMul, 6);
    expect(aztecC.lines[0]!.seconds).toBeCloseTo(46 * aztecMul * 0.76, 6);
    expect(aztecC.lines[0]!.applied).toContain('城堡时代自动训练时间修正');

    // 升级形态鹰勇士（753）不受 387 训练时间修正
    const eagleWar = prod({ civ: 'Mayans', age: 3, rows: [{ unit: 753, building: 12, count: '1' }] });
    expect(eagleWar.errors).toEqual([]);
    expect(eagleWar.lines[0]!.seconds).toBeCloseTo(35, 6);
    expect(eagleWar.lines[0]!.applied).not.toContain('城堡时代自动训练时间修正');

    // 西西里城楼萨金特（1660）：封建 16s → 城堡 12s → 帝王 12s；城堡版（1658）维持 12s 且无修正注记
    const donjonF = prod({ civ: 'Sicilians', age: 2, rows: [{ unit: 1660, building: 1665, count: '1' }] });
    const donjonC = prod({ civ: 'Sicilians', age: 3, rows: [{ unit: 1660, building: 1665, count: '1' }] });
    const donjonI = prod({ civ: 'Sicilians', age: 4, rows: [{ unit: 1660, building: 1665, count: '1' }] });
    const castleC = prod({ civ: 'Sicilians', age: 3, rows: [{ unit: 1658, building: 82, count: '1' }] });
    expect(donjonF.errors).toEqual([]);
    expect(donjonF.lines[0]!.seconds).toBeCloseTo(16, 6);
    expect(donjonF.lines[0]!.applied).not.toContain('城堡时代自动训练时间修正');
    expect(donjonC.lines[0]!.seconds).toBeCloseTo(12, 6);
    expect(donjonC.lines[0]!.applied).toContain('城堡时代自动训练时间修正');
    expect(donjonI.lines[0]!.seconds).toBeCloseTo(12, 6);
    expect(castleC.errors).toEqual([]);
    expect(castleC.lines[0]!.seconds).toBeCloseTo(12, 6);
    expect(castleC.lines[0]!.applied).not.toContain('城堡时代自动训练时间修正');

    // 勃艮第弗拉芒民兵（1699）：经已有通用隐藏科技 774 自动 16 * 0.875 = 14s
    const flemish = prod({ civ: 'Burgundians', age: 4, techs: [755], rows: [{ unit: 1699, building: 12, count: '1' }] });
    expect(flemish.errors).toEqual([]);
    expect(flemish.lines[0]!.seconds).toBeCloseTo(14, 6);
    expect(flemish.lines[0]!.applied).toContain('城堡时代自动训练时间修正');
  });

  it('非法 bt 通用隐藏效果会被校验拦下、给出告警且不写入已应用注记', () => {
    GENERIC_FX.push({
      tech: -1324,
      name: 'Invalid generic bt',
      age: 3,
      req: [],
      civs: ['Franks'],
      pred: (x) => x.id === 83,
      fx: [{ s: 'bt', op: 'mul', v: 0 }],
      b: false,
    });
    try {
      const r = prod({ civ: 'Franks', age: 3, rows: [{ unit: 83, building: 109, count: '1' }] });
      expect(r.errors).toEqual([]);
      expect(r.lines[0]!.seconds).toBeCloseTo(eco.units['83']!.trainTime, 6);
      expect(r.lines[0]!.applied).not.toContain('城堡时代自动训练时间修正');
      expect(r.warnings.some((w) => w.includes('城堡时代自动训练时间修正') && w.includes('未计入'))).toBe(true);
    } finally {
      GENERIC_FX.pop();
    }
  });

  it('不回归详情页自动变化面板与建筑模拟（102/103 建筑命令不渗入 buildingSim）', () => {
    const scoutCard = unitAgeChanges(core.unitById[448]!, undefined, { generic: DAT.generic });
    expect(scoutCard?.state).toBe('ready');
    if (scoutCard?.state === 'ready') {
      expect(scoutCard.upgradeStages.map((s) => s.age)).toEqual([2, 3, 4]);
      const feudal = Object.fromEntries(scoutCard.upgradeStages[0]!.rows.map((r) => [r.key, r]));
      expect(feudal.atk?.before).toBe(3);
      expect(feudal.atk?.after).toBe(5);
      expect(feudal.los?.before).toBe(4);
      expect(feudal.los?.after).toBe(6);
      expect(feudal.spd?.before).toBeCloseTo(1.2, 5);
      expect(feudal.spd?.after).toBeCloseTo(1.55, 5);
      expect(scoutCard.upgradeStages[1]!.rows[0]?.after).toBe(8);
      expect(scoutCard.upgradeStages[2]!.rows[0]?.after).toBe(10);
    }
    const wall72 = wallAgeChange(core.buildingById[72]!, DAT.generic);
    const wall117 = wallAgeChange(core.buildingById[117]!, DAT.generic);
    expect(wall72?.state).toBe('ready');
    expect(wall117?.state).toBe('ready');
    if (wall72?.state === 'ready') expect(wall72.after).toBeCloseTo(250, 2);
    if (wall117?.state === 'ready') expect(wall117.after).toBeCloseTo(1800, 2);

    // 102/103 中的建筑命令（城楼 1665、哨所 598、瞭望塔 79、港口 1189）不进入 generic，不影响 simulateBuilding
    const donjon = core.buildingById[1665]!;
    expect(simulateBuilding(simCtx, donjon, 'Sicilians', 3, new Set()).hp).toBe(donjon.hp);
    expect(simulateBuilding(simCtx, donjon, 'Sicilians', 4, new Set()).hp).toBe(donjon.hp);
    const outpost = core.buildingById[598]!;
    expect(simulateBuilding(simCtx, outpost, 'Franks', 3, new Set()).los).toBe(outpost.los);
    expect(simulateBuilding(simCtx, outpost, 'Franks', 4, new Set()).los).toBe(outpost.los);
    const harbor = core.buildingById[1189]!;
    expect(simulateBuilding(simCtx, harbor, 'Malay', 4, new Set()).atk).toBe(harbor.atk);
  });
});
