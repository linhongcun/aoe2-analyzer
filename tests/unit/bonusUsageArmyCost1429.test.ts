import { execFile } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { ARMY_COST_USAGE } from '../../src/data/armyCostUsage';
import { ARMY_RESEARCH } from '../../src/data/armyResearch';
import { CORE } from '../../src/data/core';
import { civs, loadCore, loadTrees } from '../../src/data/index';
import { armyResearchChoices, emptyArmyCost, evaluateArmyCost, researchKey } from '../../src/domain/armyCost';
import { bonusLevel, bonusUsage, showEcoSourceTag, USAGE_TOOL_ZH } from '../../src/domain/bonusUsage';
import { allCivBonuses, civBonuses, type CivBonusEnt } from '../../src/domain/civBonus';
import { DAT } from '../../src/domain/datEffects';
import { productionUnits, PRODUCTION_UNLOCK_TECH_IDS, type ProductionContext } from '../../src/domain/production';
import { PRODUCTION_MODE_LABELS } from '../../src/domain/productionMode';
import BonusBody, { BonusBodyContent } from '../../src/shared/ui/BonusBody';
import { buildArmyCostUsage, formatArmyCostUsageJson } from '../../scripts/army_cost_usage_build';
// @ts-expect-error 纯 JS 脚本，没有类型声明
import { parseImports } from '../../scripts/check-layers.mjs';
import { validateDocument } from '../../scripts/content-schema.mjs';

const ALL = allCivBonuses(civs);
const byId = (id: string): CivBonusEnt => {
  const found = ALL.find((b) => b.id === id);
  if (!found) throw new Error(`Missing bonus ${id}`);
  return found;
};

let ctx: ProductionContext;
beforeAll(async () => {
  await loadCore();
  ctx = { core: CORE, trees: await loadTrees() };
});

const EXPECTED_HALF_TIDS: Readonly<Record<string, readonly number[]>> = {
  'Koreans-2': [211, 212, 219],
  'Burmese-3': [45, 46, 230, 231, 233, 252, 316, 319, 438],
  'Italians-2': [34, 35, 47, 93, 373, 374, 375, 376, 905, 907, 908],
  'Jurchens-3': [239, 321, 377, 980],
  'Turks-2': [47, 376],
  'Burgundians-0': [48, 213, 249],
  'Vietnamese-1': [213, 249],
  'Muisca-4': [48],
  'Chinese-1': [
    22, 34, 35, 39, 45, 46, 47, 48, 52, 67, 68, 74, 75, 76, 77, 80, 81, 82, 93, 96, 98, 100, 197, 199, 200, 201, 207, 209, 211, 212, 213, 215, 217, 219, 222,
    230, 231, 233, 237, 239, 244, 249, 252, 254, 255, 264, 319, 321, 362, 373, 374, 375, 429, 435, 437, 438, 602, 905, 908, 980, 982,
  ],
};

const EXPECTED_HALF_NOTES: Readonly<Record<string, string>> = {
  'Koreans-2': '已计入：射手护甲 3 项按免费计算；警戒箭塔、大型箭塔、炮塔是建筑科技，不在阵容新增费用内',
  'Burmese-3': '已计入：修道院科技按折后价计算；草药不在阵容新增费用内',
  'Italians-2': '已计入：与阵容相关的码头、大学科技按折后价计算；建筑、防御、渔船经济科技和虹吸管、燃烧弹不在阵容新增费用内',
  'Jurchens-3': '已计入：攻城升级木材 -75%；防御工事升级和研究速度 +100% 不在阵容新增费用内',
  'Turks-2': '已计入：化学免费，精锐炮舰升级 -50%；炮塔是建筑科技，不在阵容新增费用内',
  'Burgundians-0':
    '已计入：阵容含村民时计入独轮推车、手推车食物 -40%，含贸易车或贸易船时计入篷车食物 -40%（空阵容保留对应研究时同样折价）；其余经济科技和提前一个时代不在阵容新增费用内',
  'Vietnamese-1': '已计入（阵容含村民，或空阵容保留该研究时）：独轮推车、手推车免木材；其余经济科技和研究速度 +100% 不在阵容新增费用内',
  'Muisca-4': '已计入（阵容含贸易车或贸易船，或空阵容保留该研究时）：篷车免费；行会不在阵容新增费用内',
  'Chinese-1': '已计入：研究费用按方案所选时代 -5/10/15%（封建/城堡/帝王）；升时代科技不在阵容新增费用内',
};

const EXPECTED_GENERIC_NOTES: Readonly<Record<string, string>> = {
  'Bulgarians-0': '已计入：3 项研究按免费计算',
  'Ethiopians-2': '已计入：1 项研究按免费计算',
  'Magyars-2': '已计入：3 项研究按免费计算',
  'Malay-1': '已计入：3 项研究按免费计算',
  'Slavs-1': '已计入：2 项研究按免费计算',
  'Tatars-3': '已计入：2 项研究按免费计算',
  'Turks-1': '已计入：2 项研究按免费计算',
  'Wu-3': '已计入：2 项研究按免费计算',
  'Vikings-0': '已计入（阵容含村民，或空阵容保留该研究时）：2 项研究按免费计算',
  'Bulgarians-1': '已计入：19 项研究按折后价计算',
  'Burgundians-1': '已计入：5 项研究按折后价计算',
  'Danes-2': '已计入：11 项研究按折后价计算',
  'Dravidians-3': '已计入：9 项研究按折后价计算',
  'Khitans-3': '已计入：1 项研究按折后价计算',
  'Poles-3': '已计入：3 项研究按折后价计算',
  'Shu-1': '已计入：10 项研究按折后价计算',
  'Spanish-2': '已计入：11 项研究按折后价计算',
  'Tupi-3': '已计入：10 项研究按折后价计算',
};

// A1 (9: none -> all) + A2 (11: none -> part)
const NEWLY_COUNTED_20 = (
  'Bulgarians-0 Burmese-3 Danes-2 Ethiopians-2 Khitans-3 Koreans-2 Tatars-3 Tupi-3 Wu-3 ' +
  'Bulgarians-1 Burgundians-1 Dravidians-3 Italians-2 Jurchens-3 Magyars-2 Malay-1 Poles-3 Slavs-1 Spanish-2 Turks-2'
).split(' ');

function transitiveClosure(rootFiles: readonly string[]): Set<string> {
  const visited = new Set<string>();
  const queue = [...rootFiles];
  while (queue.length) {
    const rel = queue.shift()!;
    if (visited.has(rel)) continue;
    visited.add(rel);
    if (!/\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/u.test(rel)) continue;
    for (const edge of parseImports(resolve(rel))) {
      if (edge.to && !visited.has(edge.to)) queue.push(edge.to);
    }
  }
  return visited;
}

describe('Issue 1429 全站 56 文明 bonusUsage 接入「阵容新增费用」', () => {
  it('构建期派生索引与真实 evaluateArmyCost() 56 文明 × 4 时代全量 100% 一致（精确 24 国 27 条）', () => {
    const built = buildArmyCostUsage(ctx, ARMY_RESEARCH);
    expect(built).toEqual(ARMY_COST_USAGE);
    expect(formatArmyCostUsageJson(built)).toBe(readFileSync('data/game/army_cost_usage.json', 'utf8'));

    const hitIds = Object.keys(built.bonuses).sort();
    const hitCivs = [...new Set(hitIds.map((id) => id.split('-')[0]!))].sort();
    expect(hitCivs).toHaveLength(24);
    expect(hitIds).toHaveLength(27);

    // 断言 bonusUsage(b) 含 armyCost: true 当且仅当 真实引擎命中的 27 条
    for (const b of ALL) {
      const lines = bonusUsage(b).filter((l) => l.tool === 'armyCost');
      const expected = Object.hasOwn(built.bonuses, b.id);
      if (expected) {
        expect(lines, b.id).toHaveLength(1);
        expect(lines[0]).toMatchObject({
          tool: 'armyCost',
          name: PRODUCTION_MODE_LABELS.army,
          on: true,
          href: `/production?mode=army-cost&civ=${encodeURIComponent(b.civ)}`,
        });
      } else {
        expect(lines, b.id).toEqual([]);
      }
    }
    expect(USAGE_TOOL_ZH.armyCost).toBe(PRODUCTION_MODE_LABELS.army);
  }, 60_000);

  it('自动前置与同批冲突回退：意大利与中国 t:35 在无手选和全可选双配置均有效入账，波希米亚 t:231 同批拒算并单项恢复', () => {
    for (const [civEn, bonusId, expectedWood, expectedGold] of [
      ['Italians', 'Italians-2', 300, 236.25],
      ['Chinese', 'Chinese-1', 340, 267.75],
    ] as const) {
      const units = productionUnits(ctx, { civ: civEn, age: 4, techs: [...PRODUCTION_UNLOCK_TECH_IDS], rows: [], walk: 0, farm: 0 });
      const rows = units.map((u) => ({ unit: u.id, qty: '1' }));
      const shapeCfg = { ...emptyArmyCost(civEn, '4'), rows };
      const choices = armyResearchChoices(ctx, shapeCfg, false, ARMY_RESEARCH);
      // t:35 重型战船不在可选研究列表中，必须从报价账本自动前置提取
      expect(choices).not.toContain(35);

      const shapeEntry = evaluateArmyCost(ctx, shapeCfg, ARMY_RESEARCH).ledger.find((e) => e.id === 35);
      expect(shapeEntry?.status).toBe('planned');
      expect(shapeEntry?.cost).toMatchObject({ Wood: expectedWood, Gold: expectedGold });
      expect(shapeEntry?.cost?.Food ?? 0).toBe(0);
      expect(shapeEntry?.cost?.Stone ?? 0).toBe(0);

      const fullEntry = evaluateArmyCost(ctx, { ...shapeCfg, targets: choices.map(researchKey) }, ARMY_RESEARCH).ledger.find((e) => e.id === 35);
      expect(fullEntry?.status).toBe('planned');
      expect(fullEntry?.cost).toMatchObject({ Wood: expectedWood, Gold: expectedGold });
      expect(fullEntry?.cost?.Food ?? 0).toBe(0);
      expect(fullEntry?.cost?.Stone ?? 0).toBe(0);

      expect(ARMY_COST_USAGE.bonuses[bonusId]?.tids).toContain(35);
    }

    // 波希米亚帝王：t:785 同批遮蔽 t:231 触发 price invalid，单项配置恢复原价 175 金
    const bohUnits = productionUnits(ctx, { civ: 'Bohemians', age: 4, techs: [...PRODUCTION_UNLOCK_TECH_IDS], rows: [], walk: 0, farm: 0 });
    const bohRows = bohUnits.map((u) => ({ unit: u.id, qty: '1' }));
    const bohBase = { ...emptyArmyCost('Bohemians', '4'), rows: bohRows };
    const bohChoices = armyResearchChoices(ctx, bohBase, false, ARMY_RESEARCH);
    expect(bohChoices).toContain(231);
    const full231 = evaluateArmyCost(ctx, { ...bohBase, targets: bohChoices.map(researchKey) }, ARMY_RESEARCH).ledger.find((e) => e.id === 231);
    expect(full231).toMatchObject({ status: 'invalid', problem: 'price' });
    const single231 = evaluateArmyCost(ctx, { ...bohBase, targets: ['t:231'] }, ARMY_RESEARCH).ledger.find((e) => e.id === 231);
    expect(single231).toMatchObject({ status: 'planned', cost: { Gold: 175 } });
  });

  it('4 条经济研究项精确作用域、交叉拒收与空阵容保留研究目标，以及通用模板受益单位一致性', () => {
    // 1) Burgundians-0 交叉拒收：村民(83) -> 213/249 折价、48 拒收；贸易车(128)/贸易船(17) -> 48 折价、213/249 拒收；空阵容保留三项 -> 全折价；纯军事(38) -> 全拒收
    const burgMil = evaluateArmyCost(ctx, { ...emptyArmyCost('Burgundians', '4'), rows: [{ unit: 38, qty: '1' }], targets: ['t:48', 't:213', 't:249'] });
    for (const id of [48, 213, 249]) expect(burgMil.ledger.find((e) => e.id === id)?.status).toBe('invalid');

    const burgVil = evaluateArmyCost(ctx, { ...emptyArmyCost('Burgundians', '4'), rows: [{ unit: 83, qty: '1' }], targets: ['t:48', 't:213', 't:249'] });
    expect(burgVil.ledger.find((e) => e.id === 213)).toMatchObject({ status: 'planned', cost: { Food: 105, Wood: 50 } });
    expect(burgVil.ledger.find((e) => e.id === 249)).toMatchObject({ status: 'planned', cost: { Food: 180, Wood: 200 } });
    expect(burgVil.ledger.find((e) => e.id === 48)?.status).toBe('invalid');

    for (const tradeUnit of [128, 17] as const) {
      const burgTrade = evaluateArmyCost(ctx, {
        ...emptyArmyCost('Burgundians', '4'),
        rows: [{ unit: tradeUnit, qty: '1' }],
        targets: ['t:48', 't:213', 't:249'],
      });
      expect(burgTrade.ledger.find((e) => e.id === 48)).toMatchObject({ status: 'planned', cost: { Food: 120, Gold: 200 } });
      expect(burgTrade.ledger.find((e) => e.id === 213)?.status).toBe('invalid');
      expect(burgTrade.ledger.find((e) => e.id === 249)?.status).toBe('invalid');
    }

    const burgEmpty = evaluateArmyCost(ctx, { ...emptyArmyCost('Burgundians', '4'), rows: [], targets: ['t:48', 't:213', 't:249'] });
    expect(burgEmpty.ledger.find((e) => e.id === 213)).toMatchObject({ status: 'planned', cost: { Food: 105, Wood: 50 } });
    expect(burgEmpty.ledger.find((e) => e.id === 249)).toMatchObject({ status: 'planned', cost: { Food: 180, Wood: 200 } });
    expect(burgEmpty.ledger.find((e) => e.id === 48)).toMatchObject({ status: 'planned', cost: { Food: 120, Gold: 200 } });

    // 2) Vikings-0 / Vietnamese-1 / Muisca-4 三态：纯军事拒收、含对应单位生效、空阵容保留目标生效
    const cases = [
      { civ: 'Vikings', milUnit: 4, okUnits: [83], targets: ['t:213', 't:249'], free: true },
      { civ: 'Vietnamese', milUnit: 4, okUnits: [83], targets: ['t:213', 't:249'], free: false },
      { civ: 'Muisca', milUnit: 4, okUnits: [128, 17], targets: ['t:48'], free: true },
    ] as const;

    for (const tc of cases) {
      const milRes = evaluateArmyCost(ctx, { ...emptyArmyCost(tc.civ, '4'), rows: [{ unit: tc.milUnit, qty: '1' }], targets: [...tc.targets] });
      for (const key of tc.targets) expect(milRes.ledger.find((e) => e.key === key)?.status, `${tc.civ} mil ${key}`).toBe('invalid');

      for (const uid of tc.okUnits) {
        const okRes = evaluateArmyCost(ctx, { ...emptyArmyCost(tc.civ, '4'), rows: [{ unit: uid, qty: '1' }], targets: [...tc.targets] });
        for (const key of tc.targets) {
          const entry = okRes.ledger.find((e) => e.key === key);
          expect(entry?.status, `${tc.civ} unit:${uid} ${key}`).toBe(tc.free ? 'free' : 'planned');
        }
      }

      const emptyRes = evaluateArmyCost(ctx, { ...emptyArmyCost(tc.civ, '4'), rows: [], targets: [...tc.targets] });
      for (const key of tc.targets) {
        const entry = emptyRes.ledger.find((e) => e.key === key);
        expect(entry?.status, `${tc.civ} empty ${key}`).toBe(tc.free ? 'free' : 'planned');
      }
    }

    // 3) 通用模板中 ecoOnlyUnits 非空条目（Vikings-0）：其全部命中研究的受益单位集合必须一致（防未来拆组文案歧义）
    for (const [id, entry] of Object.entries(ARMY_COST_USAGE.bonuses)) {
      if (Object.hasOwn(EXPECTED_HALF_NOTES, id) || !entry.ecoOnlyUnits.length) continue;
      const civEn = id.split('-')[0]!;
      const rows = [83, 128, 17].map((unit) => ({ unit, qty: '1' }));
      const res = evaluateArmyCost(ctx, { ...emptyArmyCost(civEn, '4'), rows, targets: entry.tids.map(researchKey) });
      const perTidUnits = entry.tids.map((tid) => {
        const e = res.ledger.find((x) => x.id === tid)!;
        return e.beneficiaries.map((bi) => rows[bi]!.unit).sort((a, b) => a - b);
      });
      for (const set of perTidUnits) expect(set, `${id} per-tid beneficiaries`).toEqual([...entry.ecoOnlyUnits].sort((a, b) => a - b));
    }
  });

  it('命令级 1 对 1 归属反例：西班牙 t:68 同键团队归零不误归因非团队减半，歧义/缺项/多余命令 fail-closed', () => {
    const spanish = civs.find((c) => c.en === 'Spanish')!;
    const spanishBonuses = civBonuses(spanish);

    // 1) 西班牙 t:68（铸铁）：非团队 Spanish-2 改为 mul 0.5 黄金，团队同时追加 set 0 黄金
    const syntheticData = structuredClone(ARMY_RESEARCH);
    const mods = syntheticData.civs.Spanish!.mods;
    const idx68 = mods.findIndex((m) => m.Type === 101 && m.A === 68 && m.B === 3 && m.C === 0 && m.D === 0);
    expect(idx68).toBeGreaterThanOrEqual(0);
    mods[idx68] = { Type: 101, A: 68, B: 3, C: 2, D: 0.5 };
    mods.push({ Type: 101, A: 68, B: 3, C: 0, D: 0 });

    const syntheticBonuses = spanishBonuses.map((bon) => {
      if (bon.id !== 'Spanish-2') return bon;
      return {
        ...bon,
        dat: bon.dat.map((d) =>
          d.tech >= 0
            ? d
            : {
                ...d,
                eco: d.eco.map((e) => (e.tid === 68 && e.what === '黄金' ? { ...e, op: 'mul', v: 0.5 } : e)),
              },
        ),
      };
    });
    const syntheticTeamEco = [...(DAT.civs.Spanish?.team.eco ?? []), { tech: 'Iron Casting', tid: 68, what: '黄金', op: 'set', v: 0 }];

    // 仅摘除 Spanish-2 的 mul 0.5 命令后，t:68 因团队 set 0 仍是 0 金 -> Spanish-2 不被错误归因，未归属检查必须拦截 t:68
    expect(() =>
      buildArmyCostUsage(ctx, syntheticData, {
        civList: ['Spanish'],
        bonusesByCiv: { Spanish: syntheticBonuses },
        teamEcoByCiv: { Spanish: syntheticTeamEco },
      }),
    ).toThrow(/Spanish.*未归属.*68/u);

    // 2) 同精确签名同时属于非团队与团队 -> 歧义 fail-closed
    const ambData = structuredClone(ARMY_RESEARCH);
    ambData.civs.Spanish!.mods.push({ Type: 101, A: 68, B: 3, C: 0, D: 0 });
    expect(() =>
      buildArmyCostUsage(ctx, ambData, {
        civList: ['Spanish'],
        teamEcoByCiv: { Spanish: syntheticTeamEco },
      }),
    ).toThrow(/同时属于多个来源|无法唯一确定/u);

    // 3) 缺少匹配的 Type=101 命令 -> fail-closed
    const missingData = structuredClone(ARMY_RESEARCH);
    missingData.civs.Spanish!.mods = missingData.civs.Spanish!.mods.filter((_, i) => i !== idx68);
    expect(() => buildArmyCostUsage(ctx, missingData, { civList: ['Spanish'] })).toThrow(/缺少匹配/u);

    // 4) 多余未归属 Type=101 命令 -> fail-closed
    const extraData = structuredClone(ARMY_RESEARCH);
    extraData.civs.Spanish!.mods.push({ Type: 101, A: 68, B: 0, C: 2, D: 0.5 });
    expect(() => buildArmyCostUsage(ctx, extraData, { civList: ['Spanish'] })).toThrow(/未归属/u);
  });

  it('锁定 9 条半覆盖精确 tids/文案、18 条通用模板、工具顺序与 20 条原 none 来源标签消失', () => {
    expect(Object.keys(EXPECTED_HALF_TIDS).sort()).toEqual(Object.keys(EXPECTED_HALF_NOTES).sort());

    for (const [id, expectedTids] of Object.entries(EXPECTED_HALF_TIDS)) {
      expect(ARMY_COST_USAGE.bonuses[id]?.tids, `${id} tids`).toEqual(expectedTids);
      const line = bonusUsage(byId(id)).find((l) => l.tool === 'armyCost');
      expect(line?.note, `${id} note`).toBe(EXPECTED_HALF_NOTES[id]);
    }

    for (const [id, expectedNote] of Object.entries(EXPECTED_GENERIC_NOTES)) {
      const line = bonusUsage(byId(id)).find((l) => l.tool === 'armyCost');
      expect(line?.note, `${id} note`).toBe(expectedNote);
    }

    // 顺序：sim -> gather -> cost -> armyCost -> construction -> repair
    const order = ['sim', 'gather', 'cost', 'armyCost', 'construction', 'repair'];
    for (const b of ALL) {
      const tools = bonusUsage(b).map((l) => l.tool);
      const indices = tools.filter((t) => order.includes(t)).map((t) => order.indexOf(t));
      expect(indices, `${b.id} order`).toEqual([...indices].sort((a, b) => a - b));
    }

    // 原 none 新计入的 20 条全部隐藏来源标签
    expect(NEWLY_COUNTED_20).toHaveLength(20);
    for (const id of NEWLY_COUNTED_20) {
      const b = byId(id);
      expect(showEcoSourceTag(b), `${id} showEcoSourceTag`).toBe(false);
      expect(bonusLevel(b), `${id} bonusLevel`).not.toBe('none');
    }
  });

  it('反例锁定：D 类 14 条、非研究费加成、全部 56 条团队加成、t:104 噪音与 69 条非目标 src=dat 均不误标', () => {
    const dClass14 = (
      'Vietnamese-3 Byzantines-3 Italians-0 Muisca-0 Malay-0 Bohemians-0 Burmese-0 ' +
      'Franks-1 Byzantines-2 Teutons-4 Goths-0 Khitans-2 Chinese-team Portuguese-team'
    ).split(' ');
    const nonDiscount = ['Mapuche-4', 'Armenians-2', 'Burgundians-2', 'Spanish-1', 'Wei-0'];
    for (const id of [...dClass14, ...nonDiscount]) {
      expect(
        bonusUsage(byId(id)).some((l) => l.tool === 'armyCost'),
        id,
      ).toBe(false);
    }

    // 全部 56 条团队加成不输出 armyCost 行
    const teamBonuses = ALL.filter((b) => b.team);
    expect(teamBonuses).toHaveLength(56);
    for (const tb of teamBonuses)
      expect(
        bonusUsage(tb).some((l) => l.tool === 'armyCost'),
        tb.id,
      ).toBe(false);

    // 7 条纯开局经济/升时代加成保持 all 不被误降级
    for (const id of ['Bohemians-0', 'Burmese-0', 'Franks-1', 'Italians-0', 'Malay-0', 'Muisca-0', 'Goths-0']) {
      expect(bonusLevel(byId(id)), id).toBe('all');
    }

    // 全局节点 t:104 仅对勃艮第 755 加价，不触发任何勃艮第加成
    for (const id of Object.keys(ARMY_COST_USAGE.bonuses).filter((k) => k.startsWith('Burgundians-'))) {
      expect(ARMY_COST_USAGE.bonuses[id]!.tids).not.toContain(755);
    }

    // 全部 76 条非团队 src=dat：仅 6 条既有混合 + Turks-1 输出工具行，其余 69 条仍返回 []
    const datNonTeam = ALL.filter((b) => !b.team && b.src === 'dat');
    expect(datNonTeam).toHaveLength(76);
    const datWithUsage = datNonTeam
      .filter((b) => bonusUsage(b).length > 0)
      .map((b) => b.id)
      .sort();
    expect(datWithUsage).toEqual(['Chinese-2', 'Gurjaras-1', 'Mapuche-1', 'Mayans-1', 'Poles-0', 'Sicilians-4', 'Turks-1']);
  });

  it('BonusBody SSR：Turks-1 默认与弹层双端展示 armyCost 行、Franks-2 保持无 busage、通用 .num.nw 包裹生效', () => {
    const turks1 = byId('Turks-1');
    expect(turks1.encoded).toBe(true);
    expect(turks1.src).toBe('dat');

    const turksDetailHtml = renderToStaticMarkup(createElement(StaticRouter, { location: '/civ/Turks/bonus/1' }, createElement(BonusBody, { b: turks1 })));
    expect(turksDetailHtml).toContain('data-usage="armyCost" data-on="true"');
    expect(turksDetailHtml).toContain('href="/production?mode=army-cost&amp;civ=Turks"');
    expect(turksDetailHtml).toContain('<span class="num nw">2 项</span>');

    const turksEvidenceHtml = renderToStaticMarkup(
      createElement(StaticRouter, { location: '/civ/Turks' }, createElement(BonusBodyContent, { b: turks1, core: CORE, variant: 'evidence' })),
    );
    expect(turksEvidenceHtml).toContain('data-usage="armyCost" data-on="true"');
    expect(turksEvidenceHtml).toContain('href="/production?mode=army-cost&amp;civ=Turks"');
    expect(turksEvidenceHtml).toContain('<span class="num nw">2 项</span>');

    const franks2Html = renderToStaticMarkup(
      createElement(StaticRouter, { location: '/civ/Franks/bonus/2' }, createElement(BonusBody, { b: byId('Franks-2') })),
    );
    expect(franks2Html).not.toContain('busage');

    // 通用 .num.nw 包裹代表样本
    const samples: [string, string[]][] = [
      ['Danes-2', ['<span class="num nw">11 项</span>']],
      ['Koreans-2', ['<span class="num nw">3 项</span>']],
      ['Jurchens-3', ['<span class="num nw">-75%</span>', '<span class="num nw">+100%</span>']],
      ['Chinese-1', ['<span class="num nw">-5/10/15%</span>']],
      ['Chinese-2', ['<span class="num nw">15人口</span>']],
      ['Burgundians-0', ['<span class="num nw">-40%</span>']],
    ];
    for (const [id, expectedSpans] of samples) {
      const html = renderToStaticMarkup(
        createElement(StaticRouter, { location: `/civ/${id.replace('-', '/bonus/')}` }, createElement(BonusBody, { b: byId(id) })),
      );
      for (const span of expectedSpans) expect(html, `${id} -> ${span}`).toContain(span);
    }
  });

  it('Schema 严格校验拒绝非法键、空 tids、非法 ecoOnlyUnits 与多余字段', () => {
    const file = 'data/game/army_cost_usage.json';
    const valid = JSON.parse(readFileSync(file, 'utf8'));
    expect(validateDocument(file, valid).valid).toBe(true);

    const badKey = structuredClone(valid);
    badKey.bonuses['Bad-team'] = { tids: [1], allFree: true, ecoOnlyUnits: [] };
    expect(validateDocument(file, badKey).valid).toBe(false);

    const emptyTids = structuredClone(valid);
    emptyTids.bonuses['Danes-2'].tids = [];
    expect(validateDocument(file, emptyTids).valid).toBe(false);

    const badEco = structuredClone(valid);
    badEco.bonuses['Vikings-0'].ecoOnlyUnits = [4];
    expect(validateDocument(file, badEco).valid).toBe(false);

    const extraField = structuredClone(valid);
    extraField.bonuses['Danes-2'].extra = 1;
    expect(validateDocument(file, extraField).valid).toBe(false);
  });

  it('311 KB 包体隔离：目标页面与生成器导入闭包严格解耦', () => {
    const consumerClosure = transitiveClosure([
      'src/domain/bonusUsage.ts',
      'src/shared/ui/BonusBody.tsx',
      'src/features/bonuses/components/BonusList.tsx',
      'src/features/bonuses/components/BonusDetail.tsx',
      'src/features/civs/components/CivDetail.tsx',
      'src/features/civs/components/BonusEvidenceDialog.tsx',
    ]);
    expect(consumerClosure.has('data/game/army_research.json')).toBe(false);
    expect(consumerClosure.has('src/data/armyResearch.ts')).toBe(false);
    expect(consumerClosure.has('src/domain/armyCost.ts')).toBe(false);
    expect(consumerClosure.has('data/game/army_cost_usage.json')).toBe(true);

    const generatorClosure = transitiveClosure(['scripts/army_cost_usage_build.ts']);
    expect(generatorClosure.has('data/game/army_cost_usage.json')).toBe(false);
    expect(generatorClosure.has('src/data/armyCostUsage.ts')).toBe(false);
    expect(generatorClosure.has('src/domain/bonusUsage.ts')).toBe(false);
  });

  it('无默认索引的隔离临时仓库副本冷生成与 --check 一致通过', async () => {
    const execFileAsync = promisify(execFile);
    const tempDir = mkdtempSync(join(tmpdir(), 'army-cost-usage-cold-'));
    try {
      mkdirSync(join(tempDir, 'data'), { recursive: true });
      cpSync(resolve('src'), join(tempDir, 'src'), { recursive: true });
      cpSync(resolve('scripts'), join(tempDir, 'scripts'), { recursive: true });
      cpSync(resolve('data/game'), join(tempDir, 'data/game'), { recursive: true });
      cpSync(resolve('data/sources'), join(tempDir, 'data/sources'), { recursive: true });
      cpSync(resolve('data/patch-notes'), join(tempDir, 'data/patch-notes'), { recursive: true });
      cpSync(resolve('package.json'), join(tempDir, 'package.json'));
      cpSync(resolve('tsconfig.json'), join(tempDir, 'tsconfig.json'));
      cpSync(resolve('vite.config.ts'), join(tempDir, 'vite.config.ts'));
      symlinkSync(resolve('node_modules'), join(tempDir, 'node_modules'));

      const target = join(tempDir, 'data/game/army_cost_usage.json');
      unlinkSync(target);

      const viteNodeBin = resolve('node_modules/.bin/vite-node');
      await expect(execFileAsync(viteNodeBin, ['scripts/army_cost_usage_build.ts', '--check'], { cwd: tempDir })).rejects.toThrow();
      await execFileAsync(viteNodeBin, ['scripts/army_cost_usage_build.ts'], { cwd: tempDir });
      await execFileAsync(viteNodeBin, ['scripts/army_cost_usage_build.ts', '--check'], { cwd: tempDir });

      expect(readFileSync(target, 'utf8')).toBe(readFileSync(resolve('data/game/army_cost_usage.json'), 'utf8'));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, 60_000);
});
