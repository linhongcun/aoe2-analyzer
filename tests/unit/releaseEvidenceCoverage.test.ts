import { expect, it } from 'vitest';
// @ts-expect-error scripts have no declarations
import { planCovers } from '../../scripts/ci-evidence.mjs';
const targeted = {
  scope: 'targeted',
  full: false,
  data: false,
  features: ['matchup'],
  unit: ['tests/unit/simulator.test.ts'],
  e2e: ['tests/e2e/matchupSim424.spec.ts'],
};
const full = { scope: 'full', full: true, data: true, features: ['all'], unit: [], e2e: [] };

it('full tests cover targeted tests, but unchanged data must not be claimed as regenerated', () => {
  expect(planCovers(full, targeted)).toBe(true);
  const capped = {
    scope: 'full',
    full: true,
    data: false,
    browser: 'capped',
    features: ['all'],
    unit: [],
    e2e: ['tests/e2e/smoke.spec.ts'],
  };
  const fullBrowser = { ...full, data: false, browser: 'full' };
  expect(planCovers(capped, fullBrowser)).toBe(false);
  expect(planCovers(fullBrowser, capped)).toBe(true);
  expect(planCovers(full, capped)).toBe(true);
  expect(planCovers({ ...full, data: false }, { ...targeted, data: true })).toBe(false);
  expect(planCovers({ ...full, data: false }, targeted)).toBe(true);
  expect(planCovers(targeted, full)).toBe(false);
  expect(planCovers({ ...targeted, unit: [] }, targeted)).toBe(false);
  expect(planCovers({ ...targeted, e2e: [] }, targeted)).toBe(false);
  expect(planCovers({ ...targeted, features: [] }, targeted)).toBe(false);
  expect(planCovers({ ...targeted, data: true }, targeted)).toBe(false);
});

it('supports explicit files covered by an already run release test glob without assuming arbitrary glob inclusion', () => {
  const available = { ...targeted, unit: ['tests/unit/release*.test.ts'] };
  expect(planCovers(available, { ...targeted, unit: ['tests/unit/releaseAuto.test.ts'] })).toBe(true);
  expect(planCovers(available, { ...targeted, unit: ['tests/unit/release*/other.test.ts'] })).toBe(false);
  expect(planCovers(available, { ...targeted, unit: ['tests/unit/*.test.ts'] })).toBe(false);
});

it('reuses same-level full-unit capped-browser evidence without promoting its browser coverage', () => {
  const capped = { ...full, data: false, browser: 'capped', features: ['all', 'home'], e2e: ['tests/e2e/smoke.spec.ts', 'tests/e2e/mechanism652.spec.ts'] };
  expect(planCovers(capped, capped)).toBe(true);
  expect(planCovers(capped, { ...capped, e2e: ['tests/e2e/smoke.spec.ts'] })).toBe(true);
  expect(planCovers(capped, { ...capped, e2e: ['tests/e2e/new.spec.ts'] })).toBe(false);
  expect(planCovers(capped, { ...capped, data: true })).toBe(false);
  expect(planCovers(capped, { ...full, browser: 'full', data: false })).toBe(false);
  expect(planCovers({ ...targeted, browser: 'capped' }, capped)).toBe(false);
});

it('full unit evidence covers targeted unit only when the browser and feature sets also cover it', () => {
  const available = { ...full, browser: 'capped', features: ['all', ...targeted.features], e2e: targeted.e2e };
  expect(planCovers(available, targeted)).toBe(true);
  expect(planCovers(available, { ...targeted, e2e: ['tests/e2e/other.spec.ts'] })).toBe(false);
});
