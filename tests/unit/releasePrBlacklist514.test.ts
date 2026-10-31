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
  'civDlcFilters',
];

it('#514 §C blacklist files stay on disk and out of every pull_request capped list', () => {
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

it('#514 pageRegistry and shared CSS pull at most smoke plus the touched feature', () => {
  expect(applyBrowserPolicy(planChanges([change('src/shared/nav/pageRegistry.ts')]), pr).e2e).toEqual([spec('smoke')]);
  expect(applyBrowserPolicy(planChanges([change('src/app/pageRegistry.tsx')]), pr).e2e).toEqual([spec('smoke')]);
  expect(applyBrowserPolicy(planChanges([change('src/shared/styles/tokens.css')]), pr).e2e).toEqual([spec('smoke')]);
  expect(applyBrowserPolicy(planChanges([change('src/shared/styles/base.css', '', 'body { display:none }')]), pr).e2e).toEqual([spec('smoke')]);
  const duel = applyBrowserPolicy(
    planChanges([change('src/shared/nav/pageRegistry.ts'), change('src/shared/styles/layout.css'), change('src/features/duel/components/Duel.tsx')]),
    pr,
  );
  expect(duel).toMatchObject({ scope: 'full', full: true, browser: 'capped' });
  expect(duel.e2e).toContain(spec('smoke'));
  expect(duel.e2e).toContain(spec('duelHeading364'));
  expect(duel.e2e).not.toContain(spec('overflow64'));
  expect(duel.e2e).not.toContain(spec('v0300-338'));
  expect(duel.e2e.some((path: string) => path.includes('197') || path.endsWith('civDlcFilters.spec.ts'))).toBe(false);
  const civ = applyBrowserPolicy(planChanges([change('src/shared/styles/tokens.css'), change('src/features/civs/CivDetail.tsx')]), pr);
  expect(civ.e2e).toContain(spec('civ77'));
  expect(civ.e2e).toContain(spec('smoke'));
  expect(civ.e2e).not.toContain(spec('civDlcFilters'));
  expect(civ.e2e.some((path: string) => /197\.spec\.ts$/.test(path))).toBe(false);
});

it('#514 one civilization stays, the matrix does not, and long tours need that feature', () => {
  const matrix = readdirSync('tests/e2e')
    .filter((name) => name.endsWith('197.spec.ts') || name === 'civDlcFilters.spec.ts' || name === 'smoke.spec.ts')
    .map((name) => `tests/e2e/${name}`);
  const wei = applyBrowserPolicy(
    { scope: 'targeted', full: false, data: false, features: ['civs'], unit: [], e2e: matrix, paths: ['tests/unit/wei197.test.ts'] },
    pr,
  );
  expect(wei.e2e).toEqual([spec('smoke'), spec('wei197')]);
  const shu = applyBrowserPolicy(
    { scope: 'targeted', full: false, data: false, features: ['civs'], unit: [], e2e: matrix, paths: ['tests/e2e/shuDisplayNames470.spec.ts'] },
    pr,
  );
  expect(shu.e2e).toEqual([spec('shu197'), spec('smoke')].sort());
  const broad = applyBrowserPolicy(
    { scope: 'targeted', full: false, data: false, features: ['civs'], unit: [], e2e: matrix, paths: ['src/features/civs/CivDetail.tsx'] },
    pr,
  );
  expect(broad.e2e).toEqual([spec('smoke')]);
  expect(prCappedExcludes(spec('wei197'), ['src/domain/weight.ts'])).toBe(true);
  expect(prCappedExcludes(spec('wei197'), ['docs/design/wei197.md'])).toBe(false);

  const builds = applyBrowserPolicy(planChanges([change('src/features/builds/BuildOrderList.tsx')]), pr);
  expect(builds.e2e).toContain(spec('build41'));
  const presentation = planChanges([change('src/domain/sourcePresentation.mjs')]);
  expect(presentation.e2e).toContain(spec('build41'));
  expect(applyBrowserPolicy(presentation, pr).e2e).not.toContain(spec('build41'));
  expect(applyBrowserPolicy(presentation, pr).e2e).toContain(spec('practice216'));
  expect(applyBrowserPolicy(presentation, mainPush).e2e).toContain(spec('build41'));

  const route = applyBrowserPolicy(planChanges([change('src/domain/simRoute.ts')]), pr);
  expect(route.e2e).not.toContain(spec('rush35'));
  expect(route.e2e).toContain(spec('matchupSim424'));
  expect(applyBrowserPolicy(planChanges([change('src/features/matchup/components/RushDefense.tsx')]), pr).e2e).toContain(spec('rush35'));
  expect(applyBrowserPolicy(planChanges([change('src/features/matchup/rushGuides.ts'), change(spec('rushGeneric507'))]), pr).e2e).toEqual(
    expect.arrayContaining([spec('rush35'), spec('rushGeneric507')]),
  );
  expect(applyBrowserPolicy(planChanges([change(spec('rushGeneric507'))]), pr).e2e).toEqual([spec('rushGeneric507')]);
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
  expect(tours.e2e).toEqual([spec('timeline'), spec('timeline45'), spec('timelineLabels472')]);
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

it('#514 main and nightly keep the blacklisted specs; a duel PR drops only the guard', () => {
  const duel = planChanges([change('src/features/duel/components/Duel.tsx')]);
  expect(PROFILES.duel.e2e).toContain(spec('overflow64'));
  expect(duel.e2e).toContain(spec('overflow64'));
  const capped = applyBrowserPolicy(duel, pr);
  expect(capped.e2e).not.toContain(spec('overflow64'));
  expect(capped.e2e).toContain(spec('duelHeading364'));
  expect(applyBrowserPolicy(capped, pr)).toEqual(capped);
  expect(applyBrowserPolicy(duel, mainPush).e2e).toContain(spec('overflow64'));
  expect(applyBrowserPolicy(duel, { GITHUB_EVENT_NAME: 'schedule', CI_E2E_FULL: 'true' }).e2e).toContain(spec('overflow64'));
  const removed = applyBrowserPolicy(planChanges([change(spec('v0300-338')), change(spec('overflow64')), change(spec('screenshots'))]), pr);
  expect(removed).toMatchObject({ browser: 'none', e2e: [] });
  expect(testCommand(removed, 'e2e')).toBeNull();
  expect(applyBrowserPolicy(planChanges([change(spec('v0300-338'))]), mainPush).e2e).toEqual([spec('v0300-338')]);
});
