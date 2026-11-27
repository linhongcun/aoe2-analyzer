import { execFile } from 'node:child_process';
import { cpSync, existsSync, linkSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
import { buildArmyCostUsage, formatArmyCostUsageJson } from '../../scripts/army_cost_usage_lib';

let ctx: ProductionContext;
beforeAll(async () => {
  await loadCore();
  ctx = { core: CORE, trees: await loadTrees() };
});

describe('Issue 1429 生成器归属守卫、单项回退与 CLI 无副作用入口', () => {
  it('命令级 1 对 1 归属：容差跨分桶/中点歧义、缺项/多余命令 fail-closed，且混用 add C=1/-1 合法配对通过', () => {
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

    // 1) 西班牙 t:68：非团队 mul 0.5 黄金 + 团队 set 0 黄金 -> 未归属守卫拦截 t:68
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

    // 2) 容差内跨 Math.round 分桶歧义：非团队 0.500000 与团队 0.500008（差 8e-6 <= 1e-5）
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

    // 3) 中点实际命令歧义：预期 0.500000 vs 0.500015，实际 D=0.500007 同时落在两者 1e-5 容差内
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

    // 4) 同来源混用 add 的两种编码 (C=1, D=-60) 与 (C=-1, D=-59.999992) 匹配预期 (-60, -59.999985)：合法 1 对 1 必须通过
    const mixedAddData = structuredClone(ARMY_RESEARCH);
    mixedAddData.civs.Spanish!.mods[baseIdx68] = { Type: 101, A: 68, B: 3, C: 1, D: -60 };
    mixedAddData.civs.Spanish!.mods.push({ Type: 101, A: 68, B: 3, C: -1, D: -59.999992 });
    const mixedAddBonuses = spanishBonuses.map((bon) =>
      bon.id !== 'Spanish-2'
        ? bon
        : {
            ...bon,
            dat: bon.dat.map((d) =>
              d.tech >= 0 || !d.eco.some((e) => e.tid === 68 && e.what === '黄金')
                ? d
                : {
                    ...d,
                    eco: [
                      ...d.eco.map((e) => (e.tid === 68 && e.what === '黄金' ? { ...e, op: 'add', v: -60 } : e)),
                      { tech: 'Iron Casting', tid: 68, what: '黄金', op: 'add', v: -59.999985 },
                    ],
                  },
            ),
          },
    );
    const mixedRes = buildArmyCostUsage(ctx, mixedAddData, { civList: ['Spanish'], bonusesByCiv: { Spanish: mixedAddBonuses } });
    expect(mixedRes.bonuses['Spanish-2']?.tids).toContain(68);

    // 5) 缺少匹配命令 & 多余未归属命令 -> fail-closed
    const missingData = structuredClone(ARMY_RESEARCH);
    missingData.civs.Spanish!.mods = missingData.civs.Spanish!.mods.filter((_, i) => i !== baseIdx68);
    expect(() => buildArmyCostUsage(ctx, missingData, { civList: ['Spanish'] })).toThrow(/缺少匹配/u);

    const extraData = structuredClone(ARMY_RESEARCH);
    extraData.civs.Spanish!.mods.push({ Type: 101, A: 68, B: 0, C: 2, D: 0.5 });
    expect(() => buildArmyCostUsage(ctx, extraData, { civList: ['Spanish'] })).toThrow(/未归属/u);
  });

  it('逐时代/配置与单资源联合摘除防掩盖：跨时代、同龄同资源及异资源加价掩盖团队折价均被拦截', () => {
    const spanish = civs.find((c) => c.en === 'Spanish')!;
    const spanishBonuses = civBonuses(spanish);
    const baseIdx68 = ARMY_RESEARCH.civs.Spanish!.mods.findIndex((m) => m.Type === 101 && m.A === 68 && m.B === 3 && m.C === 0 && m.D === 0);
    const teamHalf68 = [...(DAT.civs.Spanish?.team.eco ?? []), { tech: 'Iron Casting', tid: 68, what: '黄金', op: 'mul', v: 0.5 }];

    // 1) 跨时代反例：城堡仅团队 mul 0.5，帝王新增正节点非团队 mul 0.5 -> 拦截城堡 3|full|68
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
    expect(() =>
      buildArmyCostUsage(ctx, crossAgeData, {
        civList: ['Spanish'],
        bonusesByCiv: { Spanish: crossAgeBonuses },
        teamEcoByCiv: { Spanish: teamHalf68 },
      }),
    ).toThrow(/Spanish.*3\|full\|68/u);

    // 2) 同龄异资源加价掩盖反例：原价 220F/120G，非团队 -70F + 团队 ×0.5G + 独立节点 +20F
    // 基线 170F/60G，联合摘除后 240F/60G（食物高于原价但黄金仍低于 120G）-> 必须拦截残余黄金折价
    const crossResData = structuredClone(ARMY_RESEARCH);
    crossResData.civs.Spanish!.mods[baseIdx68] = { Type: 101, A: 68, B: 0, C: 1, D: -70 };
    crossResData.civs.Spanish!.mods.push({ Type: 101, A: 68, B: 3, C: 2, D: 0.5 });
    crossResData.nodes['99902'] = {
      name: 'Synthetic Global Food Surcharge',
      civ: crossResData.civs.Spanish!.id,
      location: 0,
      cost: [],
      time: 0,
      requires: [],
      count: 0,
      mods: [{ Type: 101, A: 68, B: 0, C: 1, D: 20 }],
      upgrades: [],
      combatUnits: [],
      enables: [],
    };
    const crossResBonuses = spanishBonuses.map((bon) =>
      bon.id !== 'Spanish-2'
        ? bon
        : {
            ...bon,
            dat: bon.dat.map((d) =>
              d.tech >= 0 ? d : { ...d, eco: d.eco.map((e) => (e.tid === 68 && e.what === '黄金' ? { ...e, what: '食物', op: 'add', v: -70 } : e)) },
            ),
          },
    );
    expect(() =>
      buildArmyCostUsage(ctx, crossResData, {
        civList: ['Spanish'],
        bonusesByCiv: { Spanish: crossResBonuses },
        teamEcoByCiv: { Spanish: teamHalf68 },
      }),
    ).toThrow(/残余折价.*68/u);
  });

  it('单项回退可观察性：波希米亚仅帝王可用的 t:45（信念）在全可选被 t:785 遮蔽时必须靠 single:45 回退捕获', () => {
    const bohemians = civs.find((c) => c.en === 'Bohemians')!;
    const syntheticData = structuredClone(ARMY_RESEARCH);
    syntheticData.civs.Bohemians!.mods.push({ Type: 101, A: 45, B: 3, C: 2, D: 0.5 });

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

  it('纯库与 CLI 分离：Error.stackTraceLimit=0 仍必执行校验，伪造 prepareStackTrace 导入纯库零副作用，CLI 与全量复现一致', async () => {
    const execFileAsync = promisify(execFile);
    const viteNodeBin = resolve('node_modules/.bin/vite-node');
    const runBuild = (cwd: string, ...args: string[]) => execFileAsync(viteNodeBin, ['scripts/army_cost_usage_build.ts', ...args], { cwd });
    const expectOutBlocked = (cwd: string, ...args: string[]) => expect(runBuild(cwd, ...args)).rejects.toThrow(/--out/);
    const tempDirs: string[] = [];
    const createIsolatedFixture = () => {
      const dir = mkdtempSync(join(tmpdir(), 'army-cost-usage-cold-'));
      tempDirs.push(dir);
      mkdirSync(join(dir, 'scripts'), { recursive: true });
      mkdirSync(join(dir, 'data/game'), { recursive: true });
      mkdirSync(join(dir, 'node_modules'), { recursive: true });
      // 只复制 2 个入口脚本使 ROOT 落到 dir，其余只读目录通过符号链接复用，避免整仓拷贝；
      // node_modules 建独立目录逐项链接，确保 Vite 的 .vite-temp 缓存落在 dir 内不回写 worktree
      cpSync(resolve('scripts/army_cost_usage_build.ts'), join(dir, 'scripts/army_cost_usage_build.ts'));
      cpSync(resolve('scripts/army_cost_usage_lib.ts'), join(dir, 'scripts/army_cost_usage_lib.ts'));
      for (const rel of ['src', 'data/sources', 'data/patch-notes', 'package.json', 'tsconfig.json', 'vite.config.ts']) {
        symlinkSync(resolve(rel), join(dir, rel));
      }
      for (const entry of readdirSync(resolve('node_modules'))) {
        if (!entry.startsWith('.vite')) symlinkSync(resolve('node_modules', entry), join(dir, 'node_modules', entry));
      }
      for (const name of readdirSync(resolve('data/game'))) {
        if (name !== 'army_cost_usage.json') symlinkSync(resolve('data/game', name), join(dir, 'data/game', name));
      }
      return dir;
    };
    const isFsAlias = (parent: string, a: string, b: string) => {
      const probe = mkdtempSync(join(parent, 'fs-probe-'));
      try {
        writeFileSync(join(probe, a), 'x');
        return existsSync(join(probe, b));
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
    };
    try {
      const mkDir = (p: string) => (mkdirSync(p, { recursive: true }), p);
      const writeFile = (p: string, s: string) => (writeFileSync(p, s), p);
      const tempDir = createIsolatedFixture();
      const extExistingDir = createIsolatedFixture();
      const extDanglingDir = createIsolatedFixture();
      const extSharpSDir = createIsolatedFixture();
      const extFullwidthDir = createIsolatedFixture();

      const target = join(tempDir, 'data/game/army_cost_usage.json');
      const upperTarget = join(tempDir, 'data/game/ARMY_COST_USAGE.JSON');
      const unicodeFoldTarget = join(tempDir, 'data/game/army_co\u017ft_usage.json');
      const nestedSentinel = writeFile(join(mkDir(join(tempDir, 'data/game/nested')), 'sentinel.json'), '{"sentinel":"nested"}\n');
      const deepSentinel = writeFile(join(mkDir(join(tempDir, 'data/game/deeper/still/inside')), 'sentinel.json'), '{"sentinel":"deep-hardlink"}\n');
      const externalHardlink = join(tempDir, 'external-hardlink.json');
      linkSync(deepSentinel, externalHardlink);
      const externalSymlinkTarget = writeFile(join(tempDir, 'external-symlink-target.json'), '{"sentinel":"game-symlink-outside"}\n');
      const gameSymlinkOutside = join(tempDir, 'data/game/symlink-outside.json');
      symlinkSync(externalSymlinkTarget, gameSymlinkOutside);
      const gameDirAlias = join(tempDir, 'game-dir-alias');
      symlinkSync(join(tempDir, 'data/game'), gameDirAlias);
      const aliasTarget = join(gameDirAlias, 'army_cost_usage.json');
      const nestedRealDir = mkDir(join(tempDir, 'nested/deep'));
      symlinkSync('../../data/game/army_cost_usage.json', join(nestedRealDir, 'broken-rel.json'));
      const nestedDirAlias = join(tempDir, 'nested-dir-alias');
      symlinkSync(nestedRealDir, nestedDirAlias);
      const brokenRelViaDirAlias = join(nestedDirAlias, 'broken-rel.json');
      symlinkSync(mkDir(join(tempDir, 'data/sub')), join(tempDir, 'portal'));
      const portalDotDotLink = join(tempDir, 'portal-dotdot.json');
      symlinkSync('portal/../game/army_cost_usage.json', portalDotDotLink);
      writeFile(join(tempDir, 'blocker'), 'not-a-dir\n');
      const blockerTraversal = 'blocker/../must-not-exist.json';
      const chainDir = mkDir(join(tempDir, 'chain'));
      let chainPrev = target;
      for (let i = 0; i < 18; i++) {
        const hop = join(chainDir, `hop-${i}.json`);
        symlinkSync(chainPrev, hop);
        chainPrev = hop;
      }
      const deepChainTarget = chainPrev;
      const [loopA, loopB] = [join(chainDir, 'loop-a.json'), join(chainDir, 'loop-b.json')];
      symlinkSync(loopB, loopA);
      symlinkSync(loopA, loopB);
      const unexpectedOut = join(tempDir, 'unexpected-import-output.json');
      const subsetOut = join(tempDir, 'spanish-usage.json');
      const siblingGameOut = join(mkDir(join(tempDir, 'data/game-other')), 'out.json');
      const protectedChild = writeFile(join(mkDir(join(tempDir, 'literal')), 'item.json'), '{"keep":true}\n');

      // 夹具 B：默认快照指向已存在外部文件的符号链接，仍独立保护 data/game/ 与外部目标
      const externalSnapshot = writeFile(join(extExistingDir, 'external-snapshot.json'), '{"sentinel":"external"}\n');
      symlinkSync(externalSnapshot, join(extExistingDir, 'data/game/army_cost_usage.json'));
      const directSentinel = writeFile(join(extExistingDir, 'data/game/direct-sentinel.json'), '{"sentinel":"direct"}\n');

      // 夹具 C：默认快照指向外部断链 MISSING-DEFAULT.json，按 OS 内核实际等价拦截别名，拒绝尾部 `/` 断链且在写失败时清理空文件
      const danglingSnapLink = join(extDanglingDir, 'data/game/army_cost_usage.json');
      const externalDir = mkDir(join(extDanglingDir, 'external'));
      const danglingTarget = join(externalDir, 'MISSING-DEFAULT.json');
      const danglingLowerAlias = join(externalDir, 'missing-default.json');
      const danglingUnicodeAlias = join(externalDir, 'mi\u017fsing-default.json');
      const externalRegularOut = join(externalDir, 'regular-subset.json');
      const trailingSlashAlias = join(externalDir, 'trailing-slash-alias.json');
      const validDanglingAlias = join(externalDir, 'valid-dangling-alias.json');
      const enospcOut = join(externalDir, 'enospc-out.json');
      symlinkSync(danglingTarget, danglingSnapLink);
      symlinkSync('redirected.json/', trailingSlashAlias);
      symlinkSync('redirected-ok.json', validDanglingAlias);

      // 夹具 D：默认快照指向外部断链 ẞ.json（U+1E9E），在折叠卷上由内核拦截 ss.json / ß.json 且保留普通文件可写
      const sharpSSnapLink = join(extSharpSDir, 'data/game/army_cost_usage.json');
      const sharpSExtDir = mkDir(join(extSharpSDir, 'external'));
      const [sharpSSsAlias, sharpSLowerAlias, sharpSRegularOut] = [
        join(sharpSExtDir, 'ss.json'),
        join(sharpSExtDir, '\u00df.json'),
        join(sharpSExtDir, 'regular-subset.json'),
      ];
      symlinkSync(join(sharpSExtDir, '\u1e9e.json'), sharpSSnapLink);

      // 夹具 E：默认快照指向外部断链全角 Ａ.json（U+FF21），OS 不等价时 ASCII A.json 必须可新建、覆写并通过 --check
      const fullwidthSnapLink = join(extFullwidthDir, 'data/game/army_cost_usage.json');
      const fullwidthExtDir = mkDir(join(extFullwidthDir, 'external'));
      symlinkSync(join(fullwidthExtDir, '\uff21.json'), fullwidthSnapLink);
      const fullwidthAsciiOut = join(fullwidthExtDir, 'A.json');

      const lowerIsAlias = isFsAlias(tempDir, 'MISSING-DEFAULT.json', 'missing-default.json');
      const longSIsAlias = isFsAlias(tempDir, 'MISSING-DEFAULT.json', 'mi\u017fsing-default.json');
      const sharpSSsIsAlias = isFsAlias(tempDir, '\u1e9e.json', 'ss.json');
      const sharpSLowerIsAlias = isFsAlias(tempDir, '\u1e9e.json', '\u00df.json');

      const zeroStackPreload = writeFile(join(tempDir, 'zero-stack.cjs'), 'Error.stackTraceLimit = 0;\n');
      const enospcPreload = writeFile(
        join(extDanglingDir, 'enospc-fd.cjs'),
        "const fs = require('node:fs');\nconst { syncBuiltinESMExports } = require('node:module');\nconst orig = fs.writeFileSync;\nfs.writeFileSync = function (file, ...rest) { if (typeof file === 'number' && file > 2) { const e = new Error('ENOSPC: no space left on device'); e.code = 'ENOSPC'; throw e; } return orig.call(this, file, ...rest); };\nsyncBuiltinESMExports();\n",
      );
      writeFile(
        join(tempDir, 'import-lib-static.ts'),
        "import { buildArmyCostUsage } from './scripts/army_cost_usage_lib';\nconsole.log(typeof buildArmyCostUsage);\n",
      );
      writeFile(
        join(tempDir, 'import-lib-spoof.ts'),
        "Error.prepareStackTrace = () => 'ViteNodeRunner.executeFile';\nconst mod = await import('./scripts/army_cost_usage_lib');\nconsole.log(typeof mod.buildArmyCostUsage);\n",
      );

      const importRuns = [
        ['import-lib-static.ts', '--out', unexpectedOut],
        ['--script', 'import-lib-static.ts', '--out', unexpectedOut],
        ['import-lib-spoof.ts', '--out', unexpectedOut],
      ];

      await Promise.all([
        expect(
          execFileAsync(viteNodeBin, ['scripts/army_cost_usage_build.ts', '--check', '--out', target], {
            cwd: tempDir,
            env: { ...process.env, NODE_OPTIONS: `--require ${zeroStackPreload}` },
          }),
        ).rejects.toThrow(),
        expect(
          execFileAsync(viteNodeBin, ['scripts/army_cost_usage_build.ts', '--civ', 'Spanish', '--out', enospcOut], {
            cwd: extDanglingDir,
            env: { ...process.env, NODE_OPTIONS: `--require ${enospcPreload}` },
          }),
        ).rejects.toThrow(/ENOSPC/),
        expectOutBlocked(tempDir, '--civ', 'Spanish'),
        ...[
          upperTarget,
          unicodeFoldTarget,
          nestedSentinel,
          externalHardlink,
          gameSymlinkOutside,
          externalSymlinkTarget,
          aliasTarget,
          brokenRelViaDirAlias,
          portalDotDotLink,
          'portal/../game/army_cost_usage.json',
          blockerTraversal,
          deepChainTarget,
          loopA,
          '--check',
        ].map((out) => expectOutBlocked(tempDir, '--civ', 'Spanish', '--out', out)),
        expectOutBlocked(extExistingDir, '--civ', 'Spanish', '--out', directSentinel),
        expectOutBlocked(extExistingDir, '--civ', 'Spanish', '--out', externalSnapshot),
        expectOutBlocked(extDanglingDir, '--civ', 'Spanish', '--out', danglingTarget),
        expectOutBlocked(extDanglingDir, '--civ', 'Spanish', '--out', trailingSlashAlias),
        ...(lowerIsAlias ? [expectOutBlocked(extDanglingDir, '--civ', 'Spanish', '--out', danglingLowerAlias)] : []),
        ...(longSIsAlias ? [expectOutBlocked(extDanglingDir, '--civ', 'Spanish', '--out', danglingUnicodeAlias)] : []),
        ...(sharpSSsIsAlias ? [expectOutBlocked(extSharpSDir, '--civ', 'Spanish', '--out', sharpSSsAlias)] : []),
        ...(sharpSLowerIsAlias ? [expectOutBlocked(extSharpSDir, '--civ', 'Spanish', '--out', sharpSLowerAlias)] : []),
        ...importRuns.map(async (args) => {
          const { stdout } = await execFileAsync(viteNodeBin, args, { cwd: tempDir });
          expect(stdout.trim()).toBe('function');
        }),
        runBuild(tempDir, '--civ', 'Spanish', '--out', subsetOut),
        runBuild(tempDir, '--civ', 'Spanish', '--out', siblingGameOut),
        runBuild(extDanglingDir, '--civ', 'Spanish', '--out', externalRegularOut),
        runBuild(extDanglingDir, '--civ', 'Spanish', '--out', validDanglingAlias),
        runBuild(extSharpSDir, '--civ', 'Spanish', '--out', sharpSRegularOut),
        runBuild(extFullwidthDir, '--civ', 'Spanish', '--out', fullwidthAsciiOut),
        ...(process.platform !== 'win32' ? [runBuild(tempDir, '--civ', 'Spanish', '--out', 'literal\\item.json')] : []),
      ]);
      for (const absent of [
        unexpectedOut,
        target,
        upperTarget,
        unicodeFoldTarget,
        danglingSnapLink,
        join(externalDir, 'redirected.json'),
        enospcOut,
        sharpSSnapLink,
        fullwidthSnapLink,
        join(tempDir, 'must-not-exist.json'),
        join(tempDir, '--check'),
        ...(lowerIsAlias ? [danglingLowerAlias] : []),
        ...(longSIsAlias ? [danglingUnicodeAlias] : []),
        ...(sharpSSsIsAlias ? [sharpSSsAlias] : []),
        ...(sharpSLowerIsAlias ? [sharpSLowerAlias] : []),
      ]) {
        expect(existsSync(absent)).toBe(false);
      }
      expect(readFileSync(nestedSentinel, 'utf8')).toBe('{"sentinel":"nested"}\n');
      expect(readFileSync(deepSentinel, 'utf8')).toBe('{"sentinel":"deep-hardlink"}\n');
      expect(readFileSync(externalSymlinkTarget, 'utf8')).toBe('{"sentinel":"game-symlink-outside"}\n');
      expect(readFileSync(directSentinel, 'utf8')).toBe('{"sentinel":"direct"}\n');
      expect(readFileSync(externalSnapshot, 'utf8')).toBe('{"sentinel":"external"}\n');
      if (process.platform !== 'win32') {
        expect(readFileSync(protectedChild, 'utf8')).toBe('{"keep":true}\n');
        expect(existsSync(join(tempDir, 'literal\\item.json'))).toBe(true);
      }

      // 并行完成普通模式与 --script 模式双验证 --check（含覆盖写入全角断链同目录 ASCII A.json），并与已提交快照核对一致
      await Promise.all([
        runBuild(tempDir, '--civ', 'Spanish', '--check', '--out', subsetOut),
        execFileAsync(viteNodeBin, ['--script', 'scripts/army_cost_usage_build.ts', '--civ', 'Spanish', '--check', '--out', subsetOut], { cwd: tempDir }),
        runBuild(tempDir, '--civ', 'Spanish', '--check', '--out', siblingGameOut),
        runBuild(extDanglingDir, '--civ', 'Spanish', '--check', '--out', externalRegularOut),
        runBuild(extDanglingDir, '--civ', 'Spanish', '--check', '--out', validDanglingAlias),
        runBuild(extSharpSDir, '--civ', 'Spanish', '--check', '--out', sharpSRegularOut),
        (async () => {
          await runBuild(extFullwidthDir, '--civ', 'Spanish', '--out', fullwidthAsciiOut);
          await runBuild(extFullwidthDir, '--civ', 'Spanish', '--check', '--out', fullwidthAsciiOut);
        })(),
      ]);

      const builtSpanish = buildArmyCostUsage(ctx, ARMY_RESEARCH, { civList: ['Spanish'] });
      const expectedSpanishJson = formatArmyCostUsageJson(builtSpanish);
      for (const out of [subsetOut, externalRegularOut, validDanglingAlias, sharpSRegularOut, fullwidthAsciiOut]) {
        expect(readFileSync(out, 'utf8')).toBe(expectedSpanishJson);
      }
      expect(existsSync(fullwidthSnapLink)).toBe(false);
      const committed = JSON.parse(readFileSync(resolve('data/game/army_cost_usage.json'), 'utf8')) as typeof builtSpanish;
      expect(builtSpanish.meta).toEqual(committed.meta);
      expect(builtSpanish.bonuses['Spanish-2']).toEqual(committed.bonuses['Spanish-2']);
    } finally {
      for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
