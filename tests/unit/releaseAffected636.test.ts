import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error CI scripts are plain Node modules
import { applyBrowserPolicy, planChanges, planRange } from '../../scripts/ci-scope.mjs';
// @ts-expect-error CI scripts are plain Node modules
import { resolveTestFiles, testCommand } from '../../scripts/ci-run.mjs';

const pr = { GITHUB_EVENT_NAME: 'pull_request', CI_E2E_FULL: 'false' };
const change = (path: string) => ({ path });
const capped = (paths: string[]) => applyBrowserPolicy(planChanges(paths.map(change)), pr);

describe('PR 专项浏览器覆盖 #636', () => {
  it('full 保留明确变更的专项用例，重复套策略结果不变', () => {
    const plan = capped(['src/domain/realCost.ts', 'tests/e2e/startGame592.spec.ts']);
    expect(plan).toMatchObject({ full: true, data: false, browser: 'capped' });
    expect(plan.e2e).toEqual(['tests/e2e/smoke.spec.ts', 'tests/e2e/startGame592.spec.ts']);
    expect(applyBrowserPolicy(plan, pr)).toEqual(plan);
  });

  it('full 混合单位页仍保留额外指定的攻城入口验收', () => {
    const plan = capped(['src/features/units/components/UnitDetail.tsx', 'src/shared/ui/layout.tsx']);
    expect(plan.full).toBe(true);
    expect(plan.e2e).toContain('tests/e2e/siege533.spec.ts');
    expect(new Set(plan.e2e).size).toBe(plan.e2e.length);
  });

  it.each([
    ['src/features/home/components/Home.tsx', 'startGame592'],
    ['src/domain/startGame.ts', 'startGame592'],
    ['src/features/ladder/LadderFilters.tsx', 'ladder571'],
    ['src/domain/ladderQuery.ts', 'ladder571'],
  ])('%s 有明确有界的功能验收', (path, spec) => {
    const plan = capped([path]);
    expect(plan).toMatchObject({ full: false, data: false, scope: 'targeted' });
    const selected = resolveTestFiles(plan.e2e, 'e2e');
    expect(selected).toContain(`tests/e2e/${spec}.spec.ts`);
    expect(selected).toContain('tests/e2e/smoke.spec.ts');
    expect(selected).not.toContain('tests/e2e/v0300-338.spec.ts');
    const family = path.includes('ladder') ? 'ladder' : 'startGame';
    const expected = [
      'tests/e2e/smoke.spec.ts',
      ...readdirSync('tests/e2e')
        .filter((name) => name.startsWith(family) && name.endsWith('.spec.ts'))
        .map((name) => `tests/e2e/${name}`),
    ];
    if (family === 'startGame') expected.push('tests/e2e/editorial6.spec.ts');
    expect(selected).toEqual(expected.sort());
  });

  it.each(['0a47a49', '4b6d35a'])('真实提交 %s 的新增专项验收被选择', (short) => {
    const rev = (ref: string) => execFileSync('git', ['rev-parse', ref], { encoding: 'utf8' }).trim();
    const plan = applyBrowserPolicy(planRange(rev(`${short}^`), rev(short)), pr);
    const selected = resolveTestFiles(plan.e2e, 'e2e');
    expect(selected).toContain(`tests/e2e/${short === '0a47a49' ? 'startGame592' : 'ladder571'}.spec.ts`);
  });

  it('full 下也不把已删除的专项文件加入执行列表', () => {
    const plan = applyBrowserPolicy(planChanges([change('src/domain/realCost.ts'), { path: 'tests/e2e/removed636.spec.ts', before: 'old', after: null }]), pr);
    expect(plan.e2e).toEqual(['tests/e2e/smoke.spec.ts']);
  });

  it('只映射已审计的天梯选择辅助文件，统计计算及未知 domain 仍完整验证', () => {
    for (const path of ['src/domain/ladder.ts', 'src/domain/ladderStats.ts', 'src/domain/ladderQueryExtra.ts']) {
      expect(capped([path])).toMatchObject({ full: true, scope: 'full' });
    }
  });

  it('黑名单最后过滤；未知模块独自仍保守 full + smoke', () => {
    const plan = capped(['src/domain/realCost.ts', 'tests/e2e/screenshots.spec.ts', 'tests/e2e/v0300-338.spec.ts']);
    expect(plan.e2e).toEqual(['tests/e2e/smoke.spec.ts']);
    expect(capped(['src/features/unknown636/View.tsx'])).toMatchObject({ full: true, browser: 'capped', e2e: ['tests/e2e/smoke.spec.ts'] });
    for (const event of ['push', 'schedule', 'workflow_dispatch']) {
      const full = applyBrowserPolicy(planChanges([change('src/domain/realCost.ts'), change('tests/e2e/startGame592.spec.ts')]), {
        GITHUB_EVENT_NAME: event,
        CI_E2E_FULL: 'true',
      });
      expect(full.browser).toBe('full');
      expect(testCommand(full, 'e2e').args).toEqual(['playwright', 'test', '--reporter=line']);
    }
  });
});
