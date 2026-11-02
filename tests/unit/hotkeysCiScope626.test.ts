import { describe, expect, it } from 'vitest';
// @ts-expect-error CI policy is a plain Node module.
import { applyBrowserPolicy, planChanges } from '../../scripts/ci-scope.mjs';

const change = (path: string) => ({ path, before: '', after: '' });

describe('#626 快捷键页面的精确验证范围', () => {
  it.each(['src/features/hotkeys/Hotkeys.tsx', 'src/features/hotkeys/hotkeys.css'])('%s 保留原个人表和新短提示验收', (path) => {
    const plan = planChanges([change(path)]);
    expect(plan.scope).toBe('targeted');
    expect(plan.full).toBe(false);
    expect(plan.data).toBe(false);
    expect(plan.features).toEqual(['hotkeys']);
    expect(plan.unit).toEqual(['tests/unit/hotkeys236.test.ts']);
    expect(plan.e2e).toEqual(['tests/e2e/hotkeys236.spec.ts', 'tests/e2e/hotkeys626.spec.ts', 'tests/e2e/smoke.spec.ts']);
    const browser = applyBrowserPolicy(plan, { GITHUB_EVENT_NAME: 'pull_request' });
    expect(browser.e2e).toEqual(plan.e2e);
  });

  it.each(['src/domain/hotkeys.ts', 'src/domain/realCost.ts', 'src/domain/newHotkeyHelper.ts'])('%s 不因展示profile而放宽domain范围', (path) => {
    const plan = planChanges([change('src/features/hotkeys/Hotkeys.tsx'), change(path)]);
    expect(plan.scope).toBe('full');
    expect(plan.full).toBe(true);
    expect(plan.features).toContain('hotkeys');
  });

  it('游戏数据变化仍触发完整数据验证', () => {
    const plan = planChanges([change('src/features/hotkeys/Hotkeys.tsx'), change('src/data/units.json')]);
    expect(plan.full).toBe(true);
    expect(plan.data).toBe(true);
  });
});
