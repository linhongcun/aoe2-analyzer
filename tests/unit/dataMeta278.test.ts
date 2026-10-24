import { afterEach, describe, expect, it, vi } from 'vitest';
import sources from '../../scripts/data_sources.json';
import { defaultTeamPlan, encodeTeamPlan } from '../../src/domain/teamPlan';

afterEach(() => {
  vi.doUnmock('../../src/data/meta');
  vi.resetModules();
});

describe('#278 使用固定数据版本', () => {
  it('元数据版本变化后新计划使用新版本，旧链接仍被拒绝而不会静默重算', async () => {
    const previous = defaultTeamPlan();
    const oldSearch = '?' + encodeTeamPlan(previous);
    const nextBuild = sources.patch.build + 1;
    vi.resetModules();
    vi.doMock('../../src/data/meta', () => ({ DATA_PATCH_BUILD: nextBuild }));
    const next = await import('../../src/domain/teamPlan');

    const fresh = next.defaultTeamPlan();
    expect(fresh.patch).toBe(nextBuild);
    expect(next.teamPlanShape(previous)).toBe(false);
    expect(next.decodeTeamPlan(oldSearch)).toEqual({
      plan: null,
      errors: ['链接无法完整恢复：版本、编码、结构或长度无效；请保留原链接或显式重置。'],
    });
    expect(() => next.encodeTeamPlan(previous)).toThrow('计划结构或字段长度超限');
    expect(next.decodeTeamPlan('?' + next.encodeTeamPlan(fresh))).toEqual({ plan: fresh, errors: [] });
    // 固定版本的本站示例也不被偷偷重标为新版本。
    expect(next.exampleTeamPlan().patch).toBe(previous.patch);
    expect(next.teamPlanShape(next.exampleTeamPlan())).toBe(false);
  });

  it('数据升级后旧教学资料不会继续被当作当前版本', async () => {
    vi.resetModules();
    vi.doMock('../../src/data/meta', () => ({ DATA_PATCH_BUILD: sources.patch.build + 1 }));
    const guide = await import('../../src/domain/gameGuide');
    expect(guide.gameGuideCatalogErrors()).toContain('资料版本未识别。');
  });
});
