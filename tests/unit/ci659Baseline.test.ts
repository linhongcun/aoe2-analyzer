import { describe, expect, it } from 'vitest';
// @ts-expect-error CI tools are plain Node modules
import { applyBrowserPolicy, planChanges } from '../../scripts/ci-scope.mjs';

const pr = { GITHUB_EVENT_NAME: 'pull_request', CI_E2E_FULL: 'false' };

describe('#659 先失败的覆盖边界验收', () => {
  it('文档变更也保留跨路由冷启动smoke', () => {
    const plan = applyBrowserPolicy(planChanges([{ path: 'docs/closure-policy.md', before: '', after: '明确交付规则' }]), pr);
    expect(plan.browser).toBe('capped');
    expect(plan.e2e).toContain('tests/e2e/smoke.spec.ts');
  });

  it('全局样式的完整覆盖不再被PR身份强行截断', () => {
    const plan = applyBrowserPolicy(planChanges([{ path: 'src/shared/styles/tokens.css', before: ':root {}', after: ':root { --a: 1; }' }]), pr);
    expect(plan.full).toBe(true);
    expect(plan.browser).toBe('full');
  });

  it('跨clock和builds/timeline的时间helper不能按clock单页收窄', () => {
    const plan = planChanges([{ path: 'src/domain/formatTime.ts', before: 'export const n = 1;', after: 'export const n = 2;' }]);
    expect(plan.full).toBe(true);
  });

  it('feature目录内的全局CSS泄漏触发广覆盖', () => {
    const plan = planChanges([{ path: 'src/features/civs/components/civOverview.css', before: '.civ-ratings { margin: 0; }', after: 'body { margin: 0; }' }]);
    expect(plan.full).toBe(true);
  });
});
