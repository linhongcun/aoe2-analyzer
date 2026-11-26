import { describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { ARMY_RES, evaluateArmyCost } from '../../src/domain/armyCost';
import { calculateConstruction, decodeConstruction } from '../../src/domain/construction';
import { calculateGeneralGarrison, type GarrisonEntry } from '../../src/domain/garrisonGeneral';
import { calculateProduction, decodeProduction } from '../../src/domain/production';
import { decodeArmyCost } from '../../src/features/production/armyCostCodec';

type TargetCiv = 'Muisca' | 'Spanish' | 'Japanese' | 'Bulgarians' | 'Tupi';
type AntiKind = 'full' | 'no-heresy' | 'no-faith';

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => byCiv(civ).routes.find((entry) => entry.id === id)!;

const GARRISON_CASES: readonly (readonly [TargetCiv, string, string, number, readonly number[], number, number])[] = [
  ['Bulgarians', 'bulgarians-krepost-konnik', '满科技驻军 · 营垒 20 名精锐保加利亚骑兵 5/21 箭', 1251, [47, 199, 200, 201, 437], 5, 21],
  ['Bulgarians', 'bulgarians-stirrups-cav-hca-siege', '满科技驻军 · 营垒 19 名重装骑射手 21/21 箭', 1251, [47, 199, 200, 201, 437], 21, 21],
];

const CONSTRUCTION_CASES: readonly (readonly [TargetCiv, string, string, number, number])[] = [
  ['Spanish', 'conquistador-hussar', '施工工期 · 8 名村民 建城堡 46.2 秒', 8, 46.15],
  ['Spanish', 'conquistador-hussar', '施工工期 · 4 名村民 建大型箭塔 30.8 秒', 4, 30.77],
  ['Spanish', 'conquistador-hussar', '施工工期 · 4 名村民 建炮塔 30.8 秒', 4, 30.77],
];

const PRODUCTION_CASES: readonly (readonly [TargetCiv, string, string, number, boolean])[] = [
  ['Muisca', 'muisca-temple-guard-slinger', '持续生产 · 精锐神庙护卫（兵营 3 座）＋投石手（靶场 4 座）· 89 名村民（含征招）', 89, true],
  ['Muisca', 'muisca-arbalester-temple-champi', '持续生产 · 零城堡 精锐神庙护卫（兵营 3 座）＋劲弩手（靶场 4 座）· 55 名村民（无征招）', 55, false],
  ['Muisca', 'muisca-arbalester-temple-champi', '持续生产 · 精锐神庙护卫（兵营 3 座）＋劲弩手（靶场 4 座）· 72 名村民（含征招）', 72, true],
  ['Muisca', 'muisca-arbalester-temple-champi', '持续生产 · 零城堡 精锐蔷琵战士（兵营 3 座）＋劲弩手（靶场 4 座）· 47 名村民（无征招）', 47, false],
  ['Muisca', 'muisca-arbalester-temple-champi', '持续生产 · 精锐蔷琵战士（兵营 3 座）＋劲弩手（靶场 4 座）· 61 名村民（含征招）', 61, true],
  ['Muisca', 'muisca-arbalester-skirmisher', '持续生产 · 零城堡 劲弩手（靶场 4 座）＋精锐掷矛手（靶场 4 座）· 46 名村民（无征招）', 46, false],
  ['Muisca', 'muisca-arbalester-skirmisher', '持续生产 · 劲弩手（靶场 4 座）＋精锐掷矛手（靶场 4 座）· 61 名村民（含征招）', 61, true],
  ['Spanish', 'conquistador-hussar', '持续生产 · 翼骑兵（马厩 4 座）＋精锐西班牙征服者（城堡 2 座）· 63 名村民', 63, true],
  ['Spanish', 'paladin-skirmisher', '持续生产 · 游侠（马厩 3 座）＋精锐掷矛手（靶场 3 座）· 65 名村民', 65, true],
  ['Spanish', 'handcannon-halberdier', '持续生产 · 长戟兵（兵营 4 座）＋火枪手（靶场 4 座）· 64 名村民', 64, true],
  ['Spanish', 'spanish-hmc-hussar', '持续生产 · 翼骑兵（马厩 4 座）＋重装骑马弩兵（靶场 5 座）· 85 名村民（含征招）', 85, true],
  ['Spanish', 'spanish-hmc-hussar', '持续生产 · 零城堡 翼骑兵（马厩 4 座）＋重装骑马弩兵（靶场 5 座）· 64 名村民（无征招）', 64, false],
  ['Japanese', 'japanese-samurai-light-cavalry', '持续生产 · 精锐日本武士（城堡 2 座）＋轻型骑兵（马厩 4 座）· 76 名村民', 76, true],
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '持续生产 · 长戟兵（兵营 4 座）＋重装骑射手（靶场 4 座）· 68 名村民', 68, true],
  ['Bulgarians', 'bulgarians-krepost-konnik', '持续生产 · 精锐保加利亚骑兵（营垒 3 座）· 71 名村民', 71, true],
  ['Bulgarians', 'bulgarians-stirrups-cav-hca-siege', '持续生产 · 翼骑兵（马厩 4 座）＋重装骑射手（靶场 4 座）· 69 名村民', 69, true],
  ['Bulgarians', 'bulgarians-stirrups-cav-hca-siege', '持续生产 · 重装骑士（马厩 3 座）＋重装骑射手（靶场 3 座）· 70 名村民', 70, true],
  ['Bulgarians', 'bulgarians-bagains-ths-siege', '持续生产 · 双手剑士（兵营 4 座）＋重型冲车（攻城武器厂 1 座）· 53 名村民（含征招）', 53, true],
  ['Bulgarians', 'bulgarians-bagains-ths-siege', '持续生产 · 双手剑士（兵营 4 座）＋重型冲车（攻城武器厂 1 座）· 43 名村民（无征招）', 43, false],
  ['Tupi', 'tupi-blackwood-halberdier', '持续生产 · 精锐黑檀木步弓手（城堡 2 座）＋长戟兵（兵营 3 座）· 57 名村民', 57, true],
  ['Tupi', 'tupi-champi-slinger', '持续生产 · 精锐蔷琵战士（兵营 3 座）＋投石手（靶场 3 座）· 54 名村民', 54, true],
];

type ArmyCase = readonly [TargetCiv, string, string, readonly [number, number, number, number], number, AntiKind, boolean];

const ARMY_COST_CASES: readonly ArmyCase[] = [
  ['Muisca', 'muisca-temple-guard-slinger', '研究账本 · 精锐神庙护卫＋投石手（不含抗招降，合计 6265）', [3020, 1000, 2245, 0], 6265, 'full', false],
  ['Muisca', 'muisca-arbalester-temple-champi', '研究账本 · 精锐神庙护卫＋劲弩手无草药学（不含抗招降，合计 6540）', [3645, 550, 2345, 0], 6540, 'full', false],
  ['Muisca', 'muisca-arbalester-temple-champi', '研究账本 · 精锐神庙护卫＋劲弩手含草药学（不含抗招降，合计 7190）', [3945, 550, 2695, 0], 7190, 'full', true],
  ['Muisca', 'muisca-arbalester-temple-champi', '研究账本 · 精锐蔷琵战士＋劲弩手无草药学（不含抗招降，合计 6965）', [4035, 550, 2380, 0], 6965, 'full', false],
  ['Muisca', 'muisca-arbalester-temple-champi', '研究账本 · 精锐蔷琵战士＋劲弩手含草药学（不含抗招降，合计 7615）', [4335, 550, 2730, 0], 7615, 'full', true],
  [
    'Muisca',
    'muisca-arbalester-skirmisher',
    '研究账本 · 零城堡 劲弩手＋精锐掷矛手无草药学（不含抗招降，合计 4310）',
    [2075, 780, 1455, 0],
    4310,
    'full',
    false,
  ],
  ['Muisca', 'muisca-arbalester-skirmisher', '研究账本 · 劲弩手＋精锐掷矛手含草药学（不含抗招降，合计 4960）', [2375, 780, 1805, 0], 4960, 'full', true],
  ['Spanish', 'conquistador-hussar', '研究账本 · 精锐西班牙征服者＋翼骑兵（不含抗招降，合计 5095）', [3745, 0, 1350, 0], 5095, 'full', false],
  ['Spanish', 'paladin-skirmisher', '研究账本 · 游侠＋精锐掷矛手（不含抗招降，合计 7430）', [4995, 780, 1655, 0], 7430, 'full', false],
  ['Spanish', 'handcannon-halberdier', '研究账本 · 火枪手＋长戟兵（不含抗招降，合计 3595）', [2680, 0, 915, 0], 3595, 'full', false],
  ['Spanish', 'spanish-hmc-hussar', '研究账本 · 重装骑马弩兵＋翼骑兵（不含抗招降，合计 7370）', [5045, 550, 1775, 0], 7370, 'full', false],
  [
    'Japanese',
    'japanese-samurai-light-cavalry',
    '研究账本 · 精锐日本武士＋轻型骑兵纯野战（不含抗招降，合计 4590）',
    [3020, 0, 1570, 0],
    4590,
    'no-heresy',
    false,
  ],
  [
    'Japanese',
    'japanese-samurai-light-cavalry',
    '研究账本 · 精锐日本武士＋轻型骑兵＋巨型投石机（不含抗招降，合计 7040）',
    [3820, 1150, 2070, 0],
    7040,
    'no-heresy',
    false,
  ],
  [
    'Japanese',
    'japanese-halberdier-hca-trebuchet',
    '研究账本 · 长戟兵＋重装骑射手纯野战（不含抗招降，合计 8815）',
    [4980, 550, 3285, 0],
    8815,
    'no-heresy',
    false,
  ],
  [
    'Japanese',
    'japanese-halberdier-hca-trebuchet',
    '研究账本 · 长戟兵＋重装骑射手＋巨型投石机（不含抗招降，合计 10765）',
    [5480, 1700, 3585, 0],
    10765,
    'no-heresy',
    false,
  ],
  ['Bulgarians', 'bulgarians-krepost-konnik', '研究账本 · 营垒精锐保加利亚骑兵（不含抗招降，合计 4142.5）', [2397.5, 0, 1745, 0], 4142.5, 'no-faith', false],
  [
    'Bulgarians',
    'bulgarians-stirrups-cav-hca-siege',
    '研究账本 · 马镫翼骑兵＋重装骑射手（不含抗招降，合计 7992.5）',
    [4172.5, 550, 3270, 0],
    7992.5,
    'no-faith',
    false,
  ],
  [
    'Bulgarians',
    'bulgarians-stirrups-cav-hca-siege',
    '研究账本 · 马镫重装骑士＋重装骑射手（不含抗招降，合计 7292.5）',
    [3822.5, 550, 2920, 0],
    7292.5,
    'no-faith',
    false,
  ],
  [
    'Bulgarians',
    'bulgarians-bagains-ths-siege',
    '研究账本 · 协议双手剑士＋重型冲车（不含抗招降，合计 4667.5）',
    [2897.5, 600, 1170, 0],
    4667.5,
    'no-faith',
    false,
  ],
  [
    'Bulgarians',
    'bulgarians-bagains-ths-siege',
    '研究账本 · 协议双手剑士＋重型投石车（不含抗招降，合计 7142.5）',
    [3672.5, 600, 2870, 0],
    7142.5,
    'no-faith',
    false,
  ],
  ['Tupi', 'tupi-blackwood-halberdier', '研究账本 · 精锐黑檀木步弓手＋长戟兵（不含抗招降，合计 7547.5）', [3937.5, 300, 3310, 0], 7547.5, 'full', false],
  ['Tupi', 'tupi-blackwood-halberdier', '研究账本 · 精锐伊比拉贝玛战士单线（不含抗招降，合计 2552.5）', [1557.5, 0, 995, 0], 2552.5, 'full', false],
  ['Tupi', 'tupi-blackwood-halberdier', '研究账本 · 过渡劲弩手单线（不含抗招降，合计 4837.5）', [2362.5, 300, 2175, 0], 4837.5, 'full', false],
  ['Tupi', 'tupi-champi-slinger', '研究账本 · 精锐蔷琵战士＋投石手（不含抗招降，合计 6007.5）', [3302.5, 300, 2405, 0], 6007.5, 'full', false],
];

describe('#1401 第一档批 2 五国驻军、施工、持续生产、研究账本与穆伊斯卡两轴复算', () => {
  it('全部 2 条营垒驻军、3 条西班牙施工、21 条持续生产（含零城堡无征招）与 24 条研究账本及穆伊斯卡两轴复算 100% 一致', async () => {
    const core = await loadCore();
    const trees = await loadTrees();

    expect(core.techById[315]?.b).toBe(82);
    expect(core.techById[1365]?.b).toBe(82);
    expect(core.unitById[2584]?.b).toBe(12);

    expect(GARRISON_CASES).toHaveLength(2);
    for (const [civ, routeId, label, bid, expectedTechs, totalProj, maxProj] of GARRISON_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing ${label}`).toBeDefined();
      const [hashPath, query = ''] = new URL(link!.href).hash.split('?');
      expect(hashPath, label).toBe(`#/building/${bid}`);
      const params = new URLSearchParams(query);
      expect([params.get('tab'), params.get('gv'), params.get('civ'), params.get('age')], label).toEqual(['garrison', '2', civ, '4']);
      const techs = (params.get('gtechs') ?? '')
        .split(',')
        .filter(Boolean)
        .map(Number)
        .sort((a, b) => a - b);
      expect(techs, label).not.toContain(233);
      expect(techs, label).not.toContain(685);
      expect(techs, label).toEqual([...expectedTechs].sort((a, b) => a - b));
      const rows = (params.get('army') ?? '')
        .split(',')
        .filter(Boolean)
        .map((part) => {
          const [u, c, mode] = part.split(':');
          const entry: GarrisonEntry = mode === 'd' ? 'deposit' : mode === 'c' ? 'created' : 'enter';
          return { unitId: Number(u), count: c!, entry };
        });
      const res = calculateGeneralGarrison({ core, trees }, core.buildingById[bid]!, { civ, age: 4, techs, rows });
      expect(res.errors, label).toEqual([]);
      expect([res.totalProjectiles, res.maxProjectiles], label).toEqual([totalProj, maxProj]);
    }

    expect(CONSTRUCTION_CASES).toHaveLength(3);
    for (const [civ, routeId, label, expectedBuilders, expectedSeconds] of CONSTRUCTION_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing ${label}`).toBeDefined();
      const [hashPath, query = ''] = new URL(link!.href).hash.split('?');
      expect(hashPath, label).toBe('#/construction');
      const decoded = decodeConstruction(`?${query}`, { core, trees });
      expect(decoded.errors, label).toEqual([]);
      expect(decoded.config.civ, label).toBe(civ);
      const res = calculateConstruction({ core, trees }, decoded.config);
      expect(res.errors, label).toEqual([]);
      expect(res.target?.builders, label).toBe(expectedBuilders);
      expect(Number(res.target?.seconds.toFixed(2)), label).toBe(expectedSeconds);
    }

    expect(PRODUCTION_CASES).toHaveLength(21);
    for (const [civ, routeId, label, expectedVils, expect315] of PRODUCTION_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing ${label}`).toBeDefined();
      const [hashPath, query = ''] = new URL(link!.href).hash.split('?');
      expect(hashPath, label).toBe('#/production');
      const decoded = decodeProduction(`?${query}`);
      expect(decoded.errors, label).toEqual([]);
      expect(decoded.config.civ, label).toBe(civ);
      expect(decoded.config.techs.includes(315), `${label} Conscription 315`).toBe(expect315);
      if (label.includes('零城堡')) {
        expect(decoded.config.techs, `${label} zero castle excludes 1365`).not.toContain(1365);
        expect(decoded.config.techs, `${label} zero castle excludes 1366`).not.toContain(1366);
      }
      const res = calculateProduction({ core, trees }, decoded.config);
      expect(res.errors, label).toEqual([]);
      expect(res.total, label).toBe(expectedVils);
    }

    expect(ARMY_COST_CASES).toHaveLength(24);
    for (const [civ, routeId, label, [Food, Wood, Gold, Stone], expectedSum, antiKind, expectHerbalism] of ARMY_COST_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing ${label}`).toBeDefined();
      const [hashPath, query = ''] = new URL(link!.href).hash.split('?');
      expect(hashPath, label).toBe('#/production');
      const decoded = decodeArmyCost(`?${query}`);
      expect(decoded.errors, label).toEqual([]);
      expect(decoded.dataChanged, label).toBe(false);
      expect(decoded.config, label).not.toBeNull();
      expect(decoded.config!.civ, label).toBe(civ);
      expect(decoded.config!.targets.includes('t:1365'), `${label} herbalism 1365`).toBe(expectHerbalism);
      for (const excluded of ['t:315', 't:45', 't:46', 't:439', 't:101', 't:102', 't:103']) {
        expect(decoded.config!.targets, `${label} must exclude ${excluded}`).not.toContain(excluded);
      }
      const evaluated = evaluateArmyCost({ core, trees }, decoded.config!);
      expect(evaluated.blocked, label).toEqual([]);
      expect(evaluated.partial, label).toBe(false);
      expect(
        {
          Food: evaluated.researchTotal.Food ?? 0,
          Wood: evaluated.researchTotal.Wood ?? 0,
          Gold: evaluated.researchTotal.Gold ?? 0,
          Stone: evaluated.researchTotal.Stone ?? 0,
        },
        label,
      ).toEqual({ Food, Wood, Gold, Stone });
      const actualSum = ARMY_RES.reduce((sum, res) => sum + (evaluated.researchTotal[res] ?? 0), 0);
      expect(actualSum, label).toBe(expectedSum);

      const legalAnti = antiKind === 'full' ? ['t:46', 't:439', 't:45'] : antiKind === 'no-heresy' ? ['t:46', 't:45'] : ['t:46', 't:439'];
      const expectedDelta = antiKind === 'full' ? 2600 : antiKind === 'no-heresy' ? 1600 : 1300;
      const withAnti = evaluateArmyCost({ core, trees }, { ...decoded.config!, targets: [...decoded.config!.targets, ...legalAnti] });
      expect([withAnti.blocked, withAnti.partial], `${label} with anti-conversion`).toEqual([[], false]);
      const antiSum = ARMY_RES.reduce((sum, res) => sum + (withAnti.researchTotal[res] ?? 0), 0);
      expect(antiSum - actualSum, `${label} anti-conversion delta`).toBe(expectedDelta);
      if (antiKind === 'no-heresy' || antiKind === 'no-faith') {
        const forcedAll = evaluateArmyCost({ core, trees }, { ...decoded.config!, targets: [...decoded.config!.targets, 't:46', 't:439', 't:45'] });
        expect(forcedAll.partial, `${label} forced unavailable anti-conversion tech must mark partial`).toBe(true);
      }
    }

    // 穆伊斯卡两轴明确验算：草药学 1365 切分三对研究账本（+650），征招 315 强加入任一账本触发 invalid + partial=true
    const muiscaPairs: readonly [string, string, string, number, number][] = [
      [
        'muisca-arbalester-skirmisher',
        '研究账本 · 零城堡 劲弩手＋精锐掷矛手无草药学（不含抗招降，合计 4310）',
        '研究账本 · 劲弩手＋精锐掷矛手含草药学（不含抗招降，合计 4960）',
        4310,
        4960,
      ],
      [
        'muisca-arbalester-temple-champi',
        '研究账本 · 精锐神庙护卫＋劲弩手无草药学（不含抗招降，合计 6540）',
        '研究账本 · 精锐神庙护卫＋劲弩手含草药学（不含抗招降，合计 7190）',
        6540,
        7190,
      ],
      [
        'muisca-arbalester-temple-champi',
        '研究账本 · 精锐蔷琵战士＋劲弩手无草药学（不含抗招降，合计 6965）',
        '研究账本 · 精锐蔷琵战士＋劲弩手含草药学（不含抗招降，合计 7615）',
        6965,
        7615,
      ],
    ];
    for (const [routeId, baseLabel, herbLabel, baseSum, herbSum] of muiscaPairs) {
      const baseLink = route('Muisca', routeId).evidence.links!.find((item) => item.label === baseLabel)!;
      const herbLink = route('Muisca', routeId).evidence.links!.find((item) => item.label === herbLabel)!;
      const baseCfg = decodeArmyCost(`?${new URL(baseLink.href).hash.split('?')[1] ?? ''}`).config!;
      const herbCfg = decodeArmyCost(`?${new URL(herbLink.href).hash.split('?')[1] ?? ''}`).config!;
      expect(baseCfg.targets).not.toContain('t:1365');
      expect(herbCfg.targets).toContain('t:1365');
      expect(herbSum - baseSum).toBe(650);
      for (const cfg of [baseCfg, herbCfg]) {
        const forced315 = evaluateArmyCost({ core, trees }, { ...cfg, targets: [...cfg.targets, 't:315'] });
        expect(forced315.partial, `${routeId} forcing t:315 must set partial=true`).toBe(true);
        expect(
          forced315.ledger.some((entry) => entry.key === 't:315' && entry.status === 'invalid'),
          `${routeId} forcing t:315 must flag invalid`,
        ).toBe(true);
      }
    }
  });
});
