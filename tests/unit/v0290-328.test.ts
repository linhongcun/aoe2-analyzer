/**
 * v0.29.0 验收（#329）C 组：#328。Kent 写；从 test/v0290-acceptance@98a74e0 的 v0290-C.test.ts 搬入（仅 #328，不含 #322）。
 * - #328：不调高全局超时；relatedTechs193 的慢用例单独设超时，覆盖范围和断言不变。
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// ---------- #328 ----------
describe('#328 relatedTechs193 慢用例：单独设超时，不调全局', () => {
  const config = readFileSync('vite.config.ts', 'utf8');
  it('全局 testTimeout 保持默认（vite.config.ts 不设，或不超过 5000；也没有 vitest.config.*）', () => {
    const m = config.match(/testTimeout\s*:\s*([^,}\s]+)/);
    if (m) expect(Number(m[1]!.replace(/_/g, ''))).toBeLessThanOrEqual(5000);
    for (const f of ['vitest.config.ts', 'vitest.config.mts', 'vitest.config.js', 'vitest.workspace.ts']) expect(existsSync(f), f).toBe(false);
  });
  it('npm test 脚本和 CI 工作流不通过命令行或环境变量调高超时', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts.test).not.toMatch(/timeout/i);
    for (const wf of ['.github/workflows/ci.yml', '.github/workflows/release.yml'])
      expect(readFileSync(wf, 'utf8'), wf).not.toMatch(/testTimeout|test-timeout|VITEST_.*TIMEOUT/i);
  });
  const src = readFileSync('tests/unit/relatedTechs193.test.ts', 'utf8');
  const title = '全部科技到单位与单位到科技双向一致';
  const start = src.indexOf(title);
  const body = start < 0 ? '' : src.slice(start, src.indexOf('\n  it(', start) < 0 ? undefined : src.indexOf('\n  it(', start));
  it('用例仍在，覆盖范围不变：全部单位 × 全部科技，比对 techAffects 与 CIV_TECH_EXTRAS', () => {
    expect(start).toBeGreaterThan(0);
    // 不能改成 it.skip / it.todo / it.only / xit
    expect(src.slice(Math.max(0, start - 8), start)).toMatch(/(^|[^.\w])it\(\s*['"`]$/);
    for (const s of [
      'for (const u of units)',
      'for (const t of techs)',
      'unitRelatedTechs(ctx, u)',
      'techAffects(t, [u], [])',
      'CIV_TECH_EXTRAS',
      '`${u.en} / ${t.en}`',
    ])
      expect(body, s).toContain(s);
  });
  it('这条用例单独设了超时（≥ 10000 ms，issue 建议 15000）', () => {
    const own = body.match(/\{\s*timeout\s*:\s*([\d_]+)\s*\}/) ?? body.match(/\}\s*,\s*([\d_]+)\s*\)\s*;?\s*$/);
    expect(own, '未见单条 timeout。若改用预先算好的数据或优化算法，请在 PR 里说明，由 Kent 按新实现改写本条').not.toBeNull();
    expect(Number(own![1]!.replace(/_/g, ''))).toBeGreaterThanOrEqual(10000);
  });
});
