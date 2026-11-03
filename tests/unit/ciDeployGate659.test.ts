import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const deploy = workflow.slice(workflow.indexOf('\n  deploy:\n'));
const frozenIf = deploy.match(/^ {4}if: ([^\n]+)\n((?: {6}[^\n]*\n)*)/m);
if (!frozenIf) throw new Error('Missing actual deploy job condition');
const expression = (frozenIf[1] === '>-' ? frozenIf[2] : frozenIf[1])!.trim().replace(/\s+/g, ' ');

type Context = { plan: string; test: string; event: string; ref: string; cancelled: boolean; ancestors: string[] };
const mainPush: Context = {
  plan: 'success',
  test: 'success',
  event: 'push',
  ref: 'refs/heads/main',
  cancelled: false,
  ancestors: ['success', 'success', 'success', 'success', 'success', 'success'],
};

function eligible(changes: Partial<Context>) {
  const context = { ...mainPush, ...changes };
  // GitHub supplies implicit success() when no status function occurs. This models the
  // skipped reusable ancestors observed in real main run 41648845367, not a runner certification.
  const explicitStatus = /\b(?:always|cancelled|failure|success)\s*\(/.test(expression);
  const implicitSuccess = !context.cancelled && [context.plan, context.test, ...context.ancestors].every((result) => result === 'success');
  if (!explicitStatus && !implicitSuccess) return false;
  return runInNewContext(
    'Boolean(' + expression + ')',
    {
      needs: { plan: { result: context.plan }, test: { result: context.test } },
      github: { event_name: context.event, ref: context.ref },
      cancelled: () => context.cancelled,
    },
    { timeout: 1000 },
  );
}

describe('#659 actual deployment condition after strict aggregation', () => {
  it.each<[string, Partial<Context>, boolean]>([
    ['fresh main push with successful direct gates', {}, true],
    ['six reusable ancestors skipped with successful direct gates', { ancestors: Array(6).fill('skipped') }, true],
    [
      'mixed executed and reused ancestors with successful direct gates',
      { ancestors: ['success', 'skipped', 'skipped', 'success', 'skipped', 'skipped'] },
      true,
    ],
    ['failed plan', { plan: 'failure' }, false],
    ['cancelled plan', { plan: 'cancelled' }, false],
    ['skipped plan', { plan: 'skipped' }, false],
    ['failed strict aggregate', { test: 'failure' }, false],
    ['cancelled strict aggregate', { test: 'cancelled' }, false],
    ['skipped strict aggregate', { test: 'skipped' }, false],
    ['unfinished strict aggregate', { test: 'in_progress' }, false],
    ['cancelled workflow after successful gates', { cancelled: true }, false],
    ['pull request', { event: 'pull_request', ref: 'refs/pull/681/merge' }, false],
    ['pull request naming main', { event: 'pull_request' }, false],
    ['scheduled run on main', { event: 'schedule' }, false],
    ['manual run on main', { event: 'workflow_dispatch' }, false],
    ['release branch push', { ref: 'refs/heads/release/v0.77.2' }, false],
    ['feature branch push', { ref: 'refs/heads/fix/659' }, false],
    ['version tag push', { ref: 'refs/tags/v0.77.2' }, false],
  ])('%s', (_name, changes, expected) => {
    expect(eligible(changes)).toBe(expected);
  });
});
