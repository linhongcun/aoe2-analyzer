import { describe, expect, it } from 'vitest';
import pins from '../../data/sources/data_sources.json';
import { SCOUTING_CONTENT, scoutingVersionParts } from '../../src/domain/scouting';
import { commitUrl, versionLabel, type DataSources } from '../../src/shared/utils/dataInfo';

describe('data version info', () => {
  const p = pins as unknown as DataSources;
  it('label from pinned sources', () => {
    expect(versionLabel(p)).toBe(`DE ${p.patch.build}（${p.patch.date}）`);
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
