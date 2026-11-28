import { describe, expect, it } from 'vitest';
import raw from '../../data/game/buildings.json';
import { civs } from '../../src/data';
import { buildingBase, buildingSimTechs, simulateBuilding } from '../../src/domain/buildingSim';
import { DAT } from '../../src/domain/datEffects';
import { matchingGenericFx } from '../../src/domain/effects';
import { formatHp } from '../../src/domain/hpFormat';
import { buildingType } from '../../src/domain/buildings';
import { applicableSimCostTechs, mergeSimCostTechs } from '../../src/domain/simEffectiveCost';
import { allNumeric, makeSimContext, presetUpTo, totalCost } from '../../src/domain/simulator';
import type { Building, Effect, Trees } from '../../src/domain/types';
import { ctx, tech, techs, trees } from './helpers';

const bs = (raw as unknown as Building[]).map((b) => ({ ...b, dlc: null, type: buildingType(b.en) }));
const B = (en: string) => bs.find((b) => b.en === en)!;
const full = (en: string, civ: string) => {
  const b = B(en);
  return simulateBuilding(ctx, b, civ, 4, allNumeric(buildingSimTechs(ctx, b, civ)));
};
const ids = (...n: string[]) => new Set(n.map((x) => tech(x).id));

describe('building simulator (values vs AoE2 Fandom Wiki)', () => {
  it('Castle + Masonry + Architecture + Hoardings 保留连乘小数，展示为 7027.68', () => {
    const hp = simulateBuilding(ctx, B('Castle'), 'Franks', 4, ids('Masonry', 'Architecture', 'Hoardings')).hp;
    expect(hp).toBeCloseTo(7027.68, 6);
    expect(formatHp(hp)).toBe('7027.68');
  });
  it('Byzantine Imperial Castle with Hoardings 保留连乘小数，展示为 8130.71', () => {
    const hp = simulateBuilding(ctx, B('Castle'), 'Byzantines', 4, ids('Hoardings')).hp;
    expect(hp).toBeCloseTo(8130.707818128878, 6);
    expect(formatHp(hp)).toBe('8130.71');
  });
  it('Britons Castle full tech: armor 10/13, +6 building armor, attack 15, range 11, no min range', () => {
    const s = full('Castle', 'Britons');
    expect(s.hp).toBeCloseTo(7027.68, 6);
    expect([s.ma, s.pa, s.barm]).toEqual([10, 13, 14]); // barm: 基础 8 + Masonry 3 + Architecture 3（.dat 类别 11）
    expect([s.atk, s.rng, s.minr]).toEqual([15, 11, 0]);
    expect(s.bonus['船只']).toBe(4);
  });
  it('Keep with Fletching + Bodkin + Bracer: range +3, attack +3 (+3 Arrowslits)', () => {
    const k = B('Keep'),
      civ = k.civs.find((c) => c === 'Britons') ?? k.civs[0]!;
    const s = simulateBuilding(ctx, k, civ, 4, ids('Fletching', 'Bodkin Arrow', 'Bracer'));
    expect(s.rng).toBe(k.rng + 3);
    expect(s.atk).toBe(k.atk + 3);
    expect(s.los).toBe(k.los + 3);
    const sa = simulateBuilding(ctx, k, civ, 4, ids('Arrowslits'));
    if (buildingSimTechs(ctx, k, civ).some((x) => x.t.en === 'Arrowslits')) expect(sa.atk).toBe(k.atk + 3);
  });
  it('Town Center: fletching line gives attack only, no range', () => {
    const tc = B('Town Center');
    const s = simulateBuilding(ctx, tc, 'Britons', 4, ids('Fletching', 'Bodkin Arrow', 'Bracer'));
    expect([s.atk, s.rng]).toEqual([tc.atk + 3, tc.rng]);
  });
  it('civ bonuses: Teutons TC garrison +10, Persians TC HP x2, Spanish build speed +30%', () => {
    expect(simulateBuilding(ctx, B('Town Center'), 'Teutons', 4, new Set()).gar).toBe(B('Town Center').gar + 10);
    expect(simulateBuilding(ctx, B('Town Center'), 'Persians', 4, new Set()).hp).toBe(4800);
    expect(simulateBuilding(ctx, B('House'), 'Spanish', 1, new Set()).bt).toBeCloseTo(B('House').bt / 1.3, 1);
  });
  it('techs only offered when the civ has them; line upgrades are text-only', () => {
    const av = buildingSimTechs(ctx, B('Castle'), 'Aztecs');
    expect(av.some((x) => x.t.en === 'Hoardings')).toBe(false);
    const wt = buildingSimTechs(ctx, B('Watch Tower'), 'Britons').find((x) => x.t.en === 'Guard Tower');
    expect(wt?.ef).toBeNull();
    expect(buildingBase(B('Castle')).barm).toBe(8); // .dat 城堡对「所有建筑」类别(11) 护甲 8
  });

  it('全站 56 文明 × 38 建筑科技列表零重复 t.id（含 4 国城堡独科去重，#1407）', () => {
    expect(civs).toHaveLength(56);
    expect(bs).toHaveLength(38);
    for (const c of civs) {
      for (const b of bs) {
        const list = buildingSimTechs(ctx, b, c.en);
        const idsList = list.map((x) => x.t.id);
        expect(new Set(idsList).size, `${c.en}/${b.id}`).toBe(idsList.length);
        const merged = mergeSimCostTechs(list, applicableSimCostTechs(ctx, b, c.en));
        const mergedIds = merged.map((x) => x.t.id);
        expect(new Set(mergedIds).size, `merged ${c.en}/${b.id}`).toBe(mergedIds.length);
      }
    }

    const castle = B('Castle');
    const castleCases: [string, number, number][] = [
      ['Persians', 7, 488], // 7 堡垒(Citadels, 有数值效果) + 488 波斯步弓手(Kamandaran, 仅文本)
      ['Celts', 482, 5], // 482 堡垒(Stronghold) + 5 凯尔特狂暴(Furor Celtica)
      ['Georgians', 923, 924], // 923 斯万箭塔(Svan Towers) + 924 阿兹瑙里骑兵(Aznauri Cavalry)
      ['Teutons', 11, 489], // 11 开垛口(Crenellations) + 489 重装甲(Ironclad)
    ];
    for (const [civ, numericUtId, textUtId] of castleCases) {
      const av = buildingSimTechs(ctx, castle, civ);
      const numericMatches = av.filter((x) => x.t.id === numericUtId);
      expect(numericMatches, `${civ} Castle UT ${numericUtId}`).toHaveLength(1);
      expect(numericMatches[0]!.ef).not.toBeNull();
      const textMatches = av.filter((x) => x.t.id === textUtId);
      expect(textMatches, `${civ} Castle text UT ${textUtId}`).toHaveLength(1);
      expect(textMatches[0]!.ef).toBeNull();
    }
  });

  it('马来巨港（1189）补齐 IMPLIED 激活 669/670/671 恢复 atk=8, rng=10, los=27（含本方常驻团队 +6），船坞（45）不受影响（#1407 / #1481）', () => {
    const harbor = B('Harbor');
    const availIds = buildingSimTechs(ctx, harbor, 'Malay')
      .filter((x) => x.ef)
      .map((x) => x.t.id)
      .sort((a, b) => a - b);
    expect(availIds).toEqual([8, 47, 50, 54, 199, 200, 201, 280, 322, 380]);

    const matchedHarbor = matchingGenericFx(harbor, true, 4, (n) => ['Fletching', 'Bodkin Arrow', 'Bracer'].includes(n), 'Malay');
    expect(matchedHarbor.map((g) => g.tech).sort((a, b) => a - b)).toEqual([669, 670, 671]);

    // 未选箭术科技时保持基础攻射并自动计入马来常驻团队视野 +6（10 + 6 = 16）
    const emptyHarbor = simulateBuilding(ctx, harbor, 'Malay', 4, new Set());
    expect([emptyHarbor.atk, emptyHarbor.rng, emptyHarbor.los]).toEqual([3, 7, 16]);

    // 城堡时代：箭羽 + 锥子箭触发 669/670，并计入马来常驻团队视野 +6（12 + 6 = 18）
    const castleHarbor = simulateBuilding(ctx, harbor, 'Malay', 3, ids('Fletching', 'Bodkin Arrow'));
    expect([castleHarbor.atk, castleHarbor.rng, castleHarbor.los]).toEqual([6, 9, 18]);

    // 帝王满科技：atk=8, rng=10, los=27（21 + 马来常驻团队 6）, minr=0, 对船 3 + 4 = 7，保留基础对骆驼 +1（#1453 / #1481）
    const fullHarbor = full('Harbor', 'Malay');
    expect([fullHarbor.atk, fullHarbor.rng, fullHarbor.los, fullHarbor.minr]).toEqual([8, 10, 27, 0]);
    expect(fullHarbor.bonus['船只']).toBe(7);
    expect(fullHarbor.bonus['骆驼']).toBe(1);

    // 反例：普通船坞（45）绝不进入 IMPLIED，不误触发海上霸主组合科技 669/670/671（基础 los=8 + 城镇瞭望/巡逻 +8 + 马来常驻团队 +6 = 22）
    const dock = B('Dock');
    expect(matchingGenericFx(dock, true, 4, (n) => ['Fletching', 'Bodkin Arrow', 'Bracer'].includes(n), 'Malay')).toEqual([]);
    const fullDock = full('Dock', 'Malay');
    expect([fullDock.atk, fullDock.rng, fullDock.los]).toEqual([7, 6, 22]);
  });

  it('全站 19 座无攻建筑过滤 322/380 等纯进攻科技，强制保留西西里城楼（1665）全部进攻科技（#1407）', () => {
    const offensiveStats = new Set<Effect['s']>(['atk', 'rng', 'minr', 'rof', 'bonus', 'acc', 'ca']);
    const expectedNoAtkWithOldLeak = [12, 49, 68, 70, 84, 87, 101, 103, 104, 209, 276, 562, 584, 598, 1021, 1734, 1754, 1808, 2556];
    const noAtkBuildings = bs.filter((b) => b.atk === 0 && (b.atks?.length ?? 0) === 0);
    const noAtkIds = new Set(noAtkBuildings.map((b) => b.id));
    for (const id of expectedNoAtkWithOldLeak) expect(noAtkIds.has(id), `no-atk id ${id}`).toBe(true);
    expect(noAtkIds.has(1665)).toBe(false);

    for (const b of noAtkBuildings) {
      for (const civ of b.civs) {
        const av = buildingSimTechs(ctx, b, civ);
        const tids = av.map((x) => x.t.id);
        expect(tids, `${civ}/${b.id} Murder Holes`).not.toContain(322);
        expect(tids, `${civ}/${b.id} Heated Shot`).not.toContain(380);
        for (const row of av) {
          for (const fx of row.ef ?? []) {
            expect(offensiveStats.has(fx.s), `${civ}/${b.id}/t:${row.t.id} offensive stat ${fx.s}`).toBe(false);
          }
        }
      }
    }

    // 商队旅馆（1754）：波斯/印度斯坦保留非进攻科技，即使手动传 322/380 也不生效
    const caravanserai = B('Caravanserai');
    expect(
      buildingSimTechs(ctx, caravanserai, 'Persians')
        .map((x) => x.t.id)
        .sort((a, b) => a - b),
    ).toEqual([8, 50, 51, 280]);
    expect(
      buildingSimTechs(ctx, caravanserai, 'Hindustanis')
        .map((x) => x.t.id)
        .sort((a, b) => a - b),
    ).toEqual([8, 50, 280]);
    const staleSel = simulateBuilding(ctx, caravanserai, 'Persians', 4, new Set([322, 380]));
    expect(staleSel.bonus['船只']).toBeUndefined();
    expect(staleSel.minr).toBe(0);

    // 非进攻科技与线路升级不受影响（如骡车保留手推车/独轮推车，石墙保留垛墙文本项）
    expect(buildingSimTechs(ctx, B('Mule Cart'), 'Armenians').map((x) => x.t.id)).toEqual(expect.arrayContaining([213, 249]));
    expect(buildingSimTechs(ctx, B('Stone Wall'), 'Franks').some((x) => x.t.en === 'Fortified Wall' && x.ef === null)).toBe(true);

    // 强制反例：西西里城楼（1665）基础 atk=0 但具备 5 项攻击类别，必须完整保留进攻科技与满科技数值
    const donjon = B('Donjon');
    expect(donjon.atk).toBe(0);
    expect(donjon.atks).toHaveLength(5);
    const donjonIds = buildingSimTechs(ctx, donjon, 'Sicilians')
      .map((x) => x.t.id)
      .sort((a, b) => a - b);
    expect(donjonIds).toEqual(expect.arrayContaining([47, 199, 200, 201, 322, 380, 608]));
    const fullDonjon = full('Donjon', 'Sicilians');
    expect([fullDonjon.atk, fullDonjon.rng, fullDonjon.minr, fullDonjon.los]).toEqual([5, 3, 0, 21]);

    // 合成边界：仅凭 atks 非空即可判定具备攻击能力；四项为 0 且 atks 为空则过滤进攻文本项（如 Ballistics）
    const atksOnlyDonjon: Building = { ...donjon, atk: 0, rng: 0, minr: 0, rof: 0 };
    expect(buildingSimTechs(ctx, atksOnlyDonjon, 'Sicilians').map((x) => x.t.id)).toEqual(expect.arrayContaining([322, 380, 608]));
    const noAtkSyntheticTower: Building = { ...B('Watch Tower'), atk: 0, rng: 0, minr: 0, rof: 0, atks: [] };
    expect(buildingSimTechs(ctx, noAtkSyntheticTower, 'Britons').some((x) => x.t.en === 'Ballistics' || x.t.en === 'Heated Shot')).toBe(false);
  });

  it('全库 38 座建筑 buildingBase(b).bonus 与目录非主攻击类别精确对齐（#1453）', () => {
    expect(bs).toHaveLength(38);
    const byId = new Map(bs.map((b) => [b.id, b]));
    const noAtksBuildings = bs.filter((b) => (b.atks?.length ?? 0) === 0);
    expect(noAtksBuildings).toHaveLength(27);

    for (const b of bs) {
      const base = buildingBase(b);
      expect(base.armc, `building ${b.id} armc`).toEqual({});
      const expected: Record<string, number> = {};
      for (const a of b.atks ?? []) {
        if (a.classId === 3 || a.classId === 4) continue;
        const label = a.label?.trim();
        if (!label || label === '近战' || label === '穿刺') continue;
        expected[label] = a.amount;
      }
      expect(base.bonus, `building ${b.id} (${b.zh}) bonus`).toEqual(expected);
    }

    // 全部 9 座含非零基础目标类别加成的建筑
    const expectedNonZero: Record<number, Record<string, number>> = {
      45: { 船只: 0, 骆驼: 1 },
      79: { 长矛兵: 2, 所有建筑: 0, 船只: 5, 骆驼: 1 },
      82: { 长矛兵: 2, 船只: 0, 冲车: 0, 骆驼: 0, 步兵: 0 },
      234: { 长矛兵: 2, 所有建筑: 0, 船只: 7, 骆驼: 1 },
      235: { 长矛兵: 2, 所有建筑: 0, 船只: 8, 骆驼: 1 },
      236: { 船只: 40, 骆驼: 1 },
      1189: { 船只: 3, 骆驼: 1 },
      1251: { 长矛兵: 2, 船只: 0, 冲车: 0, 骆驼: 0 },
      1806: { 所有建筑: 0, 船只: 5, 骆驼: 1 },
    };
    for (const [idStr, expected] of Object.entries(expectedNonZero)) {
      const b = byId.get(Number(idStr))!;
      expect(buildingBase(b).bonus, `building ${idStr}`).toEqual(expected);
      expect(buildingBase(b).bonus['穿刺']).toBeUndefined();
    }

    // 109 城镇中心（仅穿刺 5）与 27 座无 atks 建筑 bonus 为空
    expect(buildingBase(byId.get(109)!).bonus).toEqual({});
    for (const b of noAtksBuildings) expect(buildingBase(b).bonus, `no-atks ${b.id}`).toEqual({});

    // 1665 城楼保留显式 0 项且不含穿刺
    expect(buildingBase(byId.get(1665)!).bonus).toEqual({ 长矛兵: 0, 所有建筑: 0, 船只: 0, 骆驼: 0 });

    // 合成边界：排除 classId=4（近战）、label='近战'/'穿刺'、缺 label 或空白 label
    const synthetic: Building = {
      ...B('Castle'),
      atks: [
        { classId: 4, amount: 9, label: '自定义近战名' },
        { classId: 3, amount: 11, label: '穿刺' },
        { classId: 99, amount: 5, label: '近战' },
        { classId: 98, amount: 6, label: '穿刺' },
        { classId: 97, amount: 7 },
        { classId: 96, amount: 8, label: '   ' },
        { classId: 27, amount: 2, label: '长矛兵' },
      ],
    };
    expect(buildingBase(synthetic).bonus).toEqual({ 长矛兵: 2 });
  });

  it('加热射击（380）与波斯堡垒（7）在目录基础加成上精确叠加，含无攻与 1665 反例（#1453）', () => {
    const byId = new Map(bs.map((b) => [b.id, b]));
    const hs = ids('Heated Shot');

    // 四级防御塔 / 炮塔：×2.25 精确无浮点尾数，并保留其余基础加成
    const wt = simulateBuilding(ctx, byId.get(79)!, 'Chinese', 4, hs);
    expect(wt.bonus['船只']).toBe(11.25);
    expect([wt.bonus['长矛兵'], wt.bonus['骆驼']]).toEqual([2, 1]);

    const gt = simulateBuilding(ctx, byId.get(234)!, 'Chinese', 4, hs);
    expect(gt.bonus['船只']).toBe(15.75);
    expect([gt.bonus['长矛兵'], gt.bonus['骆驼']]).toEqual([2, 1]);

    const keep = simulateBuilding(ctx, byId.get(235)!, 'Chinese', 4, hs);
    expect(keep.bonus['船只']).toBe(18);
    expect([keep.bonus['长矛兵'], keep.bonus['骆驼']]).toEqual([2, 1]);

    const bbt = simulateBuilding(ctx, byId.get(236)!, 'Chinese', 4, hs);
    expect(bbt.bonus['船只']).toBe(90);
    expect(bbt.bonus['骆驼']).toBe(1);

    // 加法 +4 建筑：在目录基础值上累加并保留其他类别
    const harbor = simulateBuilding(ctx, byId.get(1189)!, 'Malay', 4, hs);
    expect([harbor.bonus['船只'], harbor.bonus['骆驼']]).toEqual([7, 1]);

    const church = simulateBuilding(ctx, byId.get(1806)!, 'Armenians', 4, hs);
    expect([church.bonus['船只'], church.bonus['骆驼']]).toEqual([9, 1]);

    const castle = simulateBuilding(ctx, byId.get(82)!, 'Chinese', 4, hs);
    expect([castle.bonus['长矛兵'], castle.bonus['船只']]).toEqual([2, 4]);

    const dock = simulateBuilding(ctx, byId.get(45)!, 'Chinese', 4, hs);
    expect([dock.bonus['船只'], dock.bonus['骆驼']]).toEqual([4, 1]);

    const krepost = simulateBuilding(ctx, byId.get(1251)!, 'Bulgarians', 4, hs);
    expect([krepost.bonus['长矛兵'], krepost.bonus['船只']]).toEqual([2, 4]);

    const tc = simulateBuilding(ctx, byId.get(109)!, 'Chinese', 4, hs);
    expect(tc.bonus['船只']).toBe(4);

    // 波斯城堡勾选堡垒（7）：保留长矛兵 2，新增冲车 3、步兵 3
    const persianCastle = simulateBuilding(ctx, byId.get(82)!, 'Persians', 4, ids('Citadels'));
    expect([persianCastle.bonus['长矛兵'], persianCastle.bonus['冲车'], persianCastle.bonus['步兵']]).toEqual([2, 3, 3]);

    // 反例：未勾 380 时城堡船只保持 0；1665 城楼勾选 380 保持 0 × 2.25 = 0 且无 NaN；19 座无攻建筑传 380 不生效
    expect(simulateBuilding(ctx, byId.get(82)!, 'Chinese', 4, new Set()).bonus['船只']).toBe(0);
    const donjonHs = simulateBuilding(ctx, byId.get(1665)!, 'Sicilians', 4, hs);
    expect(donjonHs.bonus).toEqual({ 长矛兵: 0, 所有建筑: 0, 船只: 0, 骆驼: 0 });
    for (const id of [12, 49, 68, 70, 84, 87, 101, 103, 104, 209, 276, 562, 584, 598, 1021, 1734, 1754, 1808, 2556]) {
      const b = byId.get(id)!;
      const civ = b.civs.find((c) => buildingSimTechs(ctx, byId.get(82)!, c).some((x) => x.t.id === 380)) ?? b.civs[0]!;
      expect(simulateBuilding(ctx, b, civ, 4, hs).bonus['船只'], `no-atk ${id}/${civ}`).toBeUndefined();
    }
  });

  it('强化教堂（1806）与聚落（2556）条件隐藏科技闭环消费、无双算、无 947 负射程且不污染修道院（#1474）', () => {
    const church = B('Fortified Church');
    const geoAvail = buildingSimTechs(ctx, church, 'Georgians');
    const armAvail = buildingSimTechs(ctx, church, 'Armenians');

    expect(
      geoAvail
        .filter((x) => x.ef)
        .map((x) => x.t.id)
        .sort((a, b) => a - b),
    ).toEqual([8, 47, 50, 51, 54, 199, 200, 201, 280, 322, 923]);
    expect(
      armAvail
        .filter((x) => x.ef)
        .map((x) => x.t.id)
        .sort((a, b) => a - b),
    ).toEqual([8, 47, 50, 54, 199, 200, 201, 280, 322, 380]);

    // 累计研究费用与研究时长对齐 UX 规格
    expect(totalCost(geoAvail, allNumeric(geoAvail))).toEqual({ cost: { Food: 2225, Gold: 850, Wood: 575, Stone: 150 }, time: 490 });
    expect(totalCost(armAvail, allNumeric(armAvail))).toEqual({ cost: { Food: 1975, Gold: 750, Wood: 375, Stone: 150 }, time: 405 });

    // 帝王一键满科技（无双算，最小射程严格为 0，且保留 #1453 基础对船/骆驼加成）
    const armFull = full('Fortified Church', 'Armenians');
    expect([armFull.hp, armFull.ma, armFull.pa, armFull.barm, armFull.atk, armFull.rng, armFull.minr, armFull.los, armFull.bt]).toEqual([
      2640, 6, 12, 3, 9, 8, 0, 18, 41.7,
    ]);
    expect([armFull.bonus['船只'], armFull.bonus['骆驼']]).toEqual([9, 1]);

    const geoFull = full('Fortified Church', 'Georgians');
    expect(geoFull.hp).toBeCloseTo(2904, 6);
    expect(formatHp(geoFull.hp)).toBe('2904');
    expect([geoFull.ma, geoFull.pa, geoFull.barm, geoFull.atk, geoFull.rng, geoFull.minr, geoFull.los, geoFull.bt]).toEqual([7, 13, 6, 11, 8, 0, 18, 41.7]);

    // 逐步切换箭羽/锥子箭/护腕/化学与近射孔，及城堡时代不计 942 帝王护甲
    const armCastleEmpty = simulateBuilding(ctx, church, 'Armenians', 3, new Set());
    expect([armCastleEmpty.ma, armCastleEmpty.pa, armCastleEmpty.atk, armCastleEmpty.rng, armCastleEmpty.minr]).toEqual([4, 10, 5, 4, 1]);
    const armImpEmpty = simulateBuilding(ctx, church, 'Armenians', 4, new Set());
    expect([armImpEmpty.ma, armImpEmpty.pa, armImpEmpty.atk, armImpEmpty.rng, armImpEmpty.minr]).toEqual([5, 11, 5, 4, 1]);
    const armFletch = simulateBuilding(ctx, church, 'Armenians', 4, ids('Fletching'));
    expect([armFletch.atk, armFletch.rng]).toEqual([6, 6]);
    const armBodkin = simulateBuilding(ctx, church, 'Armenians', 4, ids('Fletching', 'Bodkin Arrow'));
    expect([armBodkin.atk, armBodkin.rng]).toEqual([7, 7]);
    const armBracer = simulateBuilding(ctx, church, 'Armenians', 4, ids('Fletching', 'Bodkin Arrow', 'Bracer'));
    expect([armBracer.atk, armBracer.rng]).toEqual([8, 8]);
    const armChem = simulateBuilding(ctx, church, 'Armenians', 4, ids('Fletching', 'Bodkin Arrow', 'Bracer', 'Chemistry'));
    expect([armChem.atk, armChem.rng]).toEqual([9, 8]);
    expect(simulateBuilding(ctx, church, 'Armenians', 4, ids('Murder Holes')).minr).toBe(0);
    // 越权传入他国独科 923 对亚美尼亚 fail-closed 不生效
    expect(simulateBuilding(ctx, church, 'Armenians', 4, new Set([923])).atk).toBe(5);

    // 聚落（2556）：帝王计入 1356 +1/+1 护甲，城堡及以前不计入，无进攻科技泄漏
    const settlement = B('Settlement');
    expect([full('Settlement', 'Mapuche').ma, full('Settlement', 'Mapuche').pa]).toEqual([3, 10]);
    expect([full('Settlement', 'Incas').ma, full('Settlement', 'Incas').pa]).toEqual([2, 9]);
    expect([full('Settlement', 'Muisca').ma, full('Settlement', 'Muisca').pa]).toEqual([2, 9]);
    expect([full('Settlement', 'Tupi').ma, full('Settlement', 'Tupi').pa]).toEqual([1, 8]);
    const mapucheCastle = simulateBuilding(ctx, settlement, 'Mapuche', 3, ids('Masonry'));
    expect([mapucheCastle.ma, mapucheCastle.pa]).toEqual([1, 8]);
    expect(simulateBuilding(ctx, settlement, 'Tupi', 3, new Set())).toMatchObject({ ma: 0, pa: 7 });

    // 反例：普通修道院（104）零漂移，船坞（45）与瞭望箭塔（79）不被组合规则污染
    const monastery = B('Monastery');
    const frMonasteryIds = buildingSimTechs(ctx, monastery, 'Franks').map((x) => x.t.id);
    for (const forbidden of [47, 199, 200, 201, 923]) expect(frMonasteryIds).not.toContain(forbidden);
    const frMonasteryFull = full('Monastery', 'Franks');
    expect([frMonasteryFull.hp, frMonasteryFull.ma, frMonasteryFull.pa, frMonasteryFull.atk, frMonasteryFull.rng]).toEqual([2541, 2, 9, 0, 0]);
    expect(buildingSimTechs(ctx, B('Dock'), 'Malay').some((x) => x.t.en === 'Thalassocracy' && x.ef !== null)).toBe(false);
    expect(buildingSimTechs(ctx, B('Watch Tower'), 'Britons').some((x) => x.t.en === 'Guard Tower' && x.ef !== null)).toBe(false);
  });

  it('全库 38 座建筑弹道学（93）与 DAT.ballistics.buildings 精确一致并保留双防线（#1510）', () => {
    const byId = new Map(bs.map((b) => [b.id, b]));
    const datBlds = DAT.ballistics?.buildings ?? [];
    const expectedBlds = [45, 79, 82, 109, 234, 235, 236, 1189, 1251, 1665, 1806];
    expect(datBlds).toEqual(expectedBlds);
    expect(bs).toHaveLength(38);

    // 1. 全库 38 座建筑遍历守恒：11 座命中且为无 scopeNote 的仅文本项，27 座不出现 t93
    const matchedIds: number[] = [];
    for (const b of bs) {
      const civ = b.civs[0]!;
      const avail = buildingSimTechs(ctx, b, civ);
      const bRow = avail.find((x) => x.t.id === 93);
      if (bRow) {
        matchedIds.push(b.id);
        expect(bRow.ef, `building ${b.id} ef`).toBeNull();
        expect(bRow.scopeNote, `building ${b.id} scopeNote`).toBeUndefined();
        expect(allNumeric(avail).has(93), `building ${b.id} allNumeric`).toBe(false);
        expect(presetUpTo(avail, 4, civ).has(93), `building ${b.id} presetUpTo`).toBe(false);
      }
    }
    matchedIds.sort((a, b) => a - b);
    expect(matchedIds).toEqual(datBlds);
    expect(bs.length - matchedIds.length).toBe(27);

    // 2. 显式覆盖 6 座新增代表文明与 5 座既有正对照
    const positiveCases: [number, string][] = [
      [45, 'Portuguese'],
      [109, 'Portuguese'],
      [236, 'Portuguese'],
      [1665, 'Sicilians'],
      [1189, 'Malay'],
      [1806, 'Armenians'],
      [79, 'Portuguese'],
      [82, 'Portuguese'],
      [234, 'Portuguese'],
      [235, 'Portuguese'],
      [1251, 'Bulgarians'],
    ];
    for (const [bid, civ] of positiveCases) {
      const avail = buildingSimTechs(ctx, byId.get(bid)!, civ);
      const rows = avail.filter((x) => x.t.id === 93);
      expect(rows, `${civ}/${bid}`).toHaveLength(1);
      expect(rows[0]!.ef).toBeNull();
      expect(rows[0]!.scopeNote).toBeUndefined();
      expect(allNumeric(avail).has(93)).toBe(false);
      expect(presetUpTo(avail, 4, civ).has(93)).toBe(false);
    }

    // 3. 显式覆盖 3 座无攻负对照（哨站 598 / 大商站 1021 / 聚落 2556）
    for (const [bid, civ] of [
      [598, 'Portuguese'],
      [1021, 'Portuguese'],
      [2556, 'Incas'],
    ] as const) {
      expect(
        buildingSimTechs(ctx, byId.get(bid)!, civ).some((x) => x.t.id === 93),
        `negative ${civ}/${bid}`,
      ).toBe(false);
    }

    // 4. 合成边界 ①：id=79 在 DAT.ballistics.buildings 内但全零攻击属性且 atks=[] → 运行时 canAttack 防线阻断 t93
    const zeroAtkTower: Building = { ...byId.get(79)!, atk: 0, rng: 0, minr: 0, rof: 0, atks: [] };
    expect(buildingSimTechs(ctx, zeroAtkTower, 'Portuguese').some((x) => x.t.id === 93)).toBe(false);

    // 5. 合成边界 ②：文明科技树移除 t93 时，即使建筑在 DAT.ballistics.buildings 内也不显示 t93
    const clonedTrees: Trees = structuredClone(trees);
    for (const block of clonedTrees.t.Portuguese!) {
      for (const cell of block[3]) {
        if (cell[2] === 't' && cell[3] === 93) cell[4] = 0;
      }
    }
    const noBallisticsCtx = makeSimContext(techs, clonedTrees);
    for (const bid of [45, 79, 82, 109, 234, 235, 236]) {
      expect(
        buildingSimTechs(noBallisticsCtx, byId.get(bid)!, 'Portuguese').some((x) => x.t.id === 93),
        `no-t93 Portuguese/${bid}`,
      ).toBe(false);
    }
  });
});
