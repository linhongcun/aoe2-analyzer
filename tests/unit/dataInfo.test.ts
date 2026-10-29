import { describe, expect, it } from 'vitest';
import pins from '../../scripts/data_sources.json';
import { commitUrl, versionLabel, type DataSources } from '../../src/shared/utils/dataInfo';

describe('data version info', () => {
  const p = pins as unknown as DataSources;
  it('label from pinned sources', () => {
    expect(versionLabel(p)).toBe(`DE ${p.patch.build}（${p.patch.date}）`);
  });
  it('every source is pinned to a full commit; dat also to sha256 + recorded markers', () => {
    Object.values(p.sources).forEach((s) => expect(s.commit).toMatch(/^[0-9a-f]{40}$/));
    expect(p.sources.dat!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(p.sources.dat!.markers).toMatchObject({ civs: 63 });
    const dat = p.sources.dat!;
    expect(commitUrl(dat)).toBe(`https://github.com/${dat.repo}/tree/${dat.commit}/${dat.path}`);
  });
});
