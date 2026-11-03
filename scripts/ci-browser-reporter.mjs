/** Public Playwright reporter: enumeration and execution are deliberately different artifacts. */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { approvedCaseStatus, canonicalCases, assertSelectedCases, validateShardReport } from './ci-shards.mjs';

export function collectBrowserCases(config, suite, { directory = process.cwd(), env = process.env } = {}) {
  assert.ok(!env.V0300_RECORD && !env.V0290_RECORD, 'CI browser collection cannot record golden fixtures');
  return canonicalCases(
    suite.allTests().map((test) => {
      const describes = [];
      for (let parent = test.parent; parent; parent = parent.parent) if (parent.type === 'describe' && parent.title) describes.unshift(parent.title);
      const value = {
        id: test.id,
        project: test.parent.project()?.name ?? '',
        file: relative(directory, test.location.file).replaceAll('\\', '/'),
        selectorFile: relative(config.rootDir, test.location.file).replaceAll('\\', '/'),
        titlePath: [...describes, test.title],
        repeatEachIndex: test.repeatEachIndex,
        expectedStatus: test.expectedStatus,
      };
      return { ...value, ...approvedCaseStatus(value, env) };
    }),
  );
}

function writeJson(path, value) {
  assert.ok(path, 'Missing CI browser report path');
  mkdirSync(dirname(path), { recursive: true });
  const temporary = path + '.' + process.pid + '.partial';
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  renameSync(temporary, path);
}

export default class BrowserReporter {
  constructor(options = {}) {
    this.env = options.env ?? process.env;
    this.mode = options.mode ?? this.env.CI_BROWSER_MODE;
    this.output = options.output ?? this.env.CI_BROWSER_REPORT;
    this.manifestPath = options.manifest ?? this.env.CI_BROWSER_MANIFEST;
    this.index = Number(options.shard ?? this.env.CI_BROWSER_SHARD);
    this.errors = [];
    this.actual = [];
    this.startedAt = new Date().toISOString();
  }

  onBegin(config, suite) {
    try {
      assert.ok(['list', 'run'].includes(this.mode), 'Unknown CI browser reporter mode');
      this.selected = collectBrowserCases(config, suite, { env: this.env });
      if (this.manifestPath) {
        this.manifest = JSON.parse(readFileSync(this.manifestPath, 'utf8'));
        assertSelectedCases(this.manifest, this.index, this.selected);
      }
      if (this.mode === 'run') assert.ok(this.manifest?.sourceBuild, 'Run needs an actual immutable build snapshot');
    } catch (error) {
      this.errors.push(error.message);
    }
  }

  onTestEnd(test, result) {
    this.actual.push({
      id: test.id,
      key: this.selected?.find((value) => value.id === test.id)?.key ?? '',
      status: result.status,
      expectedStatus: test.expectedStatus,
      outcome: test.outcome(),
      retry: result.retry,
      duration: result.duration,
      annotations: (result.annotations ?? test.annotations ?? []).map((a) => ({ type: a.type, description: a.description ?? null })),
    });
  }

  onError(error) {
    this.errors.push(error.message ?? String(error));
  }

  async onEnd(result) {
    const finishedAt = new Date().toISOString();
    if (this.mode === 'list') {
      const report = { schema: 1, kind: 'browser-enumeration', cases: this.selected ?? [], errors: this.errors };
      if (result.status !== 'passed') this.errors.push('Playwright enumeration did not pass: ' + result.status);
      writeJson(this.output, report);
      return this.errors.length ? { status: 'failed' } : undefined;
    }
    const report = {
      schema: 1,
      kind: 'browser-execution',
      shardIndex: this.index,
      sourceBuild: this.manifest?.sourceBuild ?? null,
      caseDigest: this.manifest?.shards.find((shard) => shard.index === this.index)?.caseDigest ?? null,
      selectedCases: this.selected ?? [],
      cases: this.actual,
      status: result.status === 'passed' && !this.errors.length ? 'passed' : 'failed',
      errors: this.errors,
      startedAt: this.startedAt,
      finishedAt,
    };
    try {
      assert.ok(this.manifest, 'Missing frozen browser manifest');
      validateShardReport(this.manifest, this.index, report);
    } catch (error) {
      this.errors.push(error.message);
      report.status = 'failed';
    }
    writeJson(this.output, report);
    return report.status === 'passed' ? undefined : { status: 'failed' };
  }
}
