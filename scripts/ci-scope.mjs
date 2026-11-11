import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import postcss from 'postcss';

const sha = /^[0-9a-f]{40}$/;
const version = /^\d+\.\d+\.\d+$/;
const cssFiles = new Set(['src/shared/styles/base.css', 'src/shared/styles/editorial.css']);
// Shell files have consumers throughout the application; a partial profile is not a proven closure.
const shellFiles = new Set(['src/app/Layout.tsx', 'src/shared/ui/Icon.tsx', 'src/shared/styles/editorial-shell.css', 'src/features/share/PageMeta.tsx']);
// Audited display files only. Calculation, tokens, routing and unaudited shared UI stay full.
const displayFiles = new Map([
  // Short insight content is read only by the unit/civilization detail pages; no simulation consumers.
  ['src/domain/insights.ts', ['units', 'civs']],
  // Homepage choice flow only; no combat, economic simulation or generated data.
  ['src/domain/startGame.ts', ['home']],
  // Ladder-only URL/selection/source labels; snapshot values and statistical calculations are unchanged.
  ['src/domain/ladderQuery.ts', ['ladder']],
  ['src/shared/ui/ShareImage.tsx', ['share']],
  ['src/shared/ui/FeedbackLink.tsx', ['shell']],
  ['src/shared/utils/feedback.ts', ['shell']],
]);
const feedbackPaths = new Set(['src/shared/ui/FeedbackLink.tsx', 'src/shared/utils/feedback.ts']);
const maintenanceFiles = new Set([
  'scripts/release.mjs',
  'scripts/prepare-release.mjs',
  'scripts/check-pr-title.mjs',
  'scripts/ci-scope.mjs',
  'scripts/ci-run.mjs',
  'scripts/ci-evidence.mjs',
  'scripts/ci-api.mjs',
  'scripts/ci-browser-reporter.mjs',
  'scripts/ci-browser-weights.json',
  'scripts/ci-budget.mjs',
  'scripts/ci-commands.mjs',
  'scripts/ci-deploy.mjs',
  'scripts/ci-plan.mjs',
  'scripts/ci-release.mjs',
  'scripts/ci-report.mjs',
  'scripts/ci-shards.mjs',
  'scripts/ci-stage-evidence.mjs',
  'scripts/ci-stage.mjs',
  'scripts/ci-timing.mjs',
  'scripts/ci-worker.mjs',
  'scripts/deployment-smoke.mjs',
  'scripts/smoke-diagnostics.mjs',
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
  // Page-local hotkeys presentation only. The action catalog, storage logic and other domain files stay full.
  hotkeys: profile(['hotkeys236'], ['smoke', 'hotkeys236', 'hotkeys626']),
  home: profile(
    ['startGame592', 'startGame632', 'mechanism652', 'ageRoutes652'],
    ['smoke', 'editorial6', 'startGame592', 'startGame632', 'mechanism652', 'routes652'],
  ),
  ladder: profile(
    ['ladder33', 'ladder569', 'ladder571', 'ladder577-query', 'ladder577-snapshot', 'ladder580', 'ladder633', 'ladder635', 'ladder625'],
    [
      'smoke',
      'ladder33',
      'ladder545',
      'ladder546',
      'ladder547',
      'ladder569',
      'ladder571',
      'ladder572',
      'ladder577',
      'ladder580',
      'ladder633',
      'ladder634',
      'ladder635',
      'ladder625',
    ],
  ),
  shell: profile(['nav', 'theme6', 'pageRegistry283'], ['smoke', 'navigation272', 'editorial6', 'skipLink294', 'searchLoading395', 'feedbackTap295']),
  builds: profile(
    [...sourceChecks, 'sources', 'boSources', 'buildOrders', 'buildOrders.content', 'buildPractice216', 'buildSim', 'build41', 'v0300-335'],
    ['sourcePresentation442', 'practice216', 'build41', 'v0290-322-golden'],
  ),
  gameGuide: profile(
    [...sourceChecks, 'gameGuide256', 'v0300-335', 'elevation734', 'housing743', 'standardVictory747'],
    ['sourcePresentation442', 'gameGuide256', 'elevation734', 'housing743', 'standardVictory747'],
  ),
  patches: profile(['patches16', 'patchTree417', 'patchSearch16'], ['patches16', 'patchTree417']),
  matchup: profile(['matchup194', 'p0Batch', 'simRoute424', 'simulator'], ['matchup194', 'matchupSim424', 'rush35']),
  civs: profile(
    [
      'civRequirements206',
      'civText402',
      'civOpening77',
      'civBonus',
      'dlc-linker',
      'civRegionalUnits450',
      'civRegionalBuildings456',
      'civUniqueBuildings463',
      'insights584',
      'civHistory',
      'civBackgrounds',
      'repairCost744',
    ],
    [
      'civDlcFilters',
      'civRequirements206',
      'civText402',
      'civ77',
      'v0290-326',
      'layout62',
      'catalogLayout187',
      'civRegionalUnits450',
      'civRegionalBuildings456',
      'civUniqueBuildings463',
      'civEmptyModules465',
      // #602：文明详情页内 Tab 与「相关工具」分层。
      'civNav602',
      // #584：文明页「鲜为人知」失败验收。实现折入后应收绿，不要放宽断言。
      'insights584',
      // #603：概览主栏编辑式分区。Kent 的失败验收折进来之后应收绿。
      'civ603',
      'civHistory',
      'civBackgrounds',
      'repairCost744',
    ],
  ),
  units: profile(
    [
      'unitFilters192',
      'unitFilters196',
      'unitCount14',
      'unitNames271',
      'unitAge11',
      'upgradeLine10',
      'relatedTechs193',
      'family',
      'simRoute424',
      'simulator',
      'insights584',
      'automaticAge705',
      'armorValues706',
      'negativeBonus707',
      'thumbRing709',
      'trebuchet711',
      'ageCounter708',
      'splash712',
      'villagerGather730',
      'fishingGather735',
      'accuracy746',
      'repairCost744',
    ],
    [
      'unitCards6',
      'unitFilters196',
      'units192',
      'units879',
      'unitCount14',
      'dupNames44',
      'upgradeLine10',
      'relatedTechs193',
      'sidebar44',
      'catalogLayout187',
      // #584：单位页「鲜为人知」失败验收。与文明页同一份 spec。
      'insights584',
      'automaticAge705',
      'armorValues706',
      'negativeBonus707',
      'thumbRing709',
      'trebuchet711',
      'ageCounter708',
      'splash712',
      'villagerGather730',
      'fishingGather735',
      'accuracy746',
      'repairCost744',
    ],
  ),
  simulator: profile(['simulator', 'simRoute424', 'prereq'], ['layout62', 'matchupSim424', 'upgradeLine10']),
  techs: profile(
    [
      'affects',
      'techUnits13',
      'techBuilding12',
      'techCost355',
      'relatedTechs193',
      'thumbRing709',
      'romanCharge710',
      'ageBuildings704',
      'accuracy746',
      'marketFees745',
      'techCatalog883',
    ],
    [
      'techCards6',
      'techUnits13',
      'relatedTechs193',
      'catalogLayout187',
      'thumbRing709',
      'romanCharge710',
      'ageBuildings704',
      'accuracy746',
      'marketFees745',
      'techs883',
    ],
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
      'armorValues706',
      'negativeBonus707',
      'thumbRing709',
      'accuracy746',
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
      'armorValues706',
      'negativeBonus707',
      'thumbRing709',
      'accuracy746',
    ],
  ),
  buildings: profile(
    [
      'buildings',
      'buildingSim',
      'buildingAge357',
      'garrison218',
      'garrisonGeneral224',
      'ageBuildings704',
      'automaticAge705',
      'foodAmount736',
      'marketFees745',
      'housing743',
      'repairCost744',
      'buildingQuery881',
    ],
    [
      'garrison218',
      'garrison224',
      'sidebar44',
      'catalogLayout187',
      'ageBuildings704',
      'automaticAge705',
      'foodAmount736',
      'marketFees745',
      'housing743',
      'repairCost744',
      'buildings881',
    ],
  ),
  // #533：攻城页改动跑金标准与失败验收。不把 /siege 放进全站宽度/截图矩阵。
  // #581：页内单位上下文跟攻城反馈走，后续攻城改动也要跑到 siege581。
  siege: profile(['siege308', 'trebuchet711'], ['siege308', 'siege533', 'siege554-555', 'siege581', 'trebuchet711']),
  teamFit: profile(['teamFit558', 'teamBonuses228', 'teamChainNote273'], ['teamFit558', 'teamBonuses228', 'v0300-273']),
  maps: profile(['sd3Watch702', 'sd3Mechanics752'], ['maps34', 'mapPreviews', 'mapCatalog422', 'maps559', 'sd3Watch702', 'sd3Mechanics752']),
  compare: profile(['compare403', 'compareLocation558', 'teamBonuses228'], ['compare403', 'compareNavigation558', 'civText402', 'teamBonuses228']),
  // Display-only helpers. Combat, eco and cost math stay on the full plan.
  clock: profile(
    ['formatTime', 'formatTime.consistency-1', 'formatTime.consistency-2', 'formatTime.consistency-3', 'formatTime.consistency-4'],
    ['timeFormat'],
  ),
  names: profile(['aliases44'], ['dupNames44']),
  links: profile(['dlc-linker'], ['civText402']),
  share: profile(['share78', 'shareCard'], ['share78', 'shareCard', 'shareLink286']),
  glossary: profile(['glossary217', 'glossary276'], ['glossary217', 'glossary276']),
};
/** Every ordinary gate includes the cold-built site smoke, including documentation/version-only changes. */
export const GATE_CORE_SMOKE_E2E = ['tests/e2e/smoke.spec.ts'];
/**
 * Default CI smoke (#749). One Chromium shard, not the 24-route / four-width / axe matrix.
 * Route cases must stay loadable with an empty console; query and calculation are existing
 * assertions in the same file so a broken search or the Franks Paladin total fails the shard.
 */
export const GATE_NARROW_SMOKE = [
  { file: 'tests/e2e/smoke.spec.ts', title: 'route (home) renders without console errors', kind: 'route' },
  { file: 'tests/e2e/smoke.spec.ts', title: 'route #civs renders without console errors', kind: 'route' },
  { file: 'tests/e2e/smoke.spec.ts', title: 'route #/civ/Franks renders without console errors', kind: 'route' },
  { file: 'tests/e2e/smoke.spec.ts', title: 'route #unit/569 renders without console errors', kind: 'route' },
  { file: 'tests/e2e/smoke.spec.ts', title: 'Ctrl+K command palette searches across civs/units/techs', kind: 'query' },
  { file: 'tests/e2e/smoke.spec.ts', title: 'Franks Paladin full tech = 192 HP', kind: 'calculation' },
];
export const BUILD_IDENTITY_TITLE = 'fresh build identity matches the actual checked-out commit and package version';
export function narrowSmokeTitles() {
  return GATE_NARROW_SMOKE.map((entry) => entry.title);
}
/** Keep exactly the default smoke. A missing title fails planning; extra matrix cases are dropped. */
export function selectNarrowSmokeCases(cases) {
  assert.ok(Array.isArray(cases), 'Missing browser collection');
  const selected = [];
  for (const spec of GATE_NARROW_SMOKE) {
    const matches = cases.filter((entry) => entry?.file === spec.file && entry.titlePath?.at(-1) === spec.title);
    assert.equal(matches.length, 1, `Narrow smoke missing or duplicated: ${spec.title}`);
    selected.push(matches[0]);
  }
  return selected;
}
/** Gate builds prove footer identity only. The 24-route matrix stays on the manual full plan. */
export function selectBuildSmokeCases(cases, mode) {
  assert.ok(Array.isArray(cases), 'Missing build smoke collection');
  const identity = cases.filter((entry) => entry?.file === 'tests/e2e/ciBuild659.spec.ts' && entry.titlePath?.at(-1) === BUILD_IDENTITY_TITLE);
  assert.equal(identity.length, 1, 'Mandatory build identity smoke missing');
  if (mode === 'gate') return identity;
  const routes = cases.filter((entry) => entry?.file === 'tests/e2e/smoke.spec.ts' && String(entry.titlePath?.at(-1) ?? '').startsWith('route '));
  assert.equal(routes.length, 24, 'Mandatory build smoke must retain 24 cold routes and exact build identity');
  return [...routes, ...identity];
}
/** Full keeps four runners. The default gate never grows a matrix, even when many atomic units exist. */
export function browserShardCount(plan, atomicCount) {
  assert.ok(Number.isSafeInteger(atomicCount) && atomicCount > 0, 'Invalid browser atomic count');
  if (plan?.browser === 'full') return 4;
  if (plan?.browser === 'gate') return 1;
  const count = Math.min(4, atomicCount);
  assert.ok(count >= 1 && count <= 4, 'Invalid browser shard count');
  return count;
}
export function minimalGatePlan() {
  return { scope: 'gate', features: [], unit: [], e2e: [...GATE_CORE_SMOKE_E2E], data: false, full: false, browser: 'gate' };
}
/**
 * Bind the issued gate to the one shard that actually ran the narrow smoke.
 * Returns null for a full plan, which is not a deployment source.
 */
export function narrowSmokeGate(plan, browserCases, requirements) {
  if (!plan || plan.browser !== 'gate') return null;
  const selected = selectNarrowSmokeCases(browserCases);
  assert.equal(selected.length, browserCases.length, 'Default browser shard contains cases outside the narrow smoke');
  const browsers = requirements.filter((entry) => entry.stage_id.startsWith('browser-'));
  assert.deepEqual(
    browsers.map((entry) => entry.stage_id),
    ['browser-1'],
    'Default gate must be exactly one browser shard',
  );
  assert.equal(browsers[0].reusable, false, 'Narrow smoke must execute against the current build');
  const ids = selected.map((entry) => entry.id).sort();
  assert.deepEqual(browsers[0].selection.cases.map((entry) => entry.id).sort(), ids, 'Browser requirement does not match the narrow smoke');
  for (const stage of ['unit', 'data', 'static-main'])
    assert.ok(!requirements.some((entry) => entry.stage_id === stage), 'Default gate must not require ' + stage);
  return { titles: narrowSmokeTitles(), case_ids: ids };
}
// Legacy public name retained for release tooling importing the old scope module.
export const PR_CORE_SMOKE_E2E = GATE_CORE_SMOKE_E2E;
/**
 * Global tours reserved for the nightly/high-risk full plan (#659 supersedes #514's PR cap).
 * A narrow feature keeps its own width/theme/negative paths, including civDlcFilters.
 * Editing one of these guard files itself is high risk and therefore selects the full plan.
 */
export const PR_CAPPED_BLACKLIST_EXACT = ['v0300-338', 'screenshots', 'stepContrast', 'overflow64', 'mobile361-359-366', 'touchTargets481', 'finalCivs197'];
const BUILD41_OWNERS = [
  /(?:^|\/)build41\./,
  /^src\/features\/builds\//,
  /^src\/data\/build-orders\//,
  /^src\/domain\/buildSim\.ts$/,
  /^src\/domain\/buildOrders/,
  /^tests\/unit\/build(?:41|Orders|Sim)\./,
];
const RUSH35_OWNERS = [
  /(?:^|\/)rush35\./,
  /^src\/features\/matchup\/components\/RushDefense\./,
  /^src\/features\/matchup\/components\/rushDefense\.css$/,
  /^src\/features\/matchup\/rushGuides\.ts$/,
  /^tests\/unit\/rush35\./,
];
const RUSH_GENERIC_OWNERS = [/rushGeneric/, /^src\/features\/matchup\/rushGuides\.ts$/, /^src\/features\/matchup\/components\/RushDefense\./];
const TIMELINE_OWNERS = [
  /^tests\/(?:e2e|unit)\/timeline/i,
  /^src\/features\/builds\/.*[Tt]imeline/,
  /^src\/domain\/buildTimeline/,
  /timelineModel/,
  /timelineFollowups/,
  /timeline-labels/,
  /Timeline(?:Chart|Segment|Settings|Loader)/,
  /BuildTimelineView/,
];
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

function rememberPaths(plan, changes) {
  const paths = sorted((Array.isArray(changes) ? changes : []).filter((change) => change && validPath(change.path)).map((change) => change.path));
  return paths.length ? { ...plan, paths } : plan;
}

export function specBasename(path) {
  const name =
    String(path ?? '')
      .split('/')
      .pop() ?? '';
  return name.endsWith('.spec.ts') ? name.slice(0, -'.spec.ts'.length) : name;
}

function pathsMatch(paths, patterns) {
  return paths.some((path) => patterns.some((pattern) => pattern.test(path)));
}

/** One civilization token, including wei197 / shuDisplayNames, not a longer word such as weight. */
function pathsMentionCiv(paths, civ) {
  const lower = String(civ).toLowerCase();
  const exact = new RegExp(`(?:^|[^a-z0-9])${lower}(?:[^a-z0-9]|$)`);
  const camel = lower
    .split('')
    .map((character) => `[${character}${character.toUpperCase()}]`)
    .join('');
  const prefix = new RegExp(`(?:^|[^A-Za-z0-9])${camel}(?=[A-Z0-9])`);
  return paths.some((path) => exact.test(String(path).toLowerCase()) || prefix.test(String(path)));
}

/** Legacy name: omit unrelated global tours from a proven narrow gate on either PR or main. */
export function prCappedExcludes(specPath, paths = []) {
  const base = specBasename(specPath);
  const changed = Array.isArray(paths) ? paths.filter((path) => typeof path === 'string') : [];
  if (PR_CAPPED_BLACKLIST_EXACT.includes(base) || base.startsWith('cardWrap')) return true;
  const civ = /^([a-z]+)197$/.exec(base);
  if (civ) return !pathsMentionCiv(changed, civ[1]);
  if (base === 'build41') return !pathsMatch(changed, BUILD41_OWNERS);
  if (base === 'rush35') return !pathsMatch(changed, RUSH35_OWNERS);
  if (base === 'rushGeneric507') return !pathsMatch(changed, RUSH_GENERIC_OWNERS);
  if (base === 'timeline' || base.startsWith('timeline')) return !pathsMatch(changed, TIMELINE_OWNERS);
  return false;
}

export function fullPlan(data = true, features = [], extraE2e = []) {
  return { scope: 'full', features: sorted(['all', ...features]), unit: [], e2e: sorted(extraE2e), data, full: true };
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

// Each filename and selector root was checked against its actual TSX importer and other consumers.
// New files, namespaces and global selectors do not inherit ownership from a feature directory.
const ownedFeatureCss = new Map([
  ['src/features/home/home.css', /^(?:#home|\.home-group(?:-desc)?)(?=$|\s|[.:#>\[])/],
  ['src/features/home/start-game.css', /^(?:\.|button\.)start-[a-z-]+(?=$|\s|[.:#>\[])/],
  ['src/features/ladder/ladder.css', /^\.ladder-[a-z-]+(?=$|\s|[.:#>\[])/],
  ['src/features/ladder/ladderMeta.css', /^\.ladder-[a-z-]+(?=$|\s|[.:#>\[])/],
  ['src/features/ladder/stat-methods.css', /^\.ladder-stat-methods(?=$|\s|[.:#>\[])/],
  ['src/features/civs/components/civ-list-links.css', /^#list #grid > \.card(?=$|\s|[.:#>\[])/],
  ['src/features/civs/components/civ-browse.css', /^#list(?=$|\s|[.:#>\[])/],
  ['src/features/civs/components/civ-background.css', /^\.civ-(?:detail-background|background-credit)(?=$|\s|[.:#>\[])/],
  ['src/features/civs/components/civ-professional-view.css', /^\.civ-pro(?:-author)?(?=$|\s|[.:#>\[])/],
  ['src/features/civs/components/civRelatedTools.css', /^\.civ-related-tools(?=$|\s|[.:#>\[])/],
  ['src/features/civs/components/civ-not-found.css', /^\.civ-not-found[a-z-]*(?=$|\s|[.:#>\[])/],
  ['src/features/civs/components/civ-regional-units.css', /^\.civ-regional-[a-z-]+(?=$|\s|[.:#>\[])/],
  ['src/features/civs/components/civ-regional-buildings.css', /^\.civ-regional-buildings(?=$|\s|[.:#>\[])/],
  ['src/features/civs/components/civOverview.css', /^(?:\.detail\s+)?\.civ-[a-z-]+(?=$|\s|[.:#>\[])/],
  ['src/features/civs/components/civ-unique-buildings.css', /^\.civ-unique-buildings(?=$|\s|[.:#>\[])/],
  ['src/features/civs/components/civ-history.css', /^\.civ-history[a-z-]*(?=$|\s|[.:#>\[])/],
  ['src/features/civs/openingBuildChoices.css', /^\.civ-opening-[a-z-]+(?=$|\s|[.:#>\[])/],
]);
const ownedCssExactSelectors = new Map([
  ['src/features/civs/components/civRelatedTools.css', ['#detail .dtabs:has(+ .civ-related-tools)']],
  ['src/features/civs/components/civOverview.css', ['#detail .dmain > .insight-slot']],
  ['src/features/ladder/stat-methods.css', ['.ladder-stat-methods p + p']],
]);

export function featureCssOnly(path, before, after) {
  const rootSelector = ownedFeatureCss.get(path);
  const sources = [before, after].filter((source) => source !== null);
  if (!rootSelector || !sources.length) return false;
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
        for (const raw of rule.selectors) {
          const selector = raw.trim();
          if (ownedCssExactSelectors.get(path)?.includes(selector)) continue;
          if (!rootSelector.test(selector) || /[+~\\]/.test(selector)) scoped = false;
        }
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
    data = false;
  for (const change of changes) {
    if (!change || !validPath(change.path)) return fullPlan();
    const { path, before, after } = change;
    if (path === 'package.json' || path === 'package-lock.json') {
      if (!versionOnly(path, before, after)) full = data = true;
    } else if (path === 'src/data/index.ts') {
      // Audited runtime loader, not a generation input. Keep full consumer validation.
      // Never clear data=true from another changed input. Unknown data files stay conservative.
      full = true;
    } else if (path === 'src/data/page-metadata.json') {
      // Exact generated route/share metadata only; game data paths and mixed changes remain full + data.
      full = true;
    } else if (path === '.npmrc' || path.startsWith('src/data/') || path.startsWith('public/img/') || path.startsWith('docs/PATCH-NOTES/')) {
      full = data = true;
    } else if (path.startsWith('.github/') || maintenanceFiles.has(path) || /^tests\/unit\/(?:release[^/]*|ci[A-Z0-9][^/]*)\.test\.ts$/.test(path)) {
      // The policy deciding validation cannot certify itself with its former reduced profile.
      full = true;
    } else if ((path.startsWith('docs/') && !path.startsWith('docs/PATCH-NOTES/')) || /^[^/]+\.md$/.test(path) || path === 'LICENSE') {
      // Ordinary documentation does not change product logic or generated data.
    } else if (shellFiles.has(path)) {
      full = true;
    } else if (displayFiles.has(path)) {
      for (const feature of displayFiles.get(path)) features.add(feature);
      if (feedbackPaths.has(path)) extraUnit.add('tests/unit/feedback.test.ts');
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
    } else if (path === 'src/domain/chargeAttack.ts') {
      // 蓄力攻击模型已下沉 domain；仍由 techs profile 的 romanCharge710 覆盖。
      features.add('techs');
    } else if (path === 'src/domain/elevation.ts' || path === 'src/domain/standardVictory.ts') {
      // 高地/Standard 模型已下沉 domain；仍由 gameGuide profile 覆盖。
      features.add('gameGuide');
    } else if (path === 'src/domain/villagerGatherFacts.ts' || path === 'src/domain/fishingGatherFacts.ts') {
      // 村民/渔船数值事实已下沉 domain；仍由 units profile 覆盖。
      features.add('units');
    } else if (path === 'src/domain/foodAmountFacts.ts') {
      // 农田/养鱼场食物事实已下沉 domain；仍由 buildings profile 覆盖。
      features.add('buildings');
    } else if (path === 'src/domain/housingFacts.ts') {
      // 住房事实已下沉 domain；仍由 gameGuide profile 覆盖。
      features.add('gameGuide');
    } else if (path === 'src/domain/conversion.ts') {
      // 招降模型已下沉 domain；units profile 不自动包含 conversion731，显式补定向用例。
      features.add('units');
      extraUnit.add('tests/unit/conversion731.test.ts');
      extraE2e.add('tests/e2e/conversion731.spec.ts');
    } else if (path === 'src/domain/civUnits.ts' || path === 'src/domain/civBuildings.ts') {
      // Read-only civilization presentation; no simulation or generated data changes.
      features.add('civs');
    } else if (path === 'src/domain/patches.ts') {
      features.add('patches');
    } else if (
      path === 'src/features/civs/backgrounds.source.json' ||
      path === 'src/features/civs/backgrounds.json' ||
      path === 'src/features/civs/import_backgrounds.py' ||
      path.startsWith('src/features/civs/assets/backgrounds/')
    ) {
      full = data = true;
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
    } else if (/^src\/features\/.*\.(?:css|pcss|postcss|less|sass|scss|styl|stylus|sss)$/i.test(path)) {
      // Vite also accepts pcss/postcss and preprocessor suffixes; unknown syntax stays full.
      if (path.startsWith('src/features/duel/') && path.endsWith('.css') && duelCssOnly(before, after)) features.add('duel');
      else if (featureCssOnly(path, before, after)) features.add(path.split('/')[2]);
      else full = true;
    } else if (path.startsWith('src/features/')) {
      const feature = path.split('/')[2];
      if (Object.hasOwn(PROFILES, feature)) features.add(feature);
      else full = true;
      // 单位详情的「算拆建筑」入口。其它单位列表改动不因此跑攻城验收，也不扩大全站矩阵。
      if (path === 'src/features/units/components/UnitDetail.tsx') extraE2e.add('tests/e2e/siege533.spec.ts');
    } else if (path === 'src/domain/search.ts') {
      // #554 only rewrites the siege page href for「冲车」. Keep the full unit plan; PR browser still runs siege acceptance.
      features.add('siege');
      full = true;
    } else if (path.startsWith('tests/e2e/') && (PR_CAPPED_BLACKLIST_EXACT.includes(specBasename(path)) || specBasename(path).startsWith('cardWrap'))) {
      // Nightly-only means an unrelated global tour is omitted from narrow work, never its own edit.
      full = true;
    } else if (/^tests\/unit\/[^/]+\.test\.ts$/.test(path) || /^tests\/e2e\/[^/]+\.spec\.ts$/.test(path)) {
      if (after !== null) (path.startsWith('tests/unit/') ? extraUnit : extraE2e).add(path);
    } else {
      full = true;
      // Generation inputs/scripts and dependencies may change the exported game data.
      if (/^scripts\/(?:.*\.py|.*\.json|pinyin_build\.mjs|catalog_introductions\.mjs|effects_audit\.ts)$/.test(path)) data = true;
    }
  }
  if (full) return rememberPaths(fullPlan(data, features, extraE2e), changes);
  const selected = sorted(features);
  for (const feature of selected) {
    for (const path of PROFILES[feature].unit) extraUnit.add(path);
    for (const path of PROFILES[feature].e2e) extraE2e.add(path);
  }
  const scope = selected.length === 1 && selected[0] === 'civs' ? 'civ-ui' : selected.length || extraUnit.size || extraE2e.size ? 'targeted' : 'maintenance';
  if (scope === 'maintenance') extraUnit.add('tests/unit/release*.test.ts');
  return rememberPaths({ scope, features: selected, unit: sorted(extraUnit), e2e: sorted(extraE2e), data: false, full: false }, changes);
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

/** Unit files whose Affected unit run calls chromium.launch() (Playwright 1.64 headless shell). */
const CHROMIUM_UNIT_BASENAMES = ['release108.test.ts', 'releaseSmoke.test.ts', 'releaseDiagnostics641.test.ts'];

function unitPatternMatches(pattern, basename) {
  if (typeof pattern !== 'string') return false;
  const prefix = 'tests/unit/';
  if (!pattern.startsWith(prefix) || pattern.slice(prefix.length).includes('/')) return false;
  const name = pattern.slice(prefix.length);
  const regex = new RegExp(
    `^${name
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
  );
  return regex.test(basename);
}

/**
 * True when `ci-run --unit` will execute a test that launches Playwright chromium.
 * A full unit run includes release108 and releaseSmoke even though `unit` is empty.
 */
export function unitLaunchesChromium(plan) {
  if (!plan || typeof plan !== 'object') return false;
  if (plan.full) return true;
  if (!Array.isArray(plan.unit)) return false;
  return CHROMIUM_UNIT_BASENAMES.some((basename) => plan.unit.some((pattern) => unitPatternMatches(pattern, basename)));
}

/** Legacy API retained: environment variables cannot downgrade a required high-risk browser plan. */
export function allowFullBrowser(_env = process.env) {
  return true;
}

/**
 * Direct callers still see the #659 risk browser plan. CI itself uses selectCiPlan, which
 * does not let a risky diff expand the default PR/main gate (#749).
 */
export function applyBrowserPolicy(plan, env = process.env) {
  if (!plan || typeof plan !== 'object') return plan;
  if (env.CI_FULL === 'true' || env.GITHUB_EVENT_NAME === 'schedule')
    return {
      ...fullPlan(true, Array.isArray(plan.features) ? plan.features : [], Array.isArray(plan.e2e) ? plan.e2e : []),
      paths: plan.paths,
      browser: 'full',
    };
  if (plan.browser === 'gate' || plan.scope === 'gate') return { ...minimalGatePlan(), paths: plan.paths };
  if (plan.full) return { ...plan, browser: 'full' };
  const paths = Array.isArray(plan.paths) ? plan.paths : [];
  const candidates = new Set([...GATE_CORE_SMOKE_E2E, ...(plan.e2e ?? [])]);
  const e2e = sorted([...candidates].filter((path) => !prCappedExcludes(path, paths)));
  return { ...plan, browser: 'capped', e2e };
}

/**
 * CI entry (#749). Ordinary PR and main push stay on the narrow gate even when planChanges
 * would have chosen full. workflow_dispatch with CI_FULL, or a schedule event, keeps the
 * complete plan. The workflow no longer has a schedule trigger.
 */
export function selectCiPlan(classified, env = process.env) {
  if (env.CI_FULL === 'true' || env.GITHUB_EVENT_NAME === 'schedule') {
    const features = Array.isArray(classified?.features) ? classified.features : [];
    const extra = Array.isArray(classified?.e2e) ? classified.e2e : [];
    return applyBrowserPolicy(fullPlan(true, features, extra), env);
  }
  return applyBrowserPolicy(minimalGatePlan(), env);
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
    // #749: classification is recorded only as input. The default event cannot expand it.
    plan = selectCiPlan(plan);
    writeFileSync(join(process.env.RUNNER_TEMP || '.', 'ci-scope.json'), JSON.stringify({ base, head, scope: plan.scope }) + '\n');
    writeFileSync(join(process.env.RUNNER_TEMP || '.', 'ci-plan.json'), JSON.stringify(plan) + '\n');
  }
  if (process.env.GITHUB_OUTPUT) {
    const runBrowser =
      plan.browser === 'full' || plan.browser === 'capped' || plan.browser === 'gate' || (plan.browser == null && (plan.full || !!plan.e2e.length));
    const e2eFull = plan.browser === 'full' || (plan.browser == null && !!plan.full);
    const unitChromium = unitLaunchesChromium(plan);
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `scope=${plan.scope}\ndata=${plan.data}\nfull=${plan.full}\nbrowser=${runBrowser}\ne2e_full=${e2eFull}\nunit_chromium=${unitChromium}\n`,
    );
  }
  console.log(`Validation plan: ${JSON.stringify(plan)}`);
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) main();
