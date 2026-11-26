import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { ARMY_COST_USAGE } from '../../src/data/armyCostUsage';
import { ARMY_RESEARCH } from '../../src/data/armyResearch';
import { CORE } from '../../src/data/core';
import { civs, loadCore, loadTrees } from '../../src/data/index';
import { ARMY_RES, armyResearchChoices, emptyArmyCost, evaluateArmyCost, researchKey } from '../../src/domain/armyCost';
import { bonusLevel, bonusUsage, showEcoSourceTag, USAGE_TOOL_ZH } from '../../src/domain/bonusUsage';
import { allCivBonuses, type CivBonusEnt } from '../../src/domain/civBonus';
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
  it('构建期派生索引与直接实跑 56 文明 × 4 时代原始 evaluateArmyCost() 100% 独立对账（24 国 27 条）', () => {
    const built = buildArmyCostUsage(ctx, ARMY_RESEARCH);
    expect(built).toEqual(ARMY_COST_USAGE);
    expect(formatArmyCostUsageJson(built)).toBe(readFileSync('data/game/army_cost_usage.json', 'utf8'));

    const hitIds = Object.keys(ARMY_COST_USAGE.bonuses).sort();
    const expectedIds = [...Object.keys(EXPECTED_HALF_NOTES), ...Object.keys(EXPECTED_GENERIC_NOTES)].sort();
    expect(hitIds).toEqual(expectedIds);
    const hitCivs = [...new Set(hitIds.map((id) => id.split('-')[0]!))].sort();
    expect(hitCivs).toHaveLength(24);
    expect(hitIds).toHaveLength(27);

    // 独立于生成器直接实跑全站 56 文明 × 4 时代 evaluateArmyCost()，核对每国被动折价研究并集与索引逐项一致
    const rawDiscountedByCiv: Record<string, number[]> = {};
    for (const c of civs) {
      const civTids = new Set<number>();
      for (const age of [1, 2, 3, 4]) {
        const rows = productionUnits(ctx, { civ: c.en, age, techs: [...PRODUCTION_UNLOCK_TECH_IDS], rows: [], walk: 0, farm: 0 }).map((u) => ({
          unit: u.id,
          qty: '1',
        }));
        const shapeCfg = { ...emptyArmyCost(c.en, String(age)), rows };
        const choices = armyResearchChoices(ctx, shapeCfg, false, ARMY_RESEARCH);
        const fullCfg = { ...shapeCfg, targets: choices.map(researchKey) };
        const results = [evaluateArmyCost(ctx, shapeCfg, ARMY_RESEARCH), evaluateArmyCost(ctx, fullCfg, ARMY_RESEARCH)];
        for (const tid of choices) {
          const entry = results[1]!.ledger.find((e) => e.id === tid);
          if (entry?.status === 'invalid' && entry.problem === 'price') {
            results.push(evaluateArmyCost(ctx, { ...shapeCfg, targets: [researchKey(tid)] }, ARMY_RESEARCH));
          }
        }
        for (const res of results) {
          for (const e of res.ledger) {
            if (e.id === null || e.status === 'invalid' || !e.quote?.cost || !e.quote.baseCost) continue;
            const cheaper =
              ARMY_RES.every((r) => (e.quote!.cost![r] ?? 0) <= (e.quote!.baseCost![r] ?? 0) + 1e-9) &&
              ARMY_RES.some((r) => (e.quote!.cost![r] ?? 0) < (e.quote!.baseCost![r] ?? 0) - 1e-9);
            if (cheaper) civTids.add(e.id);
          }
        }
      }
      if (civTids.size) rawDiscountedByCiv[c.en] = [...civTids].sort((a, b) => a - b);
    }

    const indexTidsByCiv: Record<string, number[]> = {};
    for (const [id, entry] of Object.entries(ARMY_COST_USAGE.bonuses)) {
      const civEn = id.split('-')[0]!;
      const merged = new Set([...(indexTidsByCiv[civEn] ?? []), ...entry.tids]);
      indexTidsByCiv[civEn] = [...merged].sort((a, b) => a - b);
    }
    expect(rawDiscountedByCiv).toEqual(indexTidsByCiv);

    for (const b of ALL) {
      const lines = bonusUsage(b).filter((l) => l.tool === 'armyCost');
      if (Object.hasOwn(ARMY_COST_USAGE.bonuses, b.id)) {
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

    const bohUnits = productionUnits(ctx, { civ: 'Bohemians', age: 4, techs: [...PRODUCTION_UNLOCK_TECH_IDS], rows: [], walk: 0, farm: 0 });
    const bohBase = { ...emptyArmyCost('Bohemians', '4'), rows: bohUnits.map((u) => ({ unit: u.id, qty: '1' })) };
    const bohChoices = armyResearchChoices(ctx, bohBase, false, ARMY_RESEARCH);
    expect(bohChoices).toContain(231);
    const full231 = evaluateArmyCost(ctx, { ...bohBase, targets: bohChoices.map(researchKey) }, ARMY_RESEARCH).ledger.find((e) => e.id === 231);
    expect(full231).toMatchObject({ status: 'invalid', problem: 'price' });
    const single231 = evaluateArmyCost(ctx, { ...bohBase, targets: ['t:231'] }, ARMY_RESEARCH).ledger.find((e) => e.id === 231);
    expect(single231).toMatchObject({ status: 'planned', cost: { Gold: 175 } });
  });

  it('4 条经济研究项精确作用域、交叉拒收与空阵容保留研究目标，以及通用模板受益单位一致性', () => {
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
          expect(okRes.ledger.find((e) => e.key === key)?.status, `${tc.civ} unit:${uid} ${key}`).toBe(tc.free ? 'free' : 'planned');
        }
      }

      const emptyRes = evaluateArmyCost(ctx, { ...emptyArmyCost(tc.civ, '4'), rows: [], targets: [...tc.targets] });
      for (const key of tc.targets) {
        expect(emptyRes.ledger.find((e) => e.key === key)?.status, `${tc.civ} empty ${key}`).toBe(tc.free ? 'free' : 'planned');
      }
    }

    for (const [id, entry] of Object.entries(ARMY_COST_USAGE.bonuses)) {
      if (Object.hasOwn(EXPECTED_HALF_NOTES, id) || !entry.ecoOnlyUnits.length) continue;
      const civEn = id.split('-')[0]!;
      const rows = [83, 128, 17].map((unit) => ({ unit, qty: '1' }));
      const res = evaluateArmyCost(ctx, { ...emptyArmyCost(civEn, '4'), rows, targets: entry.tids.map(researchKey) });
      for (const tid of entry.tids) {
        const units = res.ledger
          .find((x) => x.id === tid)!
          .beneficiaries.map((bi) => rows[bi]!.unit)
          .sort((a, b) => a - b);
        expect(units, `${id} t:${tid} beneficiaries`).toEqual([...entry.ecoOnlyUnits].sort((a, b) => a - b));
      }
    }
  });

  it('锁定 9 条半覆盖精确 tids/文案、18 条通用模板、工具顺序与 20 条原 none 来源标签消失', () => {
    expect(Object.keys(EXPECTED_HALF_TIDS).sort()).toEqual(Object.keys(EXPECTED_HALF_NOTES).sort());

    for (const [id, expectedTids] of Object.entries(EXPECTED_HALF_TIDS)) {
      expect(ARMY_COST_USAGE.bonuses[id]?.tids, `${id} tids`).toEqual(expectedTids);
      expect(bonusUsage(byId(id)).find((l) => l.tool === 'armyCost')?.note, `${id} note`).toBe(EXPECTED_HALF_NOTES[id]);
    }
    for (const [id, expectedNote] of Object.entries(EXPECTED_GENERIC_NOTES)) {
      expect(bonusUsage(byId(id)).find((l) => l.tool === 'armyCost')?.note, `${id} note`).toBe(expectedNote);
    }

    const order = ['sim', 'gather', 'cost', 'armyCost', 'construction', 'repair'];
    for (const b of ALL) {
      const indices = bonusUsage(b)
        .map((l) => l.tool)
        .filter((t) => order.includes(t))
        .map((t) => order.indexOf(t));
      expect(indices, `${b.id} order`).toEqual([...indices].sort((a, b) => a - b));
    }

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

    const teamBonuses = ALL.filter((b) => b.team);
    expect(teamBonuses).toHaveLength(56);
    for (const tb of teamBonuses) {
      expect(
        bonusUsage(tb).some((l) => l.tool === 'armyCost'),
        tb.id,
      ).toBe(false);
    }

    for (const id of ['Bohemians-0', 'Burmese-0', 'Franks-1', 'Italians-0', 'Malay-0', 'Muisca-0', 'Goths-0']) {
      expect(bonusLevel(byId(id)), id).toBe('all');
    }

    for (const id of Object.keys(ARMY_COST_USAGE.bonuses).filter((k) => k.startsWith('Burgundians-'))) {
      expect(ARMY_COST_USAGE.bonuses[id]!.tids).not.toContain(755);
    }

    const datNonTeam = ALL.filter((b) => !b.team && b.src === 'dat');
    expect(datNonTeam).toHaveLength(76);
    const datWithUsage = datNonTeam
      .filter((b) => bonusUsage(b).length > 0)
      .map((b) => b.id)
      .sort();
    expect(datWithUsage).toEqual(['Chinese-2', 'Gurjaras-1', 'Mapuche-1', 'Mayans-1', 'Poles-0', 'Sicilians-4', 'Turks-1']);
  });

  it('BonusBody SSR：Turks-1 双端展示、Franks-2 保持无 busage、全站 281 条工具说明零裸数字遗漏', () => {
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

    const samples: [string, string[]][] = [
      ['Danes-2', ['<span class="num nw">11 项</span>']],
      ['Koreans-2', ['<span class="num nw">3 项</span>']],
      ['Jurchens-3', ['<span class="num nw">8套开局</span>', '<span class="num nw">-75%</span>', '<span class="num nw">+100%</span>']],
      ['Chinese-1', ['<span class="num nw">-5/10/15%</span>']],
      ['Chinese-2', ['<span class="num nw">6村民</span>', '<span class="num nw">15人口</span>']],
      ['Gurjaras-1', ['<span class="num nw">8套模板</span>']],
      ['Burgundians-0', ['<span class="num nw">-40%</span>']],
    ];
    for (const [id, expectedSpans] of samples) {
      const html = renderToStaticMarkup(
        createElement(StaticRouter, { location: `/civ/${id.replace('-', '/bonus/')}` }, createElement(BonusBody, { b: byId(id) })),
      );
      for (const span of expectedSpans) expect(html, `${id} -> ${span}`).toContain(span);
    }

    // 全站 281 条加成：凡 .busage li 渲染含数字的工具行，去掉 <span class="num nw">...</span> 与标签后不得残留裸数字
    for (const b of ALL) {
      if (!bonusUsage(b).some((l) => /\d/.test(l.note))) continue;
      const html = renderToStaticMarkup(createElement(StaticRouter, { location: `/civ/${b.civ}` }, createElement(BonusBody, { b })));
      const ulMatch = /<div class="note busage">[\s\S]*?<ul>([\s\S]*?)<\/ul>/u.exec(html);
      expect(ulMatch, b.id).toBeTruthy();
      const withoutWrapped = ulMatch![1]!.replace(/<span class="num nw">[^<]*<\/span>/gu, '').replace(/<[^>]+>/gu, '');
      expect(withoutWrapped, `${b.id} unwrapped digits: ${withoutWrapped}`).not.toMatch(/\d/u);
    }
  });

  it('Schema 严格校验与 311 KB 包体导入闭包隔离', () => {
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
});
