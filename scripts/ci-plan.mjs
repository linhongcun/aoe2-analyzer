/** Freeze exact test collections before dispatching independent runner jobs. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve, join } from 'node:path';
import { resolveTestFiles, validatePlan } from './ci-run.mjs';
import { canonicalSelection, toolchainDigest, policyDigest } from './ci-stage-evidence.mjs';
import { STATIC_CHECKS, DATA_CHECKS, mainChecks } from './ci-commands.mjs';

export const hash = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value))
    .digest('hex');
export const unitCaseId = (file, name) => hash([file, name]);
const unitTodo = '#42 P0 buildSim 文明加成不得静默忽略 > 高棉：农田为瓶颈的开局里，去掉 654 必须让结果变慢（证明后再把高棉放出来）';
const unitSkipped = [
  ['tests/unit/buildSim.test.ts', unitTodo],
  ['tests/unit/bonusUsage317.test.ts', 'issue 317 全部 src = eco 的加成：标签与工具实际计算一致 > （UPDATE_BONUS317=1）重新生成开局模拟快照'],
  [
    'tests/unit/v0300-289.test.ts',
    '#289 计时（全量跑一遍；V0300_289_TIMING=1 才跑） > 每个 formatTime*.test.ts 单独跑（含收集与 beforeAll）<20 秒；全量 vitest 墙钟 <60 秒；f856c9e 的 formatTime / civ42v070 用例名全部还在且通过',
  ],
];
export function collectedUnitCases(list, directory = process.cwd()) {
  assert.ok(Array.isArray(list) && list.length, 'Empty unit collection');
  // Vitest list omits disabled runIf/skipIf cases. Freeze these existing exact exceptions explicitly;
  // the actual JSON report must still contain each ID with skipped status, never arbitrary new skips.
  list = [...list];
  for (const [file, name] of unitSkipped) {
    const absolute = resolve(directory, file);
    if (list.some((c) => c.file === absolute) && !list.some((c) => c.file === absolute && c.name === name)) list.push({ file: absolute, name });
  }
  const cases = list.map((entry) => {
    const file = relative(directory, entry.file).replaceAll('\\', '/');
    assert.match(file, /^tests\/unit\/[\w.-]+\.test\.ts$/);
    assert.ok(typeof entry.name === 'string' && entry.name);
    const expectedStatus = unitSkipped.some(([path, name]) => path === file && name === entry.name) ? 'skipped' : 'passed';
    return { id: unitCaseId(file, entry.name), file, name: entry.name, expectedStatus };
  });
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length, 'Duplicate unit case identities');
  return cases.sort((a, b) => a.id.localeCompare(b.id));
}
export function actualUnitExecution(report, directory = process.cwd()) {
  assert.equal(report.success, true, 'Vitest did not succeed');
  assert.ok(Array.isArray(report.testResults) && report.testResults.length, 'Missing actual unit results');
  const files = [],
    cases = [];
  for (const result of report.testResults) {
    const file = relative(directory, result.name).replaceAll('\\', '/');
    files.push(file);
    for (const test of result.assertionResults) {
      cases.push({
        id: unitCaseId(file, [...test.ancestorTitles, test.title].join(' > ')),
        status: ['pending', 'todo', 'skipped'].includes(test.status) ? 'skipped' : test.status,
      });
    }
  }
  assert.equal(new Set(files).size, files.length, 'Duplicate executed unit files');
  return { checks: ['vitest'], files: files.sort(), cases };
}
export async function readToolchain(budget) {
  const python = await budget.run('python3', ['--version'], { capture: true });
  return {
    node: process.version,
    python: python.stdout.trim(),
    platform: process.platform,
    arch: process.arch,
    package_lock: hash(readFileSync('package-lock.json')),
    playwright: JSON.parse(readFileSync('node_modules/playwright-core/package.json', 'utf8')).version,
    browsers: hash(readFileSync('node_modules/playwright-core/browsers.json')),
    data_sources: hash(readFileSync('scripts/data_sources.json')),
    background_sources: hash(readFileSync('src/features/civs/backgrounds.source.json')),
    pillow: '12.3.0',
  };
}
export function makeRequirement(stage_id, selection, fingerprint, reusable = true) {
  return { stage_id, job_name: stage_id, reusable, selection: canonicalSelection(selection), toolchain_digest: fingerprint };
}
export function frozenRequirements(plan, toolchain, unitCases, shards, eventName) {
  validatePlan(plan);
  const fingerprint = toolchainDigest(toolchain);
  const requirements = [makeRequirement('static', { checks: STATIC_CHECKS.map((c) => c[0]) }, fingerprint)];
  if (eventName !== 'pull_request') requirements.push(makeRequirement('static-main', { checks: mainChecks(plan).map((c) => c[0]) }, fingerprint, false));
  if (unitCases.length)
    requirements.push(makeRequirement('unit', { checks: ['vitest'], files: [...new Set(unitCases.map((c) => c.file))].sort(), cases: unitCases }, fingerprint));
  if (plan.data) requirements.push(makeRequirement('data', { checks: DATA_CHECKS.map((c) => c[0]) }, fingerprint));
  requirements.push(makeRequirement('build', { checks: ['build', 'snapshot', 'fresh-build-smoke'] }, fingerprint, false));
  for (const shard of shards)
    requirements.push(
      makeRequirement(
        `browser-${shard.index}`,
        {
          checks: ['playwright'],
          files: [...new Set(shard.cases.map((c) => c.file))].sort(),
          cases: shard.cases,
        },
        fingerprint,
      ),
    );
  return requirements;
}
export async function collectUnits(plan, budget, folder) {
  assert.ok(!process.env.UPDATE_BONUS317 && !process.env.V0300_289_TIMING, 'CI cannot enable record-only or recursive timing unit cases');
  const files = resolveTestFiles(plan.full ? ['tests/unit/*.test.ts'] : plan.unit, 'unit');
  if (!files.length) return [];
  const output = join(folder, 'unit-collection.json');
  await budget.run('npx', ['vitest', 'list', ...files, '--maxWorkers=2', '--minWorkers=1', `--json=${output}`]);
  const cases = collectedUnitCases(JSON.parse(readFileSync(output, 'utf8')), resolve('.'));
  assert.deepEqual([...new Set(cases.map((c) => c.file))].sort(), files, 'Unit file collection differs from frozen selection');
  return cases;
}
export function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
export { policyDigest };
