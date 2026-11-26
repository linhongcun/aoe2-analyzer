import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { ARMY_RESEARCH } from '../../src/data/armyResearch';
import { CORE } from '../../src/data/core';
import { civs, loadCore, loadTrees } from '../../src/data/index';
import { armyResearchChoices, emptyArmyCost, evaluateArmyCost, researchKey } from '../../src/domain/armyCost';
import { civBonuses } from '../../src/domain/civBonus';
import { DAT } from '../../src/domain/datEffects';
import { productionUnits, PRODUCTION_UNLOCK_TECH_IDS, type ProductionContext } from '../../src/domain/production';
import { buildArmyCostUsage } from '../../scripts/army_cost_usage_build';

let ctx: ProductionContext;
beforeAll(async () => {
  await loadCore();
  ctx = { core: CORE, trees: await loadTrees() };
});

describe('Issue 1429 生成器归属守卫、单项回退与 CLI 无副作用入口', () => {
  it('命令级 1 对 1 归属反例：团队归零隔离、容差内跨分桶歧义、中点命令歧义、缺项与多余命令均 fail-closed', () => {
    const spanish = civs.find((c) => c.en === 'Spanish')!;
    const spanishBonuses = civBonuses(spanish);
    const baseIdx68 = ARMY_RESEARCH.civs.Spanish!.mods.findIndex((m) => m.Type === 101 && m.A === 68 && m.B === 3 && m.C === 0 && m.D === 0);
    expect(baseIdx68).toBeGreaterThanOrEqual(0);

    const patchSpanish68 = (op: string, v: number) =>
      spanishBonuses.map((bon) =>
        bon.id !== 'Spanish-2'
          ? bon
          : {
              ...bon,
              dat: bon.dat.map((d) => (d.tech >= 0 ? d : { ...d, eco: d.eco.map((e) => (e.tid === 68 && e.what === '黄金' ? { ...e, op, v } : e)) })),
            },
      );

    // 1) 西班牙 t:68：非团队 mul 0.5 黄金 + 团队 set 0 黄金 -> 仅摘除非团队后仍是 0 金，未归属守卫必须拦截 t:68
    const maskedData = structuredClone(ARMY_RESEARCH);
    maskedData.civs.Spanish!.mods[baseIdx68] = { Type: 101, A: 68, B: 3, C: 2, D: 0.5 };
    maskedData.civs.Spanish!.mods.push({ Type: 101, A: 68, B: 3, C: 0, D: 0 });
    expect(() =>
      buildArmyCostUsage(ctx, maskedData, {
        civList: ['Spanish'],
        bonusesByCiv: { Spanish: patchSpanish68('mul', 0.5) },
        teamEcoByCiv: { Spanish: [...(DAT.civs.Spanish?.team.eco ?? []), { tech: 'Iron Casting', tid: 68, what: '黄金', op: 'set', v: 0 }] },
      }),
    ).toThrow(/Spanish.*未归属.*68/u);

    // 2) 容差内跨 Math.round 分桶歧义：非团队 0.500000 与团队 0.500008（差 8e-6 <= 1e-5）必须报错
    const tolData = structuredClone(ARMY_RESEARCH);
    tolData.civs.Spanish!.mods[baseIdx68] = { Type: 101, A: 68, B: 3, C: 2, D: 0.5 };
    tolData.civs.Spanish!.mods.push({ Type: 101, A: 68, B: 3, C: 2, D: 0.500008 });
    expect(() =>
      buildArmyCostUsage(ctx, tolData, {
        civList: ['Spanish'],
        bonusesByCiv: { Spanish: patchSpanish68('mul', 0.5) },
        teamEcoByCiv: { Spanish: [...(DAT.civs.Spanish?.team.eco ?? []), { tech: 'Iron Casting', tid: 68, what: '黄金', op: 'mul', v: 0.500008 }] },
      }),
    ).toThrow(/容差内同时|来源无法唯一确定/u);

    // 3) 中点实际命令歧义：预期相差 1.5e-5（0.500000 vs 0.500015），但实际命令 D=0.500007 同时落在两者 1e-5 容差内
    const midData = structuredClone(ARMY_RESEARCH);
    midData.civs.Spanish!.mods[baseIdx68] = { Type: 101, A: 68, B: 3, C: 2, D: 0.500007 };
    midData.civs.Spanish!.mods.push({ Type: 101, A: 68, B: 3, C: 2, D: 0.500015 });
    expect(() =>
      buildArmyCostUsage(ctx, midData, {
        civList: ['Spanish'],
        bonusesByCiv: { Spanish: patchSpanish68('mul', 0.5) },
        teamEcoByCiv: { Spanish: [...(DAT.civs.Spanish?.team.eco ?? []), { tech: 'Iron Casting', tid: 68, what: '黄金', op: 'mul', v: 0.500015 }] },
      }),
    ).toThrow(/同时匹配多个来源|来源无法唯一确定/u);

    // 4) 缺少匹配命令 & 多余未归属命令 -> fail-closed
    const missingData = structuredClone(ARMY_RESEARCH);
    missingData.civs.Spanish!.mods = missingData.civs.Spanish!.mods.filter((_, i) => i !== baseIdx68);
    expect(() => buildArmyCostUsage(ctx, missingData, { civList: ['Spanish'] })).toThrow(/缺少匹配/u);

    const extraData = structuredClone(ARMY_RESEARCH);
    extraData.civs.Spanish!.mods.push({ Type: 101, A: 68, B: 0, C: 2, D: 0.5 });
    expect(() => buildArmyCostUsage(ctx, extraData, { civList: ['Spanish'] })).toThrow(/未归属/u);
  });

  it('按时代/配置粒度与联合摘除防掩盖：帝王非团队折价不得掩盖城堡团队未归属折价，同龄叠加残余折价亦被拦截', () => {
    const spanish = civs.find((c) => c.en === 'Spanish')!;
    const spanishBonuses = civBonuses(spanish);
    const baseIdx68 = ARMY_RESEARCH.civs.Spanish!.mods.findIndex((m) => m.Type === 101 && m.A === 68 && m.B === 3 && m.C === 0 && m.D === 0);

    // 1) 跨时代反例：城堡时代仅团队 mul 0.5（120 -> 60 金），帝王时代新增正节点非团队 mul 0.5（60 -> 30 金）
    const crossAgeData = structuredClone(ARMY_RESEARCH);
    crossAgeData.civs.Spanish!.mods[baseIdx68] = { Type: 101, A: 68, B: 3, C: 2, D: 0.5 };
    crossAgeData.nodes['99901'] = {
      name: 'Synthetic Imp Iron Casting Discount',
      civ: crossAgeData.civs.Spanish!.id,
      location: 0,
      cost: [],
      time: 0,
      requires: [103],
      count: 1,
      mods: [{ Type: 101, A: 68, B: 3, C: 2, D: 0.5 }],
      upgrades: [],
      combatUnits: [],
      enables: [],
    };
    const crossAgeBonuses = spanishBonuses.map((bon) =>
      bon.id !== 'Spanish-2'
        ? bon
        : {
            ...bon,
            dat: [
              ...bon.dat.map((d) => (d.tech >= 0 ? d : { ...d, eco: d.eco.filter((e) => !(e.tid === 68 && e.what === '黄金')) })),
              {
                tech: 99901,
                name: 'Synthetic Imp Iron Casting Discount',
                age: 4,
                req: [],
                combat: false,
                rules: [],
                eco: [{ tech: 'Iron Casting', tid: 68, what: '黄金', op: 'mul', v: 0.5 }],
                idx: 2,
                linked: 'auto' as const,
              },
            ],
          },
    );
    const teamHalf68 = [...(DAT.civs.Spanish?.team.eco ?? []), { tech: 'Iron Casting', tid: 68, what: '黄金', op: 'mul', v: 0.5 }];

    expect(() =>
      buildArmyCostUsage(ctx, crossAgeData, {
        civList: ['Spanish'],
        bonusesByCiv: { Spanish: crossAgeBonuses },
        teamEcoByCiv: { Spanish: teamHalf68 },
      }),
    ).toThrow(/Spanish.*3\|full\|68/u);

    // 2) 同龄叠加残余反例：同在城堡与帝王叠加团队 mul 0.5 与非团队 mul 0.5（120 -> 60 -> 30 金）
    // 单项摘除非团队仍从 30 升至 60，但联合摘除全部非团队加成后仍残留 60 < 120 折价，必须被拦截
    const stackedData = structuredClone(ARMY_RESEARCH);
    stackedData.civs.Spanish!.mods[baseIdx68] = { Type: 101, A: 68, B: 3, C: 2, D: 0.5 };
    stackedData.civs.Spanish!.mods.push({ Type: 101, A: 68, B: 3, C: 2, D: 0.6 });
    const stackedBonuses = spanishBonuses.map((bon) =>
      bon.id !== 'Spanish-2'
        ? bon
        : {
            ...bon,
            dat: bon.dat.map((d) => (d.tech >= 0 ? d : { ...d, eco: d.eco.map((e) => (e.tid === 68 && e.what === '黄金' ? { ...e, op: 'mul', v: 0.6 } : e)) })),
          },
    );
    expect(() =>
      buildArmyCostUsage(ctx, stackedData, {
        civList: ['Spanish'],
        bonusesByCiv: { Spanish: stackedBonuses },
        teamEcoByCiv: { Spanish: teamHalf68 },
      }),
    ).toThrow(/残余折价.*68/u);
  });

  it('单项回退可观察性：波希米亚仅帝王可用的 t:45（信念）在全可选被 t:785 遮蔽时必须靠 single:45 回退捕获', () => {
    const bohemians = civs.find((c) => c.en === 'Bohemians')!;
    const syntheticData = structuredClone(ARMY_RESEARCH);
    syntheticData.civs.Bohemians!.mods.push({ Type: 101, A: 45, B: 3, C: 2, D: 0.5 });

    // 先确认 t:45 在全可选配置被 t:785 遮蔽为 invalid(price)，而单项配置有效按半价黄金报价（由固定数据基价推导）
    const rows4 = productionUnits(ctx, { civ: 'Bohemians', age: 4, techs: [...PRODUCTION_UNLOCK_TECH_IDS], rows: [], walk: 0, farm: 0 }).map((u) => ({
      unit: u.id,
      qty: '1',
    }));
    const base4 = { ...emptyArmyCost('Bohemians', '4'), rows: rows4 };
    const choices4 = armyResearchChoices(ctx, base4, false, syntheticData);
    expect(choices4).toContain(45);
    expect(evaluateArmyCost(ctx, { ...base4, targets: choices4.map(researchKey) }, syntheticData).ledger.find((e) => e.id === 45)).toMatchObject({
      status: 'invalid',
      problem: 'price',
    });
    const base45 = Object.fromEntries(ARMY_RESEARCH.nodes['45']!.cost.filter(([, , en]) => en).map(([r, v]) => [r, v]));
    expect(evaluateArmyCost(ctx, { ...base4, targets: ['t:45'] }, syntheticData).ledger.find((e) => e.id === 45)).toMatchObject({
      status: 'planned',
      cost: { Food: base45[0], Gold: base45[3]! * 0.5 },
    });

    const syntheticBonuses = civBonuses(bohemians).map((bon) =>
      bon.id !== 'Bohemians-0'
        ? bon
        : {
            ...bon,
            dat: [
              ...bon.dat,
              {
                tech: -1,
                name: 'Synthetic Faith Discount',
                age: 1,
                req: [],
                combat: false,
                rules: [],
                eco: [{ tech: 'Faith', tid: 45, what: '黄金', op: 'mul', v: 0.5 }],
                idx: 0,
                linked: 'auto' as const,
              },
            ],
          },
    );
    const built = buildArmyCostUsage(ctx, syntheticData, {
      civList: ['Bohemians'],
      bonusesByCiv: { Bohemians: syntheticBonuses },
    });
    expect(built.bonuses['Bohemians-0']).toEqual({ tids: [45], allFree: false, ecoOnlyUnits: [] });
  });

  it('CLI 入口精确判定：缺失 --check 报错、vite-node 静/动态导入零副作用、直接与 --script 冷生成一致通过', async () => {
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
      const unexpectedOut = join(tempDir, 'unexpected-import-output.json');
      unlinkSync(target);

      const viteNodeBin = resolve('node_modules/.bin/vite-node');
      // 1) 缺失索引时 --check 立即报错
      await expect(execFileAsync(viteNodeBin, ['scripts/army_cost_usage_build.ts', '--check'], { cwd: tempDir })).rejects.toThrow();

      // 2) 普通 vite-node 与 --script 静态/动态导入生成器均不得产生文件写入副作用
      writeFileSync(
        join(tempDir, 'import-static.ts'),
        "import { buildArmyCostUsage } from './scripts/army_cost_usage_build';\nconsole.log(typeof buildArmyCostUsage);\n",
      );
      writeFileSync(
        join(tempDir, 'import-dynamic.ts'),
        "const mod = await import('./scripts/army_cost_usage_build');\nconsole.log(typeof mod.buildArmyCostUsage);\n",
      );
      for (const args of [
        ['import-static.ts', '--out', unexpectedOut],
        ['--script', 'import-static.ts', '--out', unexpectedOut],
        ['import-dynamic.ts', '--out', unexpectedOut],
      ]) {
        const { stdout } = await execFileAsync(viteNodeBin, args, { cwd: tempDir });
        expect(stdout.trim()).toBe('function');
        expect(existsSync(unexpectedOut), args.join(' ')).toBe(false);
        expect(existsSync(target), args.join(' ')).toBe(false);
      }

      // 3) 直接调用冷生成，并同时以普通模式与 --script 模式校验 --check
      await execFileAsync(viteNodeBin, ['scripts/army_cost_usage_build.ts'], { cwd: tempDir });
      await execFileAsync(viteNodeBin, ['scripts/army_cost_usage_build.ts', '--check'], { cwd: tempDir });
      await execFileAsync(viteNodeBin, ['--script', 'scripts/army_cost_usage_build.ts', '--check'], { cwd: tempDir });

      expect(readFileSync(target, 'utf8')).toBe(readFileSync(resolve('data/game/army_cost_usage.json'), 'utf8'));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, 90_000);
});
