import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import raw from '../../src/data/techs.json';
import { loadCore } from '../../src/data';
import { DLCS } from '../../src/domain/dlc';
import { techDlc, techReleaseMatches, techUpdate } from '../../src/domain/introductions';
import { techs } from './helpers';

interface Entry {
  id: number;
  en: string;
  zh: string;
  release: number | null;
  update?: string;
  sourceURL: string;
  evidence: string;
  status: string;
}
const audit = JSON.parse(readFileSync('scripts/catalog_introductions.json', 'utf8')) as {
  releases: string[];
  techs: Entry[];
  units: Entry[];
  buildings: Entry[];
};

describe('#195 科技自身首发，独立于文明首发', () => {
  it.each([
    [493, 2], // Chivalry：失落帝国，而非法兰克的国王时代。
    [435, 1], // Bloodlines：征服者。
    [199, 0], // Fletching：国王时代，0 不能被当作空值。
    [757, 7], // 官方51737明确为公爵的崛起首发配套更新。
    [1404, 12], // 海战改版明确随最后的酋长首发。
    [34, 12],
  ])('科技 %i 的首发为 %i', (id, release) => {
    expect(techDlc({ id })).toBe(release);
  });

  it('改分配文明、类型或中文别名，不改变当前具名科技的来源', () => {
    const reassigned = { id: 493, civs: ['Romans'], type: 'Research', en: 'Chivalry', zh: '别名' };
    expect(techDlc(reassigned)).toBe(2);
    expect(techDlc({ id: 999999 })).toBeNull();
    expect(techUpdate({ id: 999999 })).toBeUndefined();
  });

  it('独立免费更新有更新号，不冒用资料片或混进未标注', () => {
    expect(techDlc({ id: 875 })).toBeNull();
    expect(techUpdate({ id: 875 })).toBe('81058');
    expect(techDlc({ id: 902 })).toBeNull();
    expect(techUpdate({ id: 902 })).toBe('141935');
    const gambesons = { dlc: null, introducedUpdate: '81058' };
    expect(techReleaseMatches(gambesons, 'update')).toBe(true);
    expect(techReleaseMatches(gambesons, 'none')).toBe(false);
    expect(techReleaseMatches(gambesons, '8')).toBe(false);
    expect(techReleaseMatches(gambesons, '')).toBe(true);
    expect(techReleaseMatches({ dlc: null }, 'none')).toBe(true);
    expect(techReleaseMatches({ dlc: 0 }, '0')).toBe(true);
    expect(techReleaseMatches({ dlc: 0 }, 'none')).toBe(false);
  });

  it('全部 199 条科技登记真实 ID、英文身份、核对状态与证据', () => {
    expect(raw).toHaveLength(199);
    expect(audit.techs).toHaveLength(raw.length);
    expect(new Set(audit.techs.map((row) => row.id)).size).toBe(raw.length);
    const identities = new Map(raw.map((row) => [row.id, row.en]));
    expect(audit.releases).toEqual(DLCS.map((release) => release.zh));
    for (const row of audit.techs) {
      expect(row.en, String(row.id)).toBe(identities.get(row.id));
      expect(row.sourceURL).toMatch(/^https:\/\//);
      expect(row.evidence.trim()).not.toBe('');
      expect(['verified', 'unverified']).toContain(row.status);
      if (row.status === 'unverified') {
        expect(row.release).toBeNull();
        expect(row.update).toBeUndefined();
      } else if (row.update) {
        expect(row.update).toMatch(/^\d{4,6}$/);
        expect(row.release).toBeNull();
      } else {
        expect(row.release).not.toBeNull();
        expect(row.release).toBeGreaterThanOrEqual(0);
        expect(row.release).toBeLessThan(DLCS.length);
      }
    }
  });

  it('运行时、helpers 和生成查表的全部科技一致', async () => {
    const core = await loadCore();
    const expected = audit.techs.map((row) => [row.id, row.release, row.update]);
    expect(core.techs.map((row) => [row.id, row.dlc, row.introducedUpdate])).toEqual(expected);
    expect(techs.map((row) => [row.id, row.dlc, row.introducedUpdate])).toEqual(expected);
    for (const row of audit.techs) {
      expect(techDlc(row)).toBe(row.release);
      expect(techUpdate(row)).toBe(row.update);
    }
  });
});

describe('#195 生成器拒绝未重新核对的数据', () => {
  it.each([
    'missing',
    'renamed',
    'malformed-id-name',
    'duplicate',
    'evidence',
    'status',
    'release',
    'update',
    'release-and-update',
    'unverified-update',
    'unit-update',
  ])('%s 不能绕过来源检查', (fault) => {
    const dir = mkdtempSync(join(tmpdir(), 'aoe2-195-'));
    try {
      mkdirSync(join(dir, 'scripts'));
      mkdirSync(join(dir, 'src/data'), { recursive: true });
      copyFileSync('scripts/catalog_introductions.mjs', join(dir, 'scripts/catalog_introductions.mjs'));
      for (const kind of ['units', 'buildings', 'techs']) copyFileSync(`src/data/${kind}.json`, join(dir, `src/data/${kind}.json`));
      const invalid = structuredClone(audit);
      const row = invalid.techs[0]!;
      if (fault === 'missing') invalid.techs.pop();
      if (fault === 'renamed') row.en = 'Unreviewed renamed technology';
      if (fault === 'malformed-id-name') {
        row.id = 999999;
        Reflect.deleteProperty(row, 'en');
      }
      if (fault === 'duplicate') invalid.techs[1] = { ...row };
      if (fault === 'evidence') row.evidence = ' ';
      if (fault === 'status') row.status = 'guessed';
      if (fault === 'release') Object.assign(row, { status: 'verified', release: 999, update: undefined });
      if (fault === 'update') Object.assign(row, { status: 'verified', release: null, update: 'guessed' });
      if (fault === 'release-and-update') Object.assign(row, { status: 'verified', release: 8, update: '81058' });
      if (fault === 'unverified-update') Object.assign(row, { status: 'unverified', release: null, update: '81058' });
      if (fault === 'unit-update') Object.assign(invalid.units[0]!, { status: 'verified', release: null, update: '81058' });
      writeFileSync(join(dir, 'scripts/catalog_introductions.json'), JSON.stringify(invalid));
      expect(() => execFileSync(process.execPath, [join(dir, 'scripts/catalog_introductions.mjs')], { stdio: 'pipe' })).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
