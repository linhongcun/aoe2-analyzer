// v0.30.0 #343 验收：aliases.spec.ts 在 4 worker 下稳定绿，或标串行并写明原因。Kent Beck 2026-10-22。
// 验收标准（#343「期望」原文）：查清并行竞态或共享状态，让 4 worker 全量稳定绿，或给该文件标串行并说明原因。
// f856c9e 上复现（本机 8 核，北京时间 2026-10-22 09:2x）：aliases.spec.ts --repeat-each=10 --workers=4 → 32 红 / 168 绿；--workers=8 --repeat-each=15 → 94 红 / 206 绿。
// 失败全是 hits 为 0（或 some(...) 为 false）：error-context 里结果列表只有「加载中」。
// 原因：#325（8931262）给懒加载的搜索面板加了同结构外壳，外壳的 .cmdk-list 里有一条「加载中」<li>；
// aliases.spec.ts 的 open() 只等 `.cmdk-list li` 第一条可见，于是在真面板挂载前就读结果。并行负载越高，分包加载越慢，越容易撞上。
// 本条做法：在子进程里把 aliases.spec.ts 以 4 worker 重复跑 5 遍（共 100 个用例），要求 0 失败、0 flaky；
// 若 aliases.spec.ts 改为 test.describe.configure({ mode: 'serial' }) 且旁边有注释说明原因，按 issue 允许的另一条路算通过。
// 子进程沿用本进程的 baseURL（BASE_URL），不另起服务器。约 15–30 秒。
// 正向对照（未提交）：把 open() 改为先等 getByRole('combobox', { name: '全局搜索' })（真面板才有 combobox）再等结果，本条转绿（1 passed）；f856c9e 上连跑两次分别 12、15 红。
// [待 Steve] 「稳定」取 4 worker × 5 遍 0 失败；要不要更多遍、或要求在 CI 上全量跑，请定。
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const FILE = 'tests/e2e/aliases.spec.ts';

test('#343 aliases.spec.ts：4 worker 重复 5 遍 0 失败 0 flaky（或标串行并注明原因）', async ({ browserName }, info) => {
  void browserName;
  test.setTimeout(240_000);
  const src = readFileSync(FILE, 'utf8');
  // 去掉注释再找，免得「// test.describe.configure(...)」这种注释冒充
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const serial = /test\.describe\.configure\(\s*\{\s*mode:\s*['"]serial['"]/.test(code);
  if (serial) {
    const lines = src.split('\n');
    const at = lines.findIndex((l) => /describe\.configure/.test(l));
    const near = lines.slice(Math.max(0, at - 3), at + 2).join('\n');
    expect(near, '标串行要写明原因').toMatch(/\/\/.*(串行|serial|竞态|并行|加载)/i);
    return;
  }
  const baseURL = String(info.project.use.baseURL ?? process.env.BASE_URL ?? '');
  expect(baseURL, '需要已启动的站点').not.toBe('');
  const run = spawnSync(
    'npx',
    ['playwright', 'test', FILE, '--workers=4', '--repeat-each=5', '--retries=0', '--reporter=json', `--output=${mkdtempSync(join(tmpdir(), 'v0300-343-'))}`],
    {
      // 子进程用自己的 test-results 目录（不清掉本进程的产物）；JSON 写到 stdout
      env: Object.fromEntries(Object.entries({ ...process.env, BASE_URL: baseURL }).filter(([k]) => !k.startsWith('PLAYWRIGHT_JSON_OUTPUT'))),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 220_000,
    },
  );
  const json = JSON.parse(run.stdout.slice(run.stdout.indexOf('{'))) as {
    stats: { expected: number; unexpected: number; flaky: number; skipped: number };
    errors?: unknown[];
  };
  expect(json.stats.expected + json.stats.unexpected + json.stats.flaky, '防空转：确实跑了（f856c9e 为 20 个用例 × 5 遍）').toBeGreaterThanOrEqual(50);
  expect({ unexpected: json.stats.unexpected, flaky: json.stats.flaky, errors: json.errors ?? [], exit: run.status }).toEqual({
    unexpected: 0,
    flaky: 0,
    errors: [],
    exit: 0,
  });
});
