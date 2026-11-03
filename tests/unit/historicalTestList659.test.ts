import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
// @ts-expect-error Browser infrastructure scripts are plain Node modules
import { needsHistoricalServer } from '../../scripts/historical-ui.mjs';

const directories: string[] = [];
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'historical-test-list-659-'));
  directories.push(directory);
  mkdirSync(join(directory, 'tests/e2e'), { recursive: true });
  for (const file of ['smoke.spec.ts', 'timeline.spec.ts', 'duelPreset372.spec.ts', 'mountedCrossbowPresets441.spec.ts'])
    writeFileSync(join(directory, 'tests/e2e', file), '// test-list fixture');
  const list = (content: string, name = 'selected.txt') => {
    const file = join(directory, name);
    writeFileSync(file, content);
    return file;
  };
  return { directory, list };
}
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })));

it.each([
  '[] › smoke.spec.ts › route (home) renders without console errors',
  '[chromium] > smoke.spec.ts:12:3 > route (home) renders without console errors',
  'smoke.spec.ts',
  '# Playwright --list output\n\n[chromium] › smoke.spec.ts:12 › describe › case\n',
  '[] › smoke.spec.ts › case one\n[] › smoke.spec.ts › case two\n[] › timeline.spec.ts › case three',
])('#659 current-only public test-list format avoids fixture startup: %s', content => {
  const { directory, list } = fixture();
  const file = list(content);
  expect(needsHistoricalServer(['test', '--test-list', file, '--list', '--reporter=json'], directory)).toBe(false);
  expect(needsHistoricalServer(['test', `--test-list=${file}`], directory)).toBe(false);
});

it.each([
  '[] › duelPreset372.spec.ts › historical case',
  '[] › mountedCrossbowPresets441.spec.ts › historical case',
  '[] › smoke.spec.ts › current case\n[] › duelPreset372.spec.ts › historical case',
])('#659 selected historical cases retain the immutable fixture: %s', content => {
  const { directory, list } = fixture();
  expect(needsHistoricalServer(['test', '--test-list', list(content)], directory)).toBe(true);
});

it.each([
  '',
  '# comments only\n',
  '[chromium › smoke.spec.ts › case',
  '[]',
  '[] › smoke.spec.ts › ',
  '[] › not-real.spec.ts › case',
  '[] › tests/e2e/smoke.spec.ts › case',
  '[] › ../smoke.spec.ts › case',
  '[] › smoke.spec.ts:bad › case',
])('#659 malformed or ambiguous test-list conservatively starts fixture: %s', content => {
  const { directory, list } = fixture();
  expect(needsHistoricalServer(['test', '--test-list', list(content)], directory)).toBe(true);
});

it('#659 missing list and incomplete CLI options remain conservative', () => {
  const { directory } = fixture();
  expect(needsHistoricalServer(['test', '--test-list', join(directory, 'missing.txt')], directory)).toBe(true);
  expect(needsHistoricalServer(['test', '--test-list'], directory)).toBe(true);
  expect(needsHistoricalServer(['test', '--test-list='], directory)).toBe(true);
  expect(needsHistoricalServer(['test', '--test-list-invert'], directory)).toBe(true);
});

it('#659 inversion never establishes a positive current-only selection', () => {
  const { directory, list } = fixture();
  const inverted = list('[] › duelPreset372.spec.ts › one historical case', 'inverted.txt');
  expect(needsHistoricalServer(['test', '--test-list-invert', inverted], directory)).toBe(true);
  expect(needsHistoricalServer(['test', 'tests/e2e/smoke.spec.ts', '--test-list-invert', inverted], directory)).toBe(false);
  const selected = list('[] › smoke.spec.ts › current case');
  expect(needsHistoricalServer(['test', '--test-list', selected, `--test-list-invert=${inverted}`], directory)).toBe(false);
});

it('#659 a malformed inverted list does not suppress fixture startup', () => {
  const { directory, list } = fixture();
  expect(needsHistoricalServer(['test', 'tests/e2e/smoke.spec.ts', '--test-list-invert', list('[] › missing.spec.ts')], directory)).toBe(true);
});
