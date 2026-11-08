import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pins from '../../scripts/data_sources.json';
import { SCOUTING_CONTENT, scoutingVersionParts } from '../../src/domain/scouting';
import { commitUrl, versionLabel, type DataSources } from '../../src/shared/utils/dataInfo';

const root = resolve(__dirname, '../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('data version info', () => {
  const p = pins as unknown as DataSources;
  it('label from pinned sources', () => {
    expect(versionLabel(p)).toBe(`DE ${p.patch.build}（${p.patch.date}）`);
  });
  it('README and AGENTS advertise the pinned current version, not the old snapshot', () => {
    for (const file of ['README.md', 'AGENTS.md']) {
      const body = read(file);
      expect(body).toMatch(new RegExp(`DE (?:Update )?${p.patch.build}`));
      expect(body).not.toMatch(/DE Update 185872|DE 185872|DE185872/);
    }
  });
  it('scouting separates the frozen content base from the current data version', () => {
    expect(SCOUTING_CONTENT.dataVersion).toBe('DE185872');
    expect(scoutingVersionParts(SCOUTING_CONTENT.dataVersion, versionLabel(p), p.patch.build)).toEqual({
      content: '内容基期 DE185872',
      current: `数值口径 ${versionLabel(p)}`,
      note: '内容未按 188329 重录',
    });
  });
  it('every source is pinned to a full commit; dat also to sha256 + recorded markers', () => {
    Object.values(p.sources).forEach((s) => expect(s.commit).toMatch(/^[0-9a-f]{40}$/));
    expect(p.sources.dat!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(p.sources.dat!.markers).toMatchObject({ civs: 63 });
    const dat = p.sources.dat!;
    expect(commitUrl(dat)).toBe(`https://github.com/${dat.repo}/tree/${dat.commit}/${dat.path}`);
  });
});
