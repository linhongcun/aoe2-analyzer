import { existsSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
// @ts-expect-error CI scripts are plain Node modules
import { PROFILES, applyBrowserPolicy, planChanges, prCappedExcludes } from '../../scripts/ci-scope.mjs';
// @ts-expect-error CI scripts are plain Node modules
import { testCommand } from '../../scripts/ci-run.mjs';

const change = (path: string, before: string | null = '', after: string | null = '') => ({ path, before, after });
const pr = { GITHUB_EVENT_NAME: 'pull_request', CI_E2E_FULL: 'false' };
const mainPush = { GITHUB_EVENT_NAME: 'push', CI_E2E_FULL: 'true', GITHUB_REF: 'refs/heads/main' };
const spec = (name: string) => `tests/e2e/${name}.spec.ts`;
const HARD = [
  'v0300-338',
  'screenshots',
  'stepContrast',
  'overflow64',
  'cardWrap78',
  'cardWrap78Paren',
  'mobile361-359-366',
  'touchTargets481',
  'finalCivs197',
];

it('#659 global tour files stay on disk and outside unrelated narrow gates', () => {
  for (const name of HARD) expect(existsSync(spec(name)), name).toBe(true);
  for (const name of readdirSync('tests/e2e').filter((file) => /^\w+197\.spec\.ts$/.test(file) || file.startsWith('timeline')))
    expect(existsSync(`tests/e2e/${name}`)).toBe(true);
  const guards = HARD.map(spec);
  const capped = applyBrowserPolicy(
    {
      scope: 'targeted',
      full: false,
      data: false,
      features: ['civs', 'duel'],
      unit: [],
      e2e: [...guards, spec('smoke'), spec('timeline'), spec('timeline45'), spec('timelineLabels472'), spec('build41'), spec('rush35'), spec('rushGeneric507')],
      paths: ['src/shared/nav/pageRegistry.ts', 'src/shared/styles/tokens.css', 'src/shared/styles/layout.css'],
    },
    pr,
  );
  expect(capped.e2e).toEqual([spec('smoke')]);
  expect(capped.browser).toBe('capped');
  for (const name of HARD) expect(prCappedExcludes(spec(name), [spec(name)])).toBe(true);
});

it('#659 pageRegistry and global shared CSS require complete browser coverage even on a PR', () => {
  for (const input of [
    change('src/shared/nav/pageRegistry.ts'),
    change('src/app/pageRegistry.tsx'),
    change('src/shared/styles/tokens.css'),
    change('src/shared/styles/base.css', '', 'body { display:none }'),
  ]) {
    const selected = applyBrowserPolicy(planChanges([input]), pr);
    expect(selected).toMatchObject({ full: true, browser: 'full' });
    expect(testCommand(selected, 'e2e').args).toEqual(['playwright', 'test', '--reporter=line']);
  }
  const duel = applyBrowserPolicy(
    planChanges([change('src/shared/nav/pageRegistry.ts'), change('src/shared/styles/layout.css'), change('src/features/duel/components/Duel.tsx')]),
    pr,
  );
  expect(duel).toMatchObject({ scope: 'full', full: true, browser: 'full' });
  expect(testCommand(duel, 'e2e').args).toEqual(['playwright', 'test', '--reporter=line']);
  const civ = applyBrowserPolicy(planChanges([change('src/shared/styles/tokens.css'), change('src/features/civs/CivDetail.tsx')]), pr);
  expect(civ).toMatchObject({ full: true, browser: 'full' });
  expect(testCommand(civ, 'e2e').args).toEqual(['playwright', 'test', '--reporter=line']);
});

it('#659 a feature keeps its own width/theme guard; unrelated civs and long tours need actual owners', () => {
  const matrix = readdirSync('tests/e2e')
    .filter((name) => name.endsWith('197.spec.ts') || name === 'civDlcFilters.spec.ts' || name === 'smoke.spec.ts')
    .map((name) => `tests/e2e/${name}`);
  const wei = applyBrowserPolicy(
    { scope: 'targeted', full: false, data: false, features: ['civs'], unit: [], e2e: matrix, paths: ['tests/unit/wei197.test.ts'] },
    pr,
  );
  expect(wei.e2e).toEqual([spec('civDlcFilters'), spec('smoke'), spec('wei197')]);
  const shu = applyBrowserPolicy(
    { scope: 'targeted', full: false, data: false, features: ['civs'], unit: [], e2e: matrix, paths: ['tests/e2e/shuDisplayNames470.spec.ts'] },
    pr,
  );
  expect(shu.e2e).toEqual([spec('civDlcFilters'), spec('shu197'), spec('smoke')].sort());
  const broad = applyBrowserPolicy(
    { scope: 'targeted', full: false, data: false, features: ['civs'], unit: [], e2e: matrix, paths: ['src/features/civs/CivDetail.tsx'] },
    pr,
  );
  expect(broad.e2e).toEqual([spec('civDlcFilters'), spec('smoke')]);
  expect(prCappedExcludes(spec('wei197'), ['src/domain/weight.ts'])).toBe(true);
  expect(prCappedExcludes(spec('wei197'), ['docs/design/wei197-source.json'])).toBe(false);

  const builds = applyBrowserPolicy(planChanges([change('src/features/builds/BuildOrderList.tsx')]), pr);
  expect(builds.e2e).toContain(spec('build41'));
  const presentation = planChanges([change('src/domain/sourcePresentation.mjs')]);
  expect(presentation.e2e).toContain(spec('build41'));
  expect(applyBrowserPolicy(presentation, pr).e2e).not.toContain(spec('build41'));
  expect(applyBrowserPolicy(presentation, pr).e2e).toContain(spec('practice216'));
  expect(applyBrowserPolicy(presentation, mainPush).e2e).not.toContain(spec('build41'));

  const route = applyBrowserPolicy(planChanges([change('src/domain/simRoute.ts')]), pr);
  expect(route).toMatchObject({ full: true, browser: 'full' });
  expect(testCommand(route, 'e2e').args).toEqual(['playwright', 'test', '--reporter=line']);
  expect(applyBrowserPolicy(planChanges([change('src/features/matchup/components/RushDefense.tsx')]), pr).e2e).toContain(spec('rush35'));
  expect(applyBrowserPolicy(planChanges([change('src/features/matchup/rushGuides.ts'), change(spec('rushGeneric507'))]), pr).e2e).toEqual(
    expect.arrayContaining([spec('rush35'), spec('rushGeneric507')]),
  );
  expect(applyBrowserPolicy(planChanges([change(spec('rushGeneric507'))]), pr).e2e).toEqual([spec('rushGeneric507'), spec('smoke')]);
  expect(
    applyBrowserPolicy(
      {
        scope: 'targeted',
        full: false,
        data: false,
        features: ['matchup'],
        unit: [],
        e2e: [spec('rushGeneric507'), spec('smoke')],
        paths: ['src/features/civs/CivDetail.tsx'],
      },
      pr,
    ).e2e,
  ).toEqual([spec('smoke')]);

  const tours = applyBrowserPolicy(planChanges([change(spec('timeline')), change(spec('timeline45')), change(spec('timelineLabels472'))]), pr);
  expect(tours.e2e).toEqual([spec('smoke'), spec('timeline'), spec('timeline45'), spec('timelineLabels472')]);
  const duelTimeline = applyBrowserPolicy(
    {
      scope: 'targeted',
      full: false,
      data: false,
      features: ['duel'],
      unit: [],
      e2e: [spec('timeline'), spec('timelineLabels472'), spec('smoke')],
      paths: ['src/features/duel/components/DuelTimeline.tsx'],
    },
    pr,
  );
  expect(duelTimeline.e2e).toEqual([spec('smoke')]);
});

it('#659 narrow main/PR retain the duel regressions, while nightly and edits to global guards run full', () => {
  const duel = planChanges([change('src/features/duel/components/Duel.tsx')]);
  expect(PROFILES.duel.e2e).toContain(spec('overflow64'));
  expect(duel.e2e).toContain(spec('overflow64'));
  const capped = applyBrowserPolicy(duel, pr);
  expect(capped.e2e).not.toContain(spec('overflow64'));
  expect(capped.e2e).toContain(spec('duelHeading364'));
  expect(applyBrowserPolicy(capped, pr)).toEqual(capped);
  expect(applyBrowserPolicy(duel, mainPush).e2e).not.toContain(spec('overflow64'));
  const nightly = applyBrowserPolicy(duel, { GITHUB_EVENT_NAME: 'schedule', CI_E2E_FULL: 'true' });
  expect(nightly).toMatchObject({ browser: 'full', full: true, data: true });
  expect(testCommand(nightly, 'e2e').args).toEqual(['playwright', 'test', '--reporter=line']);
  const removed = applyBrowserPolicy(planChanges([change(spec('v0300-338')), change(spec('overflow64')), change(spec('screenshots'))]), pr);
  expect(removed).toMatchObject({ browser: 'full', full: true });
  expect(testCommand(removed, 'e2e').args).toEqual(['playwright', 'test', '--reporter=line']);
  expect(applyBrowserPolicy(planChanges([change(spec('v0300-338'))]), mainPush)).toMatchObject({ browser: 'full', full: true });
});
