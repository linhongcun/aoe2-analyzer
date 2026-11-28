import { describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { ARMY_RES, evaluateArmyCost } from '../../src/domain/armyCost';
import { calculateProduction, decodeProduction } from '../../src/domain/production';
import { decodeArmyCost } from '../../src/features/production/armyCostCodec';

type TargetCiv = 'Mongols' | 'Huns' | 'Tatars' | 'Khitans';

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => byCiv(civ).routes.find((entry) => entry.id === id)!;

const PRODUCTION_CASES: readonly (readonly [TargetCiv, string, string, number, boolean, boolean])[] = [
  ['Mongols', 'mongols-mangudai-steppe-siege', '持续生产 · 精锐蒙古突骑（城堡 2 座）＋翼骑兵（马厩 4 座）· 57 名村民（含征招）', 57, true, false],
  ['Mongols', 'mongols-hca-zero-castle', '持续生产 · 零城堡 重装骑射手（靶场 4 座）＋精锐草原枪兵（马厩 4 座）· 78 名村民（无征招）', 78, false, true],
  ['Mongols', 'mongols-hca-zero-castle', '持续生产 · 补城后 重装骑射手（靶场 4 座）＋精锐草原枪兵（马厩 4 座）· 103 名村民（含征招）', 103, true, false],
  ['Huns', 'huns-paladin-hca', '持续生产 · 游侠（马厩 3 座）＋重装骑射手（靶场 4 座）· 80 名村民（含征招）', 80, true, false],
  ['Huns', 'huns-hussar-hca', '持续生产 · 零城堡 翼骑兵（马厩 4 座）＋重装骑射手（靶场 4 座）· 50 名村民（无征招无掠夺者）', 50, false, true],
  ['Huns', 'huns-hussar-hca', '持续生产 · 补城后 翼骑兵（马厩 4 座）＋重装骑射手（靶场 4 座）· 66 名村民（含征招）', 66, true, false],
  ['Tatars', 'tatars-keshik-hca-trebuchet', '持续生产 · 精锐怯薛骑兵（城堡 2 座）＋重装骑射手（靶场 4 座）· 79 名村民（含征招）', 79, true, false],
  ['Tatars', 'tatars-steppe-hca-zero-castle', '持续生产 · 零城堡 精锐草原枪兵（马厩 4 座）＋重装骑射手（靶场 4 座）· 78 名村民（无征招）', 78, false, true],
  ['Tatars', 'tatars-steppe-hca-zero-castle', '持续生产 · 补城后 精锐草原枪兵（马厩 4 座）＋重装骑射手（靶场 4 座）· 103 名村民（含征招）', 103, true, false],
  [
    'Khitans',
    'khitans-steppe-mounted-trebuchet',
    '持续生产 · 精锐草原枪兵（马厩 4 座）＋骆驼投石机（攻城武器厂 1 座）· 83 名村民（含征招，按农田未计牧场）',
    83,
    true,
    false,
  ],
  [
    'Khitans',
    'khitans-steppe-mounted-trebuchet',
    '持续生产 · 零城堡 精锐草原枪兵（马厩 4 座）＋骆驼投石机（攻城武器厂 1 座）· 67 名村民（无征招，按农田未计牧场）',
    67,
    false,
    true,
  ],
  [
    'Khitans',
    'khitans-liaodao-rocket-cart',
    '持续生产 · 精锐辽刀兵（城堡 2 座）＋重型火箭推车（攻城武器厂 1 座）· 59 名村民（含征招，按农田未计牧场）',
    59,
    true,
    false,
  ],
];

type ArmyCase = readonly [
  civ: TargetCiv,
  routeId: string,
  label: string,
  cost: readonly [Food: number, Wood: number, Gold: number, Stone: number],
  sum: number,
  zeroCastle: boolean,
  hasMountedArcher: boolean,
];

const ARMY_COST_CASES: readonly ArmyCase[] = [
  [
    'Mongols',
    'mongols-mangudai-steppe-siege',
    '研究账本 · 精锐蒙古突骑＋翼骑兵＋操练重型冲车（未选弹道学 93，不含抗招降，合计 11215）',
    [6545, 1350, 3320, 0],
    11215,
    false,
    true,
  ],
  [
    'Mongols',
    'mongols-hca-zero-castle',
    '研究账本 · 零城堡 重装骑射手＋精锐草原枪兵＋重型冲车（不含操练 6 与弹道学 93，合计 9740）',
    [6295, 850, 2595, 0],
    9740,
    true,
    true,
  ],
  [
    'Mongols',
    'mongols-hca-zero-castle',
    '研究账本 · 补城加操练 重装骑射手＋精锐草原枪兵＋操练重冲（未选弹道学 93，合计 10690）',
    [6295, 1350, 3045, 0],
    10690,
    false,
    true,
  ],
  ['Huns', 'huns-paladin-hca', '研究账本 · 游侠＋重装骑射手（未选弹道学 93，不含抗招降，合计 9390）', [5845, 250, 3295, 0], 9390, true, true],
  ['Huns', 'huns-hussar-hca', '研究账本 · 翼骑兵＋重装骑射手（未选弹道学 93，不含抗招降，合计 8040）', [4895, 250, 2895, 0], 8040, true, true],
  [
    'Tatars',
    'tatars-keshik-hca-trebuchet',
    '研究账本 · 精锐怯薛＋重装骑射手＋巨投＋丝护甲＋帖木儿（免费扳指帕提亚，未选弹道学 93，合计 10240）',
    [5195, 1500, 3545, 0],
    10240,
    false,
    true,
  ],
  [
    'Tatars',
    'tatars-steppe-hca-zero-castle',
    '研究账本 · 零城堡 精锐草原枪兵＋重装骑射手＋重型冲车（无丝护甲与弹道学 93，合计 9790）',
    [6395, 600, 2795, 0],
    9790,
    true,
    true,
  ],
  [
    'Tatars',
    'tatars-steppe-hca-zero-castle',
    '研究账本 · 补城档 精锐草原枪兵＋重装骑射手＋巨投＋丝护甲＋帖木儿（未选弹道学 93，合计 10090）',
    [5095, 1500, 3495, 0],
    10090,
    false,
    true,
  ],
  [
    'Khitans',
    'khitans-steppe-mounted-trebuchet',
    '研究账本 · 精锐草原枪兵＋骆驼投石机基础净额（不含斡鲁朵目录价 900，合计 4490）',
    [2670, 600, 1220, 0],
    4490,
    true,
    false,
  ],
  [
    'Khitans',
    'khitans-steppe-mounted-trebuchet',
    '研究账本 · 城堡半价重装骑射手单线（形态升级 450 食物 250 黄金，未选弹道学 93，合计 2250）',
    [1450, 250, 550, 0],
    2250,
    true,
    true,
  ],
  [
    'Khitans',
    'khitans-liaodao-rocket-cart',
    '研究账本 · 精锐辽刀兵＋重型火箭推车基础净额（不含札甲与抗招降，合计 5490）',
    [2445, 1400, 1645, 0],
    5490,
    true,
    false,
  ],
  [
    'Khitans',
    'khitans-liaodao-rocket-cart',
    '研究账本 · 精锐辽刀兵＋重型火箭推车＋札甲 1006（不含抗招降，合法计入合计 6240）',
    [2895, 1400, 1945, 0],
    6240,
    false,
    false,
  ],
  [
    'Khitans',
    'khitans-liaodao-rocket-cart',
    '研究账本 · 城堡半价重装骑射手单线（形态升级 450 食物 250 黄金，未选弹道学 93，合计 2250）',
    [1450, 250, 550, 0],
    2250,
    true,
    true,
  ],
];

describe('Issue 1439 草原骑射四国持续生产与研究账本领域回归', () => {
  it('全部 12 条持续生产与 13 条研究账本链接解码、零城堡不含城堡科技、契丹牧场告警与 1006/1007 边界全通过', async () => {
    const [core, trees] = await Promise.all([loadCore(), loadTrees()]);

    expect(PRODUCTION_CASES).toHaveLength(12);
    for (const [civ, routeId, label, expectedVils, expect315, zeroCastle] of PRODUCTION_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing ${label}`).toBeDefined();
      const [hashPath, query = ''] = new URL(link!.href).hash.split('?');
      expect(hashPath, label).toBe('#/production');
      const decoded = decodeProduction(`?${query}`);
      expect(decoded.errors, label).toEqual([]);
      expect(decoded.config.civ, label).toBe(civ);
      expect(decoded.config.techs.includes(315), `${label} Conscription 315`).toBe(expect315);
      if (zeroCastle) {
        for (const tid of decoded.config.techs) {
          expect(core.techById[tid]?.b, `${label} zero castle excludes castle tech ${tid}`).not.toBe(82);
        }
        expect(decoded.config.techs, `${label} zero castle excludes 483`).not.toContain(483);
      }
      const res = calculateProduction({ core, trees }, decoded.config);
      expect(res.errors, label).toEqual([]);
      expect(res.total, label).toBe(expectedVils);
      if (civ === 'Khitans') {
        expect(
          res.warnings.some((w) => w.includes('牧场取代农田')),
          `${label} pasture warning`,
        ).toBe(true);
      }
    }

    expect(ARMY_COST_CASES).toHaveLength(13);
    for (const [civ, routeId, label, [Food, Wood, Gold, Stone], expectedSum, zeroCastle, hasMountedArcher] of ARMY_COST_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing ${label}`).toBeDefined();
      const [hashPath, query = ''] = new URL(link!.href).hash.split('?');
      expect(hashPath, label).toBe('#/production');
      const decoded = decodeArmyCost(`?${query}`);
      expect(decoded.errors, label).toEqual([]);
      expect(decoded.dataChanged, label).toBe(false);
      expect(decoded.config, label).not.toBeNull();
      expect(decoded.config!.civ, label).toBe(civ);

      for (const excluded of ['t:315', 't:45', 't:46', 't:439', 't:101', 't:102', 't:103']) {
        expect(decoded.config!.targets, `${label} excludes ${excluded}`).not.toContain(excluded);
      }
      if (zeroCastle) {
        for (const target of decoded.config!.targets) {
          const tid = Number(target.slice(2));
          expect(core.techById[tid]?.b, `${label} zero castle excludes castle tech ${tid}`).not.toBe(82);
        }
      }

      const evaluated = evaluateArmyCost({ core, trees }, decoded.config!);
      expect(evaluated.blocked, label).toEqual([]);
      expect(evaluated.partial, label).toBe(false);
      const actual = {
        Food: evaluated.researchTotal.Food ?? 0,
        Wood: evaluated.researchTotal.Wood ?? 0,
        Gold: evaluated.researchTotal.Gold ?? 0,
        Stone: evaluated.researchTotal.Stone ?? 0,
      };
      expect(actual, label).toEqual({ Food, Wood, Gold, Stone });
      expect(
        ARMY_RES.reduce((acc, r) => acc + (actual[r] ?? 0), 0),
        label,
      ).toBe(expectedSum);

      if (hasMountedArcher) {
        expect(decoded.config!.targets, `${label} excludes Ballistics 93`).not.toContain('t:93');
        const withBallistics = evaluateArmyCost({ core, trees }, { ...decoded.config!, targets: [...decoded.config!.targets, 't:93'] });
        expect(withBallistics.partial, `${label} +93`).toBe(false);
        expect((withBallistics.researchTotal.Wood ?? 0) - Wood, `${label} +93 Wood`).toBe(300);
        expect((withBallistics.researchTotal.Gold ?? 0) - Gold, `${label} +93 Gold`).toBe(175);
      }

      if (civ === 'Tatars') {
        expect(evaluated.ledger.find((e) => e.id === 437)?.status, `${label} free Thumb Ring`).toBe('free');
        expect(evaluated.ledger.find((e) => e.id === 436)?.status, `${label} free Parthian Tactics`).toBe('free');
      }
      if (label.includes('札甲 1006')) {
        expect(evaluated.ledger.find((e) => e.id === 1006)).toMatchObject({ status: 'planned', cost: { Food: 450, Gold: 300 } });
      }
    }

    // 反事实核验：契丹 1007 斡鲁朵骑兵在现行引擎仍报 invalid/partial（须旁注目录价 600 食 300 金，不写入 actargets）
    const khiMainLink = route('Khitans', 'khitans-steppe-mounted-trebuchet').evidence.links!.find((l) => l.label.includes('4490'))!;
    const khiMainCfg = decodeArmyCost(`?${new URL(khiMainLink.href).hash.split('?')[1]}`).config!;
    const withOrdo = evaluateArmyCost({ core, trees }, { ...khiMainCfg, targets: [...khiMainCfg.targets, 't:1007'] });
    expect(withOrdo.partial).toBe(true);
    expect(withOrdo.ledger.find((e) => e.id === 1007)?.status).toBe('invalid');
  });
});
