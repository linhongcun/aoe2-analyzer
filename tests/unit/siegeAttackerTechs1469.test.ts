import { beforeAll, describe, expect, it } from 'vitest';
import { civs, loadCore, loadTrees, type Core } from '../../src/data';
import { civStatus } from '../../src/domain/civStatus';
import { DAT } from '../../src/domain/datEffects';
import {
  calculateSiege,
  decideSiegeCanonical,
  decodeSiege,
  encodeSiege,
  isRegularSiegeUnit,
  normalizeSiegeTechs,
  siegeArmorTechs,
  siegeAttackerTechs,
  SIEGE_EVIDENCE_UNIT_ID,
  SIEGE_MANGONEL_IDS,
  SIEGE_UNIT_IDS,
  toggleSiegeTech,
} from '../../src/domain/siege';
import { makeSimContext, simulate } from '../../src/domain/simulator';
import type { Trees } from '../../src/domain/types';
import { siegeCivNote, siegeConditionSummary, siegeTechsEmptyNote, siegeTechsHint } from '../../src/features/siege/siegeDisplay';

const ARROW = String.fromCodePoint(0x2192);
const ATTACKER_STATS = new Set(['atk', 'bonus', 'rof']);

let core: Core;
let trees: Trees;

beforeAll(async () => {
  [core, trees] = await Promise.all([loadCore(), loadTrees()]);
});

const catalog = () => ({ ...core, trees });

describe('Issue 1469: 攻城拆建筑攻方核心攻城科技引擎与展示', () => {
  it('验收 1：南亚四国 4 头攻城战象（1746）满科技拆城堡与城镇中心精确吻合', () => {
    const siegeElephant = core.unitById[1746]!;
    const castle = core.buildingById[82]!;
    const tc = core.buildingById[109]!;
    const ctx = catalog();

    // 瞿折罗：仅 67, 68（缺 75 鼓风炉、377 攻城技师）
    expect(siegeAttackerTechs(siegeElephant, 'Gurjaras', ctx).map((t) => t.id)).toEqual([67, 68]);
    const gurjaras = calculateSiege(siegeElephant, castle, 4, 'Gurjaras', [], [67, 68], ctx);
    expect(gurjaras.verified).toBe(true);
    if (gurjaras.verified) {
      expect(gurjaras.hits).toBe(9);
      expect(gurjaras.gameSeconds).toBe(24);
      expect(gurjaras.realSeconds.toFixed(1)).toBe('14.1');
    }

    // 孟加拉：满科技 67, 68, 75, 377, 833（展示顺序通用在前、独科在后）
    expect(siegeAttackerTechs(siegeElephant, 'Bengalis', ctx).map((t) => t.id)).toEqual([67, 68, 75, 377, 833]);
    const bengalis = calculateSiege(siegeElephant, castle, 4, 'Bengalis', [], [67, 68, 75, 377, 833], ctx);
    expect(bengalis).toMatchObject({ verified: true, damage: 118, hits: 11, gameSeconds: 25 });
    if (bengalis.verified) expect(bengalis.realSeconds.toFixed(1)).toBe('14.7');

    // 印度斯坦：满科技 67, 68, 75, 377（无护甲城堡 + 砌石/建筑学城堡）
    expect(siegeAttackerTechs(siegeElephant, 'Hindustanis', ctx).map((t) => t.id)).toEqual([67, 68, 75, 377]);
    const hind = calculateSiege(siegeElephant, castle, 4, 'Hindustanis', [], [67, 68, 75, 377], ctx);
    expect(hind).toMatchObject({ verified: true, damage: 118, hits: 11, gameSeconds: 30 });
    if (hind.verified) expect(hind.realSeconds.toFixed(1)).toBe('17.6');

    const hindArmored = calculateSiege(siegeElephant, castle, 4, 'Hindustanis', [50, 51], [67, 68, 75, 377], ctx);
    expect(hindArmored).toMatchObject({ verified: true, damage: 112, hits: 13, gameSeconds: 36 });
    if (hindArmored.verified) expect(hindArmored.realSeconds.toFixed(1)).toBe('21.2');

    // 达罗毗荼：满科技 67, 68, 75（缺 377）拆城堡与低近甲城镇中心
    expect(siegeAttackerTechs(siegeElephant, 'Dravidians', ctx).map((t) => t.id)).toEqual([67, 68, 75]);
    const dravCastle = calculateSiege(siegeElephant, castle, 4, 'Dravidians', [], [67, 68, 75], ctx);
    expect(dravCastle).toMatchObject({ verified: true, hits: 13, gameSeconds: 36 });
    if (dravCastle.verified) expect(dravCastle.realSeconds.toFixed(1)).toBe('21.2');

    expect(calculateSiege(siegeElephant, tc, 1, 'Dravidians', [], [], ctx)).toMatchObject({ verified: true, damage: 106, hits: 23, gameSeconds: 66 });
    expect(calculateSiege(siegeElephant, tc, 1, 'Dravidians', [], [67, 68, 75], ctx)).toMatchObject({ verified: true, damage: 110, hits: 22, gameSeconds: 63 });

    const hindTc = calculateSiege(siegeElephant, tc, 4, 'Hindustanis', [], [67, 68, 75, 377], ctx);
    expect(hindTc).toMatchObject({ verified: true, damage: 131, hits: 5, gameSeconds: 12 });
    if (hindTc.verified) expect(hindTc.realSeconds.toFixed(1)).toBe('7.1');

    const bengTc = calculateSiege(siegeElephant, tc, 4, 'Bengalis', [], [67, 68, 75, 377, 833], ctx);
    expect(bengTc).toMatchObject({ verified: true, damage: 131, hits: 5, gameSeconds: 10 });
    if (bengTc.verified) expect(bengTc.realSeconds.toFixed(1)).toBe('5.9');
  });

  it('验收 2：日本/萨拉森/丹麦满科技与 simulator.ts 同源、入参顺序与重复 ID 无关，且城堡单位可勾帝王科技', () => {
    const treb = core.unitById[331]!;
    const siegeRam = core.unitById[548]!;
    const armoredElephant = core.unitById[1744]!;
    const batteringRam = core.unitById[1258]!;
    const castle = core.buildingById[82]!;
    const ctx = catalog();

    // 日本 4 台巨投满科技（47, 59, 377）
    expect(siegeAttackerTechs(treb, 'Japanese', ctx).map((t) => t.id)).toEqual([47, 377, 59]);
    const jp = calculateSiege(treb, castle, 4, 'Japanese', [], [47, 59, 377], ctx);
    expect(jp.verified).toBe(true);
    if (jp.verified) {
      expect(jp.damage).toBe(482);
      expect(jp.hits).toBe(3);
      expect(Number(jp.gameSeconds.toFixed(2))).toBe(15);
      expect(jp.realSeconds.toFixed(1)).toBe('8.8');
    }

    // 萨拉森 4 台巨投满科技（47, 377, 454）与 simulator.ts 同源对账（454 先于 47 -> atk=231）
    const simCtx = makeSimContext(core.techs, trees);
    const simSaracens = simulate(simCtx, treb, 'Saracens', 4, new Set([47, 377, 454]), new Set());
    expect(simSaracens.atk).toBeCloseTo(231, 10);
    expect(simSaracens.bonus['所有建筑']).toBeCloseTo(345, 10);

    const sarA = calculateSiege(treb, castle, 4, 'Saracens', [], [47, 377, 454], ctx);
    const sarB = calculateSiege(treb, castle, 4, 'Saracens', [], [454, 47, 377, 454], ctx);
    expect(sarA).toEqual(sarB);
    expect(sarA).toMatchObject({ verified: true, damage: 557, hits: 3, gameSeconds: 20 });

    const sarArmoredBase = calculateSiege(treb, castle, 4, 'Saracens', [50, 51], [], ctx);
    expect(sarArmoredBase).toMatchObject({ verified: true, hits: 4, gameSeconds: 30 });
    const sarArmoredFull = calculateSiege(treb, castle, 4, 'Saracens', [50, 51], [47, 377, 454], ctx);
    expect(sarArmoredFull).toMatchObject({ verified: true, damage: 549, hits: 3, gameSeconds: 20 });

    // 丹麦人 4 台重型冲车（377, 1483）与 4 台巨型投石机（47, 377, 1483）
    expect(calculateSiege(siegeRam, castle, 4, 'Danes', [], [], ctx)).toMatchObject({ verified: true, hits: 7, gameSeconds: 30 });
    const daneRam = calculateSiege(siegeRam, castle, 4, 'Danes', [], [377, 1483], ctx);
    expect(daneRam).toMatchObject({ verified: true, damage: 328, hits: 4, gameSeconds: 15 });
    if (daneRam.verified) expect(daneRam.realSeconds.toFixed(1)).toBe('8.8');

    const daneTreb = calculateSiege(treb, castle, 4, 'Danes', [], [47, 377, 1483], ctx);
    expect(daneTreb).toMatchObject({ verified: true, damage: 602, hits: 2, gameSeconds: 10 });
    if (daneTreb.verified) expect(daneTreb.realSeconds.toFixed(1)).toBe('5.9');

    // 城堡单位（1744 / 1258）允许勾选帝王科技
    expect(siegeAttackerTechs(armoredElephant, 'Hindustanis', ctx).map((t) => t.id)).toEqual([67, 68, 75, 377]);
    expect(calculateSiege(armoredElephant, castle, 4, 'Hindustanis', [], [67, 68, 75, 377], ctx)).toMatchObject({
      verified: true,
      damage: 100,
      hits: 12,
      gameSeconds: 33,
    });
    expect(siegeAttackerTechs(batteringRam, 'Danes', ctx).map((t) => t.id)).toEqual([377, 1483]);
    expect(calculateSiege(batteringRam, castle, 4, 'Danes', [], [377, 1483], ctx)).toMatchObject({ verified: true, damage: 244, hits: 5, gameSeconds: 20 });
  });

  it('验收 3：遍历全部 56 文明 × 10 攻城单位，精确覆盖 9 项科技且零误命中，手推炮/投石车与不限文明口径严格成立', () => {
    const ctx = catalog();
    const castle = core.buildingById[82]!;
    const observedTechIds = new Set<number>();

    for (const civ of civs) {
      const tree = civStatus(trees, civ.en);
      for (const uid of SIEGE_UNIT_IDS) {
        const u = core.unitById[uid]!;
        const list = siegeAttackerTechs(u, civ.en, ctx);
        if (!isRegularSiegeUnit(uid)) {
          expect(list, `${civ.en} unit ${uid} 应无攻方科技`).toEqual([]);
          continue;
        }
        if (!u.civs.includes(civ.en)) {
          expect(list, `${civ.en} 不可训练 ${uid} 应无攻方科技`).toEqual([]);
          continue;
        }
        for (const tech of list) {
          observedTechIds.add(tech.id);
          expect(tech.civs.includes(civ.en), `${civ.en} tech ${tech.id} 必须在 tech.civs 中`).toBe(true);
          expect(Boolean(tree['t' + tech.id]), `${civ.en} tech ${tech.id} 必须在科技树点亮`).toBe(true);
          const datEntry = DAT.techs[tech.en];
          expect(datEntry?.combat, `${tech.en} 必须已编码`).toBe(true);
          expect(
            datEntry!.rules.some((r) => !r.b && r.t.includes(uid) && r.fx.some((f) => ATTACKER_STATS.has(f.s))),
            `${tech.en} 必须命中 ${uid} 的 atk/bonus/rof`,
          ).toBe(true);
        }
        // 反例：不可训练战象的马里/缅甸/保加利亚独科绝不泄漏
        for (const badId of [577, 627, 685]) {
          expect(
            list.some((t) => t.id === badId),
            `${civ.en} ${uid} 不得出现 ${badId}`,
          ).toBe(false);
        }
      }
    }

    // DE 188329 下数据驱动全集精确为 9 项攻方科技
    expect([...observedTechIds].sort((a, b) => a - b)).toEqual([47, 59, 67, 68, 75, 377, 454, 833, 1483]);

    // 显式反例：马里/缅甸/保加利亚/契丹选战象均为空，且直调 calculateSiege fail-closed
    for (const [civEn, badTech] of [
      ['Malians', 577],
      ['Burmese', 627],
      ['Bulgarians', 685],
      ['Khitans', 67],
    ] as const) {
      const ele = core.unitById[1746]!;
      expect(siegeAttackerTechs(ele, civEn, ctx)).toEqual([]);
      expect(calculateSiege(ele, castle, 4, civEn, [], [badTech], ctx).verified).toBe(false);
    }

    // 36 手推炮与 280/550/588 投石车系传入攻方科技时一律 fail-closed
    expect(calculateSiege(core.unitById[SIEGE_EVIDENCE_UNIT_ID]!, castle, 2, 'Turks', [], [377], ctx).verified).toBe(false);
    for (const id of SIEGE_MANGONEL_IDS) {
      expect(siegeAttackerTechs(core.unitById[id]!, '', ctx)).toEqual([]);
      expect(calculateSiege(core.unitById[id]!, castle, 1, '', [], [377], ctx).verified).toBe(false);
    }

    // 不限文明：只含通用攻方科技，不含独科；有无 trees 结果一致
    const expectedNoCiv: Record<number, number[]> = {
      1258: [377],
      422: [377],
      548: [377],
      1744: [67, 68, 75, 377],
      1746: [67, 68, 75, 377],
      331: [47, 377],
      280: [],
      550: [],
      588: [],
      36: [],
    };
    for (const uid of SIEGE_UNIT_IDS) {
      const u = core.unitById[uid]!;
      const withTrees = siegeAttackerTechs(u, '', ctx).map((t) => t.id);
      const withoutTrees = siegeAttackerTechs(u, '', { techs: core.techs }).map((t) => t.id);
      expect(withTrees, `no-civ unit ${uid}`).toEqual(expectedNoCiv[uid]);
      expect(withoutTrees, `no-civ without trees unit ${uid}`).toEqual(expectedNoCiv[uid]);
      expect(siegeAttackerTechs(u, '', ctx).every((t) => t.type !== 'UniqueTech')).toBe(true);
    }
  });

  it('验收 4：前置链联动、URL 编解码往返与裁剪、decideSiegeCanonical %2C 一次收敛及 fail-closed 护栏', () => {
    const ctx = catalog();
    const siegeElephant = core.unitById[1746]!;
    const castle = core.buildingById[82]!;
    const availBeng = siegeAttackerTechs(siegeElephant, 'Bengalis', ctx);

    // 勾 75 自动补 67, 68；取消 67 级联取消 68, 75
    const after75 = toggleSiegeTech(75, [], availBeng, core.techById);
    expect(after75).toEqual([67, 68, 75]);
    const afterAddUnique = toggleSiegeTech(833, after75, availBeng, core.techById);
    expect(afterAddUnique).toEqual([67, 68, 75, 833]);
    const afterUncheck67 = toggleSiegeTech(67, afterAddUnique, availBeng, core.techById);
    expect(afterUncheck67).toEqual([833]);

    // normalizeSiegeTechs：缺前置自动补齐，不适用 ID 裁剪
    expect(normalizeSiegeTechs([75, 9999, 59], availBeng, core.techById)).toEqual([67, 68, 75]);

    // URL 解码与往返：缺前置补全、升序去重、无 techs 时不输出
    const decoded = decodeSiege('?unit=1746&n=4&bldg=82&civ=Bengalis&techs=833,75,377,75,999', ctx);
    expect(decoded).toEqual({ unit: 1746, n: 4, bldg: 82, civ: 'Bengalis', armor: [], techs: [67, 68, 75, 377, 833] });
    const encoded = encodeSiege(decoded);
    expect(encoded).toBe('unit=1746&n=4&bldg=82&civ=Bengalis&techs=67%2C68%2C75%2C377%2C833');
    expect(decodeSiege('?' + encoded, ctx)).toEqual(decoded);

    // 切文明/切单位自动裁剪不适用科技
    expect(decodeSiege('?unit=1746&n=4&bldg=82&civ=Hindustanis&techs=67,68,75,377,833', ctx).techs).toEqual([67, 68, 75, 377]);
    expect(decodeSiege('?unit=1746&n=4&bldg=82&techs=67,68,75,377,833', ctx).techs).toEqual([67, 68, 75, 377]);
    expect(decodeSiege('?unit=36&n=2&bldg=82&civ=Turks&techs=377', ctx).techs).toEqual([]);
    expect(decodeSiege('?unit=548&n=4&bldg=82&civ=Huns&techs=377,1483', ctx).techs).toEqual([]);
    expect(encodeSiege(decodeSiege('?unit=1746&n=4&bldg=82', ctx))).toBe('unit=1746&n=4&bldg=82');

    // decideSiegeCanonical：%2C 规范串命中 keep，原始逗号串首轮 replace 后一次收敛
    const canonical = '?' + encoded;
    expect(decideSiegeCanonical(`#/siege${canonical}`, canonical)).toEqual({ kind: 'keep' });
    expect(decideSiegeCanonical(`#/siege/${canonical}`, canonical)).toEqual({ kind: 'keep' });
    expect(decideSiegeCanonical('#/siege?unit=1746&n=4&bldg=82&civ=Bengalis&techs=67,68,75,377,833', canonical)).toEqual({ kind: 'replace' });
    expect(decideSiegeCanonical('#/siege?unit=1746&n=4&bldg=82&armor=50%2C51', '?unit=1746&n=4&bldg=82&armor=50%2C51')).toEqual({ kind: 'keep' });
    expect(decideSiegeCanonical('#/unit/1746', canonical)).toEqual({ kind: 'ignore' });

    // calculateSiege fail-closed 护栏：缺前置、缺 trees（选文明时）、不可用科技、非收录单位带科技
    expect(calculateSiege(siegeElephant, castle, 4, 'Bengalis', [], [75], ctx).verified).toBe(false);
    expect(calculateSiege(siegeElephant, castle, 4, 'Bengalis', [], [67, 68, 75], { techs: core.techs }).verified).toBe(false);
    expect(calculateSiege(siegeElephant, castle, 4, 'Dravidians', [], [377], ctx).verified).toBe(false);
    expect(calculateSiege(siegeElephant, castle, 4, '', [], [833], ctx).verified).toBe(false);
    expect(calculateSiege(core.unitById[74]!, castle, 4, '', [], [377], ctx).verified).toBe(false);
    // 非收录单位空科技基线保持不变
    expect(calculateSiege(core.unitById[74]!, castle, 4).verified).toBe(true);
    // 不限文明且缺 trees 时仍按 tech.civs 交集支持合法通用科技
    expect(calculateSiege(siegeElephant, castle, 4, '', [], [67, 68, 75, 377], { techs: core.techs })).toMatchObject({
      verified: true,
      damage: 118,
      hits: 11,
      gameSeconds: 30,
    });
  });

  it('siegeDisplay 文案全分支：9 种文明说明、4 类空态、前置链动态文案与结果/对照摘要', () => {
    const ctx = catalog();
    const ele1746 = core.unitById[1746]!;
    const ele1744 = core.unitById[1744]!;
    const ram1258 = core.unitById[1258]!;
    const ram548 = core.unitById[548]!;
    const cannon = core.unitById[36]!;
    const mangonel = core.unitById[280]!;
    const castle = core.buildingById[82]!;
    const castleArmor = siegeArmorTechs(castle);

    const bengTechs = siegeAttackerTechs(ele1746, 'Bengalis', ctx);
    const noCivTechs = siegeAttackerTechs(ele1746, '', ctx);
    const gurjTechs1744 = siegeAttackerTechs(ele1744, 'Gurjaras', ctx);
    const hindTechs1744 = siegeAttackerTechs(ele1744, 'Hindustanis', ctx);
    const daneRam1258 = siegeAttackerTechs(ram1258, 'Danes', ctx);

    // 9 种攻方文明说明
    expect(siegeCivNote(ele1746, '', noCivTechs, [])).toBe('未选文明：不计入文明被动加成与独特科技；当前未勾选攻方科技（基础值），可在下方勾选通用攻方科技。');
    expect(siegeCivNote(ele1746, '', noCivTechs, [377])).toBe('未选文明：不计入文明被动加成与独特科技；已计入下方勾选的通用攻方科技。');
    expect(siegeCivNote(ele1746, 'Bengalis', bengTechs, [])).toBe('文明被动加成按单位所处时代计入；攻方科技按下方开关计入，团队加成与未编码机制未计入。');
    expect(siegeCivNote(ram548, 'Huns', [], [])).toBe('文明被动加成按单位所处时代计入；团队加成与未编码机制未计入。');
    expect(siegeCivNote(ele1746, 'Franks', [], [])).toBe('所选文明无法训练当前单位，暂不计算。');
    expect(siegeCivNote(cannon, '', [], [])).toBe('未选文明：当前手推炮仅按已核实无科技基础口径计算。');
    expect(siegeCivNote(cannon, 'Turks', [], [])).toBe('手推炮走独立核实表，仅覆盖已审计文明的基础配置，不含团队加成。');
    expect(siegeCivNote(mangonel, '', [], [])).toBe('未选文明：投石车系主弹与副弹结算尚未对齐，暂不参与计算。');
    expect(siegeCivNote(mangonel, 'Celts', [], [])).toBe('投石车系主弹与副弹结算尚未对齐，文明加成暂不参与计算。');

    // 4 类空态说明
    expect(siegeTechsEmptyNote(ram548, 'Huns')).toBe('当前文明对该单位没有已编码的攻方攻城科技。');
    expect(siegeTechsEmptyNote(ele1746, 'Franks')).toBe('所选文明无法训练当前单位，未提供攻方科技选项。');
    expect(siegeTechsEmptyNote(cannon, 'Turks')).toBe('手推炮当前仅按独立核实的基础数据计算，暂不提供攻方科技开关。');
    expect(siegeTechsEmptyNote(mangonel, '')).toBe('投石车系暂不提供攻方科技开关。');

    // 前置链与跨时代辅助说明
    expect(siegeTechsHint(ele1744, hindTechs1744, core.techById)).toBe(
      `锻造 ${ARROW} 铸铁 ${ARROW} 鼓风炉按前置联动；可勾选帝王攻方科技（模拟帝王未升精锐场景）。`,
    );
    expect(siegeTechsHint(ele1746, bengTechs, core.techById)).toBe(
      `锻造 ${ARROW} 铸铁 ${ARROW} 鼓风炉按前置联动：勾选后继自动补齐前置，取消前置级联取消后继。`,
    );
    expect(siegeTechsHint(ele1744, gurjTechs1744, core.techById)).toBe(`锻造 ${ARROW} 铸铁按前置联动：勾选后继自动补齐前置，取消前置级联取消后继。`);
    expect(siegeTechsHint(ram1258, daneRam1258, core.techById)).toBe('可勾选帝王攻方科技（模拟帝王未升级形态场景）。');
    expect(siegeTechsHint(ram548, siegeAttackerTechs(ram548, 'Danes', ctx), core.techById)).toBeNull();

    // 结果卡与对照表条件摘要
    expect(siegeConditionSummary(ele1746, 'Bengalis', bengTechs, [67, 68, 75, 377, 833], castleArmor, [], core.techById)).toEqual({
      civText: '攻方：孟加拉',
      techText: '含攻方科技：锻造、铸铁、鼓风炉、攻城技师、派',
      techActive: true,
      armorText: null,
      compareLine: '攻方：孟加拉；含攻方科技：锻造、铸铁、鼓风炉、攻城技师、派',
    });
    expect(
      siegeConditionSummary(ele1746, 'Hindustanis', siegeAttackerTechs(ele1746, 'Hindustanis', ctx), [67, 68, 75, 377], castleArmor, [50, 51], core.techById),
    ).toEqual({
      civText: '攻方：印度斯坦',
      techText: '含攻方科技：锻造、铸铁、鼓风炉、攻城技师',
      techActive: true,
      armorText: '守方：石工术、建筑学',
      compareLine: '攻方：印度斯坦；含攻方科技：锻造、铸铁、鼓风炉、攻城技师；守方：石工术、建筑学',
    });
    expect(siegeConditionSummary(ele1746, '', noCivTechs, [67, 68, 75, 377], castleArmor, [], core.techById)).toMatchObject({
      civText: '攻方：不限文明',
      techText: '含通用攻方科技：锻造、铸铁、鼓风炉、攻城技师',
      techActive: true,
    });
    expect(siegeConditionSummary(ele1746, '', noCivTechs, [], castleArmor, [], core.techById)).toMatchObject({
      techText: '无攻方科技（基础值）',
      techActive: false,
    });
    expect(siegeConditionSummary(ram548, 'Huns', [], [], castleArmor, [], core.techById)).toMatchObject({
      techText: '无适用攻方科技（基础值）',
      techActive: false,
    });
    expect(siegeConditionSummary(cannon, 'Turks', [], [], castleArmor, [], core.techById)).toMatchObject({
      techText: '基础核实值（不含攻方科技）',
      techActive: false,
    });
  });
});
