/**
 * Issue #1513：科技触发型文明加成（b.techFx）作用对象、数值示例、不可研究前置过滤、
 * 与 simulator.ts 同源一致性、载荷隔离（不引入 trees.json）及罗马护甲统一呈现单测。
 */
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolve } from 'node:path';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error 纯 JS 脚本，没有类型声明
import { parseImports } from '../../scripts/check-layers.mjs';
import { civByEn, civs, loadCore } from '../../src/data';
import { CORE } from '../../src/data/core';
import {
  allCivBonuses,
  bonusAffects,
  bonusExample,
  bonusUnavailableTechs,
  buildTechByEn,
  civBonuses,
  datEntryUnavailableTechs,
} from '../../src/domain/civBonus';
import { TECH_EFFECTS } from '../../src/domain/effects';
import { simulate } from '../../src/domain/simulator';
import BonusDetail from '../../src/features/bonuses/components/BonusDetail';
import { BonusBodyContent } from '../../src/shared/ui/BonusBody';
import { fmtStat } from '../../src/shared/utils/simFormat';
import { ctx } from './helpers';

const bonusById = (civEn: string, idx: number) => civBonuses(civByEn(civEn)!)[idx]!;
const none = new Set<number>();

beforeAll(async () => {
  await loadCore();
});

describe('#1513 全站 56 文明扫描与兼容契约', () => {
  it('全站 56 文明所有 encoded=true 加成传入 core.techs 时作用对象均非空，6 条 techFx 加成示例均非 null', () => {
    const all = allCivBonuses(civs);
    const techFxBonuses = all.filter((b) => b.techFx.length > 0);
    expect(techFxBonuses.map((b) => b.id).sort()).toEqual(['Aztecs-3', 'Bohemians-3', 'Incas-3', 'Khitans-1', 'Romans-1', 'Varangians-1']);
    expect(techFxBonuses.reduce((n, b) => n + b.techFx.length, 0)).toBe(27);

    for (const b of all.filter((x) => x.encoded)) {
      const aff = bonusAffects(b, CORE.units, CORE.buildings, true, CORE.techs);
      expect(aff.length, `${b.id} bonusAffects`).toBeGreaterThan(0);
    }
    for (const b of techFxBonuses) {
      const ex = bonusExample(b, CORE.units, CORE.buildings, undefined, CORE.techs);
      expect(ex, `${b.id} bonusExample`).not.toBeNull();
      expect(ex!.techBlocks?.length ?? 0, `${b.id} techBlocks`).toBeGreaterThan(0);
    }
  });

  it('不传 techs 时既有调用零破坏：常规加成结果不变，techFx 加成返回空/null', () => {
    const franks2 = bonusById('Franks', 2);
    expect(bonusAffects(franks2, CORE.units, CORE.buildings)).toEqual(bonusAffects(franks2, CORE.units, CORE.buildings, true, CORE.techs));
    expect(bonusExample(franks2, CORE.units, CORE.buildings, 'Paladin')).toEqual(bonusExample(franks2, CORE.units, CORE.buildings, 'Paladin', CORE.techs));
    const varangians1 = bonusById('Varangians', 1);
    expect(bonusAffects(varangians1, CORE.units, CORE.buildings)).toEqual([]);
    expect(bonusExample(varangians1, CORE.units, CORE.buildings)).toBeNull();
  });

  it('冷加载链路静态闭包严禁引入 trees.json 或 useTrees / loadTrees', () => {
    const entries = [
      'src/domain/civBonus.ts',
      'src/domain/civBonusTechFx.ts',
      'src/shared/ui/BonusBody.tsx',
      'src/shared/ui/BonusConditionBlocks.tsx',
      'src/shared/ui/BonusTechAffects.tsx',
      'src/features/civs/components/BonusEvidenceDialog.tsx',
    ];
    for (const file of entries) {
      const text = readFileSync(resolve(file), 'utf8');
      expect(text, `${file} must not reference useTrees or loadTrees`).not.toMatch(/\b(?:useTrees|loadTrees)\b/);
    }
    const transitiveStatic = (roots: string[]) => {
      const seen = new Set<string>();
      const queue = [...roots];
      while (queue.length) {
        const cur = queue.shift()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        if (!/\.(?:ts|tsx|mjs|js)$/.test(cur)) continue;
        for (const edge of parseImports(resolve(cur))) {
          if (edge.typeOnly || edge.dynamic || !edge.to) continue;
          if (!seen.has(edge.to)) queue.push(edge.to);
        }
      }
      return seen;
    };
    const closure = transitiveStatic(entries);
    expect(closure.has('data/game/trees.json')).toBe(false);
    expect([...closure].some((p) => p.includes('trees'))).toBe(false);
  });
});

describe('#1513 全部 6 国科技触发作用对象、禁用前置过滤与数值示例（同源 simulate）', () => {
  it('瓦兰吉人-1：血统（骑兵7+弓兵2）与篷车（船只1+其他1）双块示例精确同源', () => {
    const b = bonusById('Varangians', 1);
    expect(bonusUnavailableTechs(b, CORE.techs)).toEqual([]);
    const aff = bonusAffects(b, CORE.units, CORE.buildings, true, CORE.techs);
    expect(aff.map((g) => [g.group, g.rows.length, g.rows[0]!.units.length, g.rows[0]!.techTrigger?.enhances])).toEqual([
      ['骑兵', 1, 7, true],
      ['弓兵', 1, 2, true],
      ['船只', 1, 1, true],
      ['其他', 1, 1, true],
    ]);

    const ex = bonusExample(b, CORE.units, CORE.buildings, undefined, CORE.techs)!;
    expect(ex.techMode).toBe('enhance');
    expect(ex.techBlocks).toHaveLength(2);
    const [cavBlock, tradeBlock] = ex.techBlocks!;
    expect(cavBlock!.unit.id).toBe(283);
    expect(cavBlock!.rows.map((r) => [r.label, r.baseValues, r.normalValues, r.civValues])).toEqual([
      ['未研究（基础）', [120], [120], [120]],
      ['血统', [120], [140], [150]],
    ]);
    expect(simulate(ctx, CORE.unitById[283]!, 'Varangians', 4, new Set([435]), none).hp).toBe(150);

    expect(tradeBlock!.unit.id).toBe(128);
    expect(tradeBlock!.rows[1]!.isMul).toBe(true);
    expect(fmtStat('spd', tradeBlock!.rows[0]!.baseValues[0]!)).toBe('1.25');
    expect(fmtStat('spd', tradeBlock!.rows[1]!.normalValues![0]!)).toBe('1.50');
    expect(fmtStat('spd', tradeBlock!.rows[1]!.civValues[0]!)).toBe('1.63');
    expect(tradeBlock!.rows[1]!.civValues[0]).toBeCloseTo(simulate(ctx, CORE.unitById[128]!, 'Varangians', 4, new Set([48]), none).spd, 8);
  });

  it('契丹-1：仅锻造/铸铁覆盖 21 单位，排除不可研究的 75 鼓风炉，重装骆驼兵 7 到 8/9 到 9/11', () => {
    const b = bonusById('Khitans', 1);
    const unavail = bonusUnavailableTechs(b, CORE.techs);
    expect(unavail.map((t) => [t.id, t.zh])).toEqual([[75, '鼓风炉']]);
    const aff = bonusAffects(b, CORE.units, CORE.buildings, true, CORE.techs);
    expect(aff.map((g) => [g.group, g.rows[0]!.units.length])).toEqual([
      ['步兵', 11],
      ['骑兵', 7],
      ['船只', 3],
    ]);
    const techIds = aff.flatMap((g) => g.rows.flatMap((r) => r.techTrigger!.techs.map((x) => x.tech.id)));
    expect(new Set(techIds)).toEqual(new Set([67, 68]));
    expect(techIds).not.toContain(75);

    const ex = bonusExample(b, CORE.units, CORE.buildings, undefined, CORE.techs)!;
    expect(ex.techMode).toBe('enhance');
    expect(ex.unavailableTechs?.map((t) => t.id)).toEqual([75]);
    const blk = ex.techBlocks![0]!;
    expect(blk.unit.id).toBe(330);
    expect(blk.rows.map((r) => [r.label, r.normalValues, r.civValues])).toEqual([
      ['未研究（基础）', [7], [7]],
      ['锻造', [8], [9]],
      ['锻造 + 铸铁', [9], [11]],
    ]);
    expect(blk.rows.flatMap((r) => r.techs.map((t) => t.id))).not.toContain(75);
    expect(simulate(ctx, CORE.unitById[330]!, 'Khitans', 4, new Set([67]), none).atk).toBe(9);
    expect(simulate(ctx, CORE.unitById[330]!, 'Khitans', 4, new Set([67, 68]), none).atk).toBe(11);

    const techByEn = buildTechByEn(CORE.techs);
    const bfDat = b.dat.find((d) => d.req.includes('Blast Furnace'))!;
    expect(datEntryUnavailableTechs(bfDat.req, b, techByEn).map((t) => t.id)).toEqual([75]);
  });

  it('罗马-1：承接 #710 护甲累计与边界核验（7 步兵、排除 77 步兵钢甲、罗马军 2/2 到 4/4 到 6/6、输入不变与变异传播）', () => {
    const b = bonusById('Romans', 1);
    const snapshot = structuredClone({ units: CORE.units, techs: CORE.techs });
    const unavail = bonusUnavailableTechs(b, CORE.techs);
    expect(unavail.map((t) => [t.id, t.zh])).toEqual([[77, '步兵钢甲']]);

    const aff = bonusAffects(b, CORE.units, CORE.buildings, true, CORE.techs);
    expect(aff).toHaveLength(1);
    expect(aff[0]!.group).toBe('步兵');
    expect(aff[0]!.rows).toHaveLength(1);
    const row = aff[0]!.rows[0]!;
    expect(row.techTrigger?.techs.map((x) => x.tech.id)).toEqual([74, 76]);
    expect(row.techTrigger?.enhances).toBe(true);
    expect(row.units.map((u) => u.id).sort((a, z) => a - z)).toEqual([74, 75, 77, 93, 358, 359, 1793]);

    const ex = bonusExample(b, CORE.units, CORE.buildings, undefined, CORE.techs)!;
    expect(ex.techMode).toBe('enhance');
    expect(ex.unavailableTechs?.map((t) => t.id)).toEqual([77]);
    const blk = ex.techBlocks![0]!;
    expect(blk.unit.id).toBe(1793);
    expect(blk.rows.map((r) => [r.label, r.normalValues, r.civValues])).toEqual([
      ['未研究（基础）', [2, 2], [2, 2]],
      ['步兵鳞甲', [3, 3], [4, 4]],
      ['步兵鳞甲 + 步兵锁甲', [4, 4], [6, 6]],
    ]);
    const s1 = simulate(ctx, CORE.unitById[1793]!, 'Romans', 4, new Set([74]), none);
    const s2 = simulate(ctx, CORE.unitById[1793]!, 'Romans', 4, new Set([74, 76]), none);
    expect([s1.ma, s1.pa]).toEqual([4, 4]);
    expect([s2.ma, s2.pa]).toEqual([6, 6]);
    expect({ units: CORE.units, techs: CORE.techs }).toEqual(snapshot);

    // 基础护甲变更与 fresh=false 均准确跟随
    const mutatedUnits = structuredClone(CORE.units);
    mutatedUnits.find((u) => u.id === 1793)!.ma = 9;
    expect(bonusExample(b, mutatedUnits, CORE.buildings, undefined, CORE.techs)!.techBlocks![0]!.rows.map((r) => r.civValues[0])).toEqual([9, 11, 13]);
    expect(bonusExample({ ...b, fresh: false }, CORE.units, CORE.buildings, undefined, CORE.techs)).toEqual(ex);

    // 前置不可研究时下游锁甲不得越级计入累计链
    const noScaleTechs = structuredClone(CORE.techs);
    const scaleTech = noScaleTechs.find((t) => t.id === 74)!;
    scaleTech.civs = scaleTech.civs.filter((c) => c !== 'Romans');
    const brokenEx = bonusExample(b, CORE.units, CORE.buildings, undefined, noScaleTechs);
    expect(brokenEx).toBeNull();

    // 普通效果 add/mul/set 变异逐阶段跟随
    const scaleEn = CORE.techById[74]!.en;
    const chainEn = CORE.techById[76]!.en;
    const savedScale = TECH_EFFECTS[scaleEn]!;
    const savedChain = TECH_EFFECTS[chainEn]!;
    try {
      TECH_EFFECTS[scaleEn] = [
        [
          () => true,
          [
            { s: 'ma', op: 'add', v: 3 },
            { s: 'pa', op: 'add', v: 4 },
          ],
        ],
      ];
      TECH_EFFECTS[chainEn] = [
        [
          () => true,
          [
            { s: 'ma', op: 'mul', v: 2 },
            { s: 'pa', op: 'set', v: 10 },
          ],
        ],
      ];
      const mutated = bonusExample(b, CORE.units, CORE.buildings, undefined, CORE.techs)!.techBlocks![0]!;
      expect(mutated.rows.map((r) => r.civValues)).toEqual([
        [2, 2],
        [6, 7],
        [13, 11],
      ]);
    } finally {
      TECH_EFFECTS[scaleEn] = savedScale;
      TECH_EFFECTS[chainEn] = savedChain;
    }
  });

  it('印加-3：4 行作用对象带城堡起延迟标识，攻击链 3 到 4 到 5 到 7 与护甲链 0/0 到 1/1 到 2/2 到 3/4', () => {
    const b = bonusById('Incas', 3);
    const aff = bonusAffects(b, CORE.units, CORE.buildings, true, CORE.techs);
    expect(aff).toHaveLength(1);
    expect(aff[0]!.rows).toHaveLength(4);
    expect(aff[0]!.rows[0]!.techTrigger?.techs.map((x) => [x.tech.id, x.delayAge])).toEqual([
      [67, 3],
      [68, null],
    ]);
    expect(aff[0]!.rows[2]!.techTrigger?.techs.map((x) => [x.tech.id, x.delayAge])).toEqual([
      [74, 3],
      [76, null],
    ]);

    const ex = bonusExample(b, CORE.units, CORE.buildings, undefined, CORE.techs)!;
    expect(ex.techMode).toBe('chain');
    expect(ex.techBlocks).toHaveLength(2);
    const [atkBlk, armBlk] = ex.techBlocks!;
    expect(atkBlk!.unit.id).toBe(83);
    expect(atkBlk!.delayAge).toBe(3);
    expect(atkBlk!.rows.map((r) => [r.label, r.delayAge, r.civValues])).toEqual([
      ['未研究（基础）', null, [3]],
      ['锻造', 3, [4]],
      ['锻造 + 铸铁', null, [5]],
      ['锻造 + 铸铁 + 鼓风炉', null, [7]],
    ]);
    expect(armBlk!.rows.map((r) => [r.label, r.delayAge, r.civValues])).toEqual([
      ['未研究（基础）', null, [0, 0]],
      ['步兵鳞甲', 3, [1, 1]],
      ['步兵鳞甲 + 步兵锁甲', null, [2, 2]],
      ['步兵鳞甲 + 步兵锁甲 + 步兵钢甲', null, [3, 4]],
    ]);
    const simAll = simulate(ctx, CORE.unitById[83]!, 'Incas', 4, new Set([67, 68, 75, 74, 76, 77]), none);
    expect([simAll.atk, simAll.ma, simAll.pa]).toEqual([7, 3, 4]);
  });

  it('波希米亚-3：2 行作用对象，村民独立科技示例（圣洁 25 到 40、狂热 0.80 到 0.92）', () => {
    const b = bonusById('Bohemians', 3);
    const aff = bonusAffects(b, CORE.units, CORE.buildings, true, CORE.techs);
    expect(aff[0]!.rows.map((r) => [r.techTrigger!.techs[0]!.tech.id, r.effect])).toEqual([
      [231, '生命值 +15'],
      [252, '移动速度 +15%'],
    ]);
    const ex = bonusExample(b, CORE.units, CORE.buildings, undefined, CORE.techs)!;
    expect(ex.techMode).toBe('independent');
    expect(ex.techBlocks).toHaveLength(1);
    const rows = ex.techBlocks![0]!.rows;
    expect(rows[0]!.baseValues).toEqual([25]);
    expect(rows[0]!.civValues).toEqual([40]);
    expect(fmtStat('spd', rows[1]!.baseValues[0]!)).toBe('0.80');
    expect(fmtStat('spd', rows[1]!.civValues[0]!)).toBe('0.92');
    const sim = simulate(ctx, CORE.unitById[83]!, 'Bohemians', 4, new Set([231, 252]), none);
    expect(sim.hp).toBe(40);
    expect(fmtStat('spd', sim.spd)).toBe('0.92');
  });

  it('阿兹特克-3：11 项修道院科技合并 1 行（城堡 7 · 帝王 4，全研额外 +55），僧侣 30/35/85 与圣洁 +15 到 100 透明注记', () => {
    const b = bonusById('Aztecs', 3);
    const aff = bonusAffects(b, CORE.units, CORE.buildings, true, CORE.techs);
    expect(aff).toHaveLength(1);
    expect(aff[0]!.rows).toHaveLength(1);
    const meta = aff[0]!.rows[0]!.techTrigger!;
    expect(meta.techs).toHaveLength(11);
    expect(meta.enhances).toBe(false);
    expect(meta.ageCounts).toEqual([
      { age: 3, count: 7 },
      { age: 4, count: 4 },
    ]);
    expect(meta.totalAddText).toBe('+55');

    const ex = bonusExample(b, CORE.units, CORE.buildings, undefined, CORE.techs)!;
    expect(ex.techMode).toBe('stack');
    const blk = ex.techBlocks![0]!;
    expect(blk.unit.id).toBe(125);
    expect(blk.rows.map((r) => [r.label, r.baseValues, r.civValues])).toEqual([
      ['未研究', [30], [30]],
      ['任选 1 项', [30], [35]],
      ['全研 11 项', [30], [85]],
    ]);
    expect(blk.selfOverlap).toMatchObject({ buildingZh: '修道院', perTechAdd: 5, combinedTotal: 100, stat: 'hp' });
    expect(blk.selfOverlap!.selfTechs.map((s) => [s.tech.id, s.delta])).toEqual([[231, 15]]);
    expect(simulate(ctx, CORE.unitById[125]!, 'Aztecs', 4, new Set(meta.techs.map((x) => x.tech.id)), none).hp).toBe(100);
  });
});

describe('#1513 SSR 渲染：双入口一致、消除隐性缺陷与退役 RomanArmor710', () => {
  it('6 国双变体零「暂无结构化对象明细」；印加无误标帝王时代数值；契丹/罗马原始记录提示不可研究前置', () => {
    for (const [civEn, idx] of [
      ['Varangians', 1],
      ['Khitans', 1],
      ['Romans', 1],
      ['Incas', 3],
      ['Bohemians', 3],
      ['Aztecs', 3],
    ] as const) {
      const b = bonusById(civEn, idx);
      for (const variant of ['default', 'evidence'] as const) {
        const html = renderToStaticMarkup(
          createElement(StaticRouter, { location: `/civ/${civEn}` }, createElement(BonusBodyContent, { b, core: CORE, variant })),
        );
        expect(html, `${b.id} ${variant}`).not.toContain('暂无结构化对象明细');
        expect(html, `${b.id} ${variant}`).toContain('data-t="bonus-tech-example"');
        if (b.id === 'Incas-3') expect(html, `${b.id} ${variant}`).not.toContain('（帝王时代数值）');
        if (b.id === 'Khitans-1') {
          expect(html, `${b.id} ${variant}`).toContain('契丹无法研究');
          expect(html, `${b.id} ${variant}`).toContain('前置科技「鼓风炉」本文明无法研究');
        }
        if (b.id === 'Romans-1') {
          expect(html, `${b.id} ${variant}`).toContain('罗马无法研究');
          expect(html, `${b.id} ${variant}`).toContain('前置科技「步兵钢甲」本文明无法研究');
        }
        if (b.id === 'Aztecs-3') {
          expect(html, `${b.id} ${variant}`).toContain('data-t="bonus-tech-list"');
          expect(html, `${b.id} ${variant}`).toContain('data-t="bonus-tech-self-note"');
          expect(html, `${b.id} ${variant}`).toContain('100 生命值');
        }
      }
    }
  });

  it('罗马-1 详情页已移除旧 <RomanArmor710 /> 专版，统一使用通用科技触发组件', () => {
    const html = renderToStaticMarkup(
      createElement(
        StaticRouter,
        { location: '/civ/Romans/bonus/1' },
        createElement(Routes, null, createElement(Route, { path: '/civ/:en/bonus/:idx', element: createElement(BonusDetail) })),
      ),
    );
    expect(html).not.toContain('aria-label="步兵护甲科技对照"');
    expect(html).not.toContain('data-armor-tech');
    expect(html).toContain('data-t="bonus-tech-example"');
    expect(html).toContain('罗马军');
    expect(html).toContain('6/6');
    expect(html).toContain('罗马无法研究');
  });
});
