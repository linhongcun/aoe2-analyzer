import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import postcss from 'postcss';

const sha = /^[0-9a-f]{40}$/;
const version = /^\d+\.\d+\.\d+$/;
const cssFiles = new Set(['src/shared/styles/base.css', 'src/shared/styles/editorial.css']);
const maintenanceFiles = new Set([
  'scripts/release.mjs',
  'scripts/prepare-release.mjs',
  'scripts/check-pr-title.mjs',
  'scripts/ci-scope.mjs',
  'scripts/ci-run.mjs',
  'scripts/ci-evidence.mjs',
  'scripts/deployment-smoke.mjs',
  'scripts/site-artifact.mjs',
  'scripts/release-online-smoke.mjs',
]);
const unit = (...names) => names.map((name) => `tests/unit/${name}.test.ts`);
const e2e = (...names) => names.map((name) => `tests/e2e/${name}.spec.ts`);
const profile = (unitNames, e2eNames) => ({ unit: unit(...unitNames), e2e: e2e(...e2eNames) });
const sourceChecks = [
  'contentSchema285',
  'contentSources285',
  'generatedSchemas285',
  'jsonBoundary285',
  'sourcePolicy285',
  'sourcePresentation442',
  'sourcePresentationScope442',
];

/** Page-local changes use the page's real existing regression coverage, including its helpers. */
export const PROFILES = {
  builds: profile(
    [...sourceChecks, 'sources', 'boSources', 'buildOrders', 'buildOrders.content', 'buildPractice216', 'buildSim', 'build41', 'v0300-335'],
    ['sourcePresentation442', 'practice216', 'build41', 'v0290-322-golden'],
  ),
  gameGuide: profile([...sourceChecks, 'gameGuide256', 'v0300-335'], ['sourcePresentation442', 'gameGuide256']),
  patches: profile(['patches16', 'patchTree417', 'patchSearch16'], ['patches16', 'patchTree417']),
  matchup: profile(['matchup194', 'p0Batch', 'simRoute424', 'simulator'], ['matchup194', 'matchupSim424', 'rush35']),
  civs: profile(
    ['civRequirements206', 'civText402', 'civOpening77', 'civBonus', 'dlc-linker', 'civRegionalUnits450'],
    ['civDlcFilters', 'civRequirements206', 'civText402', 'civ77', 'v0290-326', 'layout62', 'catalogLayout187', 'civRegionalUnits450'],
  ),
  units: profile(
    ['unitFilters192', 'unitFilters196', 'unitCount14', 'unitNames271', 'unitAge11', 'upgradeLine10', 'relatedTechs193', 'family', 'simRoute424', 'simulator'],
    ['unitCards6', 'unitFilters196', 'units192', 'unitCount14', 'dupNames44', 'upgradeLine10', 'relatedTechs193', 'sidebar44', 'catalogLayout187'],
  ),
  simulator: profile(['simulator', 'simRoute424', 'prereq'], ['layout62', 'matchupSim424', 'upgradeLine10']),
  techs: profile(
    ['affects', 'techUnits13', 'techBuilding12', 'techCost355', 'relatedTechs193'],
    ['techCards6', 'techUnits13', 'relatedTechs193', 'catalogLayout187'],
  ),
  duel: profile(
    [
      'duel',
      'duelParams281',
      'costDiscount24',
      'realCost88',
      'simulator',
      'buildingSim',
      'prereq',
      'damage105',
      'age106',
      'replay104',
      'breakEven',
      'breakEven.gaps',
      'upgrades205',
      'upgradesState205',
      'varangianPk350',
      'varangianGold383',
      'v0280-281',
      'v0290-322',
      'headingScope364',
      'duelPreset372',
    ],
    [
      'duelHeading364',
      'duelPreset372',
      'listHeadH1296',
      'v0280-duel-url',
      'v0290-322-golden',
      'damage105',
      'age106',
      'replay104',
      'upgrades205',
      'varangian350',
      'pkDiscount24',
      'v070-88',
      'pkUnavail124',
      'v080-124',
      'breakEven25',
      'breakEven.stale',
      'breakEven.colors',
      'breakEven.gaps',
      'smoke',
      'overflow64',
      'refactor288',
    ],
  ),
  buildings: profile(
    ['buildings', 'buildingSim', 'buildingAge357', 'garrison218', 'garrisonGeneral224'],
    ['garrison218', 'garrison224', 'sidebar44', 'catalogLayout187'],
  ),
  maps: profile([], ['maps34', 'mapPreviews', 'mapCatalog422']),
  compare: profile(['compare403', 'teamBonuses228'], ['compare403', 'civText402', 'teamBonuses228']),
};
const sourcePresentationFiles = new Map([
  ['src/domain/sourcePresentation.mjs', ['builds', 'gameGuide']],
  ['src/domain/sourcePresentation.d.mts', ['builds', 'gameGuide']],
  ['src/domain/gameGuide.ts', ['gameGuide']],
  ['scripts/check-source-presentation.mjs', ['builds', 'gameGuide']],
  ['scripts/check-source-presentation.d.mts', ['builds', 'gameGuide']],
  ['src/content/schema/public-build-sources.json', ['builds']],
  ['src/content/schema/public-game-guide-sources.json', ['gameGuide']],
]);
const rawSourceSchemas = new Map([
  ['src/content/schema/data-build-order.json', 'builds'],
  ['src/content/schema/content-game-guide.json', 'gameGuide'],
]);
const emptySourceBaseline = 'export const LEGACY_SOURCE_BASELINE = Object.freeze([]);';

/** Only the complete, canonical empty module can remove the frozen migration debt. */
export function removesSourceBaseline(before, after) {
  return typeof before === 'string' && before.trim() !== emptySourceBaseline && typeof after === 'string' && after.trim() === emptySourceBaseline;
}

/** Only citation subtrees may use the source UI plan; step/card structures stay conservative. */
export function sourceSchemaOnly(path, before, after) {
  if (!rawSourceSchemas.has(path) || typeof before !== 'string' || typeof after !== 'string') return false;
  const normalize = (text) => {
    const schema = JSON.parse(text);
    if (!schema || typeof schema !== 'object' || !schema.properties || !schema.$defs) throw new Error('Missing raw schema shape');
    if (path === 'src/content/schema/data-build-order.json') {
      if (schema.allOf !== undefined) {
        const pattern = schema.properties.license?.anyOf?.[1]?.pattern;
        if (typeof pattern !== 'string') throw new Error('Unknown source condition');
        const condition = [
          {
            if: { properties: { license: { type: 'string', pattern } }, required: ['license'] },
            then: { properties: { sources: { type: 'array', contains: { $ref: '#/$defs/aoe2GuideProvenance' } } } },
          },
        ];
        if (!isDeepStrictEqual(schema.allOf, condition)) throw new Error('Non-source condition');
        delete schema.allOf;
      }
      delete schema.properties.license;
      delete schema.$defs.publicSource;
      delete schema.$defs.aoe2GuideProvenance;
    } else delete schema.$defs.pinnedTechProvenance;
    delete schema.properties.sources;
    return schema;
  };
  try {
    return isDeepStrictEqual(normalize(before), normalize(after));
  } catch {
    return false;
  }
}
const sorted = (values) => [...new Set(values)].sort();
const validPath = (path) =>
  typeof path === 'string' && !!path && !/[\\\0]/.test(path) && path.split('/').every((part) => part && part !== '.' && part !== '..');

function fullPlan(data = true, features = []) {
  return { scope: 'full', features: sorted(['all', ...features]), unit: [], e2e: [], data, full: true };
}

function maintenancePlan() {
  return { scope: 'maintenance', features: [], unit: ['tests/unit/release*.test.ts'], e2e: [], data: false, full: false };
}

/** Dependency, script, lock resolution and integrity changes always retain full checks. */
export function versionOnly(path, before, after) {
  try {
    const a = JSON.parse(before),
      b = JSON.parse(after);
    if (!version.test(a.version) || !version.test(b.version)) return false;
    delete a.version;
    delete b.version;
    if (path === 'package-lock.json') {
      if (!version.test(a.packages?.['']?.version) || !version.test(b.packages?.['']?.version)) return false;
      delete a.packages[''].version;
      delete b.packages[''].version;
    }
    return isDeepStrictEqual(a, b);
  } catch {
    return false;
  }
}

/** Only the removed civilization badge and its replacement spacing can use the visual subset. */
export function civCssOnly(before, after) {
  const normalize = (source) => {
    if (typeof source !== 'string') throw new Error('Missing stylesheet');
    const root = postcss.parse(source);
    root.walkComments((comment) => comment.remove());
    root.walkRules((rule) => {
      if (rule.selectors.every((selector) => ['.cdl', '#grid .card .mini'].includes(selector.trim()))) rule.remove();
    });
    // Compare syntax nodes rather than formatting, source positions or comments.
    const node = (item) => {
      if (item.type === 'decl') return ['decl', item.prop, item.value, !!item.important];
      if (item.type === 'rule') return ['rule', item.selector, item.nodes.map(node)];
      if (item.type === 'atrule') return ['at', item.name, item.params, item.nodes?.map(node)];
      return [item.type, item.nodes?.map(node)];
    };
    return node(root);
  };
  try {
    return isDeepStrictEqual(normalize(before), normalize(after));
  } catch {
    return false;
  }
}

function cardsCssOnly(before, after) {
  try {
    return [before, after].every((source) => {
      if (typeof source !== 'string') return false;
      const root = postcss.parse(source);
      let scoped = true;
      root.walkAtRules((rule) => {
        if (!['media', 'supports'].includes(rule.name)) scoped = false;
      });
      root.walkRules((rule) => {
        if (
          rule.selectors.some(
            (selector) => !/^(?:#matchup|\.matchup-counter-[a-z-]+|\.same-dlc-(?:civs|toggle))(?=$|\s|[.:#>\[])/.test(selector) || /[+~]/.test(selector),
          )
        )
          scoped = false;
      });
      return scoped;
    });
  } catch {
    return false;
  }
}

/** A local Duel stylesheet cannot escape its page root or introduce global at-rules. */
export function duelCssOnly(before, after) {
  const sources = [before, after].filter((source) => source !== null);
  if (!sources.length) return false;
  try {
    return sources.every((source) => {
      if (typeof source !== 'string') return false;
      const root = postcss.parse(source);
      let scoped = true,
        rules = 0;
      root.walkAtRules((rule) => {
        if (!['media', 'supports'].includes(rule.name)) scoped = false;
      });
      root.walkRules((rule) => {
        rules++;
        if (rule.selectors.some((selector) => !/^#duel(?=$|\s|[.:#>\[])/.test(selector) || /[+~]/.test(selector))) scoped = false;
      });
      root.walkDecls((declaration) => {
        if (declaration.parent.type !== 'rule') scoped = false;
      });
      return scoped && rules > 0;
    });
  } catch {
    return false;
  }
}

/** A missing range remains conservative; unchanged pipelines are not regenerated for core/UI code. */
export function planChanges(changes) {
  if (!Array.isArray(changes) || !changes.length) return fullPlan();
  const features = new Set(),
    extraUnit = new Set(),
    extraE2e = new Set();
  let full = false,
    data = false,
    policy = false;
  for (const change of changes) {
    if (!change || !validPath(change.path)) return fullPlan();
    const { path, before, after } = change;
    if (path === 'package.json' || path === 'package-lock.json') {
      if (!versionOnly(path, before, after)) full = data = true;
    } else if (path === '.npmrc' || path.startsWith('src/data/') || path.startsWith('public/img/') || path.startsWith('docs/PATCH-NOTES/')) {
      full = data = true;
    } else if (path.startsWith('.github/') || maintenanceFiles.has(path) || /^tests\/unit\/release[^/]*\.test\.ts$/.test(path)) {
      policy = true;
    } else if ((path.startsWith('docs/') && !path.startsWith('docs/PATCH-NOTES/')) || /^[^/]+\.md$/.test(path) || path === 'LICENSE') {
      // Ordinary documentation does not change product logic or generated data.
    } else if (sourcePresentationFiles.has(path)) {
      for (const feature of sourcePresentationFiles.get(path)) features.add(feature);
    } else if (rawSourceSchemas.has(path)) {
      if (sourceSchemaOnly(path, before, after)) features.add(rawSourceSchemas.get(path));
      else full = true;
    } else if (path === 'scripts/content-baseline.mjs') {
      if (removesSourceBaseline(before, after)) {
        features.add('builds');
        features.add('gameGuide');
      } else full = true;
    } else if (cssFiles.has(path)) {
      if (civCssOnly(before, after)) features.add('civs');
      else full = true;
    } else if (path === 'src/shared/styles/issue62-cards.css') {
      if (cardsCssOnly(before, after)) {
        features.add('civs');
        features.add('matchup');
      } else full = true;
    } else if (path === 'src/domain/civUnits.ts') {
      // Read-only civilization unit presentation; no simulation or generated data changes.
      features.add('civs');
    } else if (path === 'src/domain/patches.ts') {
      features.add('patches');
    } else if (path === 'src/domain/simRoute.ts') {
      for (const feature of ['matchup', 'units', 'simulator']) features.add(feature);
    } else if (path === 'src/shared/ui/PatchHistory.tsx') {
      // This history display is consumed by four entity details and patch pages.
      // Its loader, domain logic, styles and all other shared files remain conservative.
      for (const feature of ['patches', 'civs', 'units', 'techs', 'buildings']) features.add(feature);
      extraUnit.add('tests/unit/entityHistory435.test.ts');
      extraE2e.add('tests/e2e/entityHistory435.spec.ts');
      extraE2e.add('tests/e2e/buildingHistory.spec.ts');
    } else if (['src/shared/ui/sim/SimPanel.tsx', 'src/shared/ui/RealCost.tsx'].includes(path)) {
      // Audited presentation consumers only; state, calculations and other shared files stay full.
      for (const feature of ['duel', 'units', 'buildings']) features.add(feature);
      for (const name of ['matchupSim424', 'v070-88', 'garrison218', 'garrison224']) extraE2e.add(`tests/e2e/${name}.spec.ts`);
    } else if (path.startsWith('src/features/duel/') && /\.(?:css|pcss|postcss|less|sass|scss|styl|stylus|sss)$/i.test(path)) {
      // Vite also accepts pcss/postcss and preprocessor suffixes; unknown syntax stays full.
      if (path.endsWith('.css') && duelCssOnly(before, after)) features.add('duel');
      else full = true;
    } else if (path.startsWith('src/features/')) {
      const feature = path.split('/')[2];
      if (Object.hasOwn(PROFILES, feature)) features.add(feature);
      else full = true;
    } else if (/^tests\/unit\/[^/]+\.test\.ts$/.test(path) || /^tests\/e2e\/[^/]+\.spec\.ts$/.test(path)) {
      (path.startsWith('tests/unit/') ? extraUnit : extraE2e).add(path);
    } else {
      full = true;
      // Generation inputs/scripts and dependencies may change the exported game data.
      if (/^scripts\/(?:.*\.py|.*\.json|pinyin_build\.mjs|catalog_introductions\.mjs|effects_audit\.ts)$/.test(path)) data = true;
    }
  }
  if (full) return fullPlan(data, features);
  const selected = sorted(features);
  for (const feature of selected) {
    for (const path of PROFILES[feature].unit) extraUnit.add(path);
    for (const path of PROFILES[feature].e2e) extraE2e.add(path);
  }
  const scope = selected.length === 1 && selected[0] === 'civs' ? 'civ-ui' : selected.length || extraUnit.size || extraE2e.size ? 'targeted' : 'maintenance';
  if (policy || scope === 'maintenance') extraUnit.add('tests/unit/release*.test.ts');
  return { scope, features: selected, unit: sorted(extraUnit), e2e: sorted(extraE2e), data: false, full: false };
}

export function classifyChanges(changes) {
  return planChanges(changes).scope;
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function planRange(base, head) {
  try {
    if (!sha.test(base) || !sha.test(head)) return fullPlan();
    if (spawnSync('git', ['merge-base', '--is-ancestor', base, head]).status !== 0) return fullPlan();
    const paths = git('diff', '--name-only', '--no-renames', '-z', base, head).split('\0').filter(Boolean);
    if (!paths.length) return maintenancePlan();
    const content = (ref, path) => {
      try {
        return git('show', `${ref}:${path}`);
      } catch {
        return null;
      }
    };
    return planChanges(paths.map((path) => ({ path, before: content(base, path), after: content(head, path) })));
  } catch {
    return fullPlan();
  }
}

export function classifyRange(base, head) {
  return planRange(base, head).scope;
}

/** No implicit HEAD^ fallback: a multi-commit push must include every changed source. */
export function eventBase(eventName, event, ref, initialReleaseBase = null) {
  if (eventName === 'pull_request') return event.pull_request?.base?.sha ?? null;
  if (eventName !== 'push') return null;
  if (sha.test(event.before) && event.before !== '0'.repeat(40)) return event.before;
  if (event.before === '0'.repeat(40) && ref?.startsWith('refs/heads/release/')) return initialReleaseBase;
  return null;
}

/** Called only after prepare-release validates the successful main run that owns this artifact. */
export function releaseScope(manifest, expectedHead, classify = classifyRange) {
  if (!manifest || !sha.test(expectedHead) || manifest.head !== expectedHead || !sha.test(manifest.base)) return 'full';
  if (!['civ-ui', 'maintenance'].includes(manifest.scope)) return 'full';
  return classify(manifest.base, expectedHead) === manifest.scope ? manifest.scope : 'full';
}

function main() {
  let plan = fullPlan();
  if (process.argv[2] === '--release') {
    try {
      const scope = releaseScope(JSON.parse(readFileSync(process.argv[3], 'utf8')), process.env.EXPECTED_DEPLOYED_SHA);
      if (scope !== 'full') plan = { ...planChanges([{ path: 'docs/legacy-release.md' }]), scope };
    } catch {
      // Older deployments or missing/invalid artifacts retain the complete online verification.
    }
  } else {
    const head = git('rev-parse', 'HEAD');
    let base = null;
    try {
      const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
      let initialReleaseBase = null;
      if (process.env.GITHUB_EVENT_NAME === 'push' && event.before === '0'.repeat(40) && process.env.GITHUB_REF?.startsWith('refs/heads/release/'))
        initialReleaseBase = git('merge-base', 'origin/main', head);
      base = eventBase(process.env.GITHUB_EVENT_NAME, event, process.env.GITHUB_REF, initialReleaseBase);
      plan = planRange(base, head);
    } catch {
      // Missing history or an unsupported event cannot select a reduced test profile.
    }
    if (process.env.CI_FULL === 'true' || process.env.GITHUB_EVENT_NAME === 'schedule') plan = fullPlan();
    writeFileSync(join(process.env.RUNNER_TEMP || '.', 'ci-scope.json'), JSON.stringify({ base, head, scope: plan.scope }) + '\n');
    writeFileSync(join(process.env.RUNNER_TEMP || '.', 'ci-plan.json'), JSON.stringify(plan) + '\n');
  }
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `scope=${plan.scope}\ndata=${plan.data}\nfull=${plan.full}\nbrowser=${plan.full || !!plan.e2e.length}\n`);
  console.log(`Validation plan: ${JSON.stringify(plan)}`);
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) main();
