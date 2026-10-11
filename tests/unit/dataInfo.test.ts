import { describe, expect, it } from 'vitest';
import pins from '../../scripts/data_sources.json';
import { commitUrl, versionLabel, type DataSources } from '../../src/features/about/dataInfo';

describe('data version info', () => {
  const p = pins as unknown as DataSources;
  it('label from pinned sources', () => {
    expect(versionLabel(p)).toBe('DE 185872（2026-09-22）');
  });
  it('every source is pinned to a full commit; dat also to sha256 + recorded markers', () => {
    Object.values(p.sources).forEach((s) => expect(s.commit).toMatch(/^[0-9a-f]{40}$/));
    expect(p.sources.dat!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(p.sources.dat!.markers).toMatchObject({ civs: 63 });
    expect(commitUrl(p.sources.dat!)).toContain('/tree/0c38027504532826c9922e4db77e2c1d33554291/');
  });
});
