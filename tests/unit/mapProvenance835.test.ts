import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateDocument } from '../../scripts/content-schema.mjs';
import { mapGuides } from '../../src/domain/mapGuides';
import { mapPositions } from '../../src/domain/mapPositions';

const meta = JSON.parse(readFileSync('scripts/map_catalog_meta.json', 'utf8')) as Record<string, { source?: string; checkedAt?: string }>;
const catalog = JSON.parse(readFileSync('src/data/mapCatalog.json', 'utf8')) as {
  maps: { id: string; source: string; checkedAt: string }[];
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('地图编辑内容 provenance（issue 835）', () => {
  it('83 张地图提示都有来源与核对日期，生成物逐项一致', () => {
    expect(Object.keys(meta)).toHaveLength(83);
    for (const [id, entry] of Object.entries(meta)) {
      expect(entry.source, id).toBe('editorial');
      expect(entry.checkedAt, id).toMatch(DATE);
    }
    expect(catalog.maps).toHaveLength(83);
    for (const map of catalog.maps) {
      expect(map.source, map.id).toBe(meta[map.id]?.source);
      expect(map.checkedAt, map.id).toBe(meta[map.id]?.checkedAt);
    }
  });

  it('schema 要求 source/checkedAt，缺失或非法值失败', () => {
    const file = 'src/data/mapCatalog.json';
    expect(validateDocument(file, catalog).valid).toBe(true);
    const copy = () => JSON.parse(JSON.stringify(catalog)) as { maps: Record<string, unknown>[] };
    const noSource = copy();
    delete noSource.maps[0]!.source;
    expect(validateDocument(file, noSource).valid).toBe(false);
    const badDate = copy();
    badDate.maps[0]!.checkedAt = '2026-13-40';
    expect(validateDocument(file, badDate).valid).toBe(false);
    const future = copy();
    future.maps[0]!.checkedAt = '2099-01-01';
    expect(validateDocument(file, future).valid).toBe(false);
    for (const source of ['', 'https://not a url', 'https:///', 'http://example.com']) {
      const badSource = copy();
      badSource.maps[0]!.source = source;
      expect(validateDocument(file, badSource).valid, source).toBe(false);
    }
    const noDate = copy();
    delete noDate.maps[0]!.checkedAt;
    expect(validateDocument(file, noDate).valid).toBe(false);
  });

  it('4 篇地图攻略都有核对状态，未知日期不伪装成已核对', () => {
    expect(Object.keys(mapGuides)).toHaveLength(4);
    for (const [id, guide] of Object.entries(mapGuides)) {
      expect(guide, id).toHaveProperty('checkedAt');
      expect(['verified', 'unverified', 'editorial']).toContain(guide.status);
      if (guide.checkedAt !== null) expect(guide.checkedAt, id).toMatch(DATE);
      for (const [, url] of guide.sources) expect(new URL(url).protocol, id).toBe('https:');
    }
    expect(mapGuides.arabia?.checkedAt).toBeNull();
    expect(mapGuides.arena?.checkedAt).toBeNull();
    expect(mapGuides.nomad?.checkedAt).toBe('2026-10-18');
    expect(mapGuides.islands?.checkedAt).toBe('2026-10-18');
  });

  it('12 条位置理由都有 civs.json 来源与核对日期', () => {
    const tips = Object.values(mapPositions).flatMap((positions) => [...positions.flank, ...positions.pocket]);
    expect(tips).toHaveLength(12);
    for (const tip of tips) {
      expect(tip.source, tip.civ).toBe('civs.json');
      expect(tip.checkedAt, tip.civ).toMatch(DATE);
    }
  });
});
