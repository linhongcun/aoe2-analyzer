import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import unitsRaw from '../../src/data/units.json';
import buildingsRaw from '../../src/data/buildings.json';
import techsRaw from '../../src/data/techs.json';
import { loadCore } from '../../src/data';
import { CIV_DLC, DLCS, dlcOf } from '../../src/domain/dlc';
import { buildingDlc, unitDlc } from '../../src/domain/introductions';
import { techs, units } from './helpers';

interface AuditEntry {
  id: number;
  en: string;
  release: number | null;
  sourceURL: string;
  evidence: string;
  status: string;
}
type Catalog = Record<'units' | 'buildings', AuditEntry[]>;
type Generated = Record<'units' | 'buildings', Record<string, number | null>>;
const audit = JSON.parse(readFileSync('scripts/catalog_introductions.json', 'utf8')) as Catalog & { releases: string[] };
const generated = JSON.parse(readFileSync('src/data/catalog-introductions.json', 'utf8')) as Generated;
const catalogs = { units: unitsRaw, buildings: buildingsRaw };

describe('#190 单位的首次引入版本', () => {
  it.each([
    [751, 2],
    [753, 1],
    [752, 1],
    [1747, 8],
    [1749, 8],
    [1302, 11],
    [1813, 10],
    [1759, 8],
    [1962, 11],
    [1750, 8],
    [1948, 11],
    [1786, 0],
    [1787, 0],
    [1788, 1],
  ])('单位 %i 的版本为 %i', (id, release) => {
    expect(unitDlc({ id })).toBe(release);
    expect(units.find((unit) => unit.id === id)?.dlc).toBe(release);
  });

  it('单位与建筑使用各自的 ID 命名空间，未知 ID 不推断版本', () => {
    expect(unitDlc({ id: 82 })).toBeNull();
    expect(buildingDlc({ id: 751 })).toBeNull();
    expect(unitDlc({ id: 999999 })).toBeNull();
    expect(buildingDlc({ id: 999999 })).toBeNull();
  });

  it('国王时代的索引 0 是有效版本', () => {
    expect(unitDlc({ id: 74 })).toBe(0);
    expect(buildingDlc({ id: 82 })).toBe(0);
  });

  it('已核对的版本不会随类型或拥有文明改变', () => {
    const reassignedUnit = { id: 751, en: 'Eagle Scout', type: 'UniqueUnit', civs: ['Franks'] };
    const reassignedBuilding = { id: 2556, en: 'Settlement', civs: ['Incas'] };
    expect(unitDlc(reassignedUnit)).toBe(2);
    expect(buildingDlc(reassignedBuilding)).toBe(12);
  });

  it.each([
    [792, 2],
    [2556, 12],
    [82, 0],
    [1754, 8],
  ])('建筑 %i 的版本为 %i', (id, release) => {
    expect(buildingDlc({ id })).toBe(release);
  });
});

describe('#190 首发版本核对清单', () => {
  for (const kind of ['units', 'buildings'] as const) {
    it(`${kind} 完整覆盖当前 ID 和英文名，且每个 ID 只登记一次`, () => {
      const raw = catalogs[kind];
      const entries = audit[kind];
      expect(audit.releases).toEqual(DLCS.map((dlc) => dlc.zh));
      expect(raw).toHaveLength(kind === 'units' ? 248 : 38);
      expect(entries).toHaveLength(raw.length);
      expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
      const names = new Map(raw.map((entry) => [entry.id, entry.en]));
      expect(entries.map((entry) => entry.id).sort((a, b) => a - b)).toEqual(raw.map((entry) => entry.id).sort((a, b) => a - b));
      for (const entry of entries) expect(entry.en, `${kind}/${entry.id}`).toBe(names.get(entry.id));
    });

    it(`${kind} 每条记录都有来源、证据、状态与有效版本`, () => {
      for (const entry of audit[kind]) {
        const label = `${kind}/${entry.id} ${entry.en}`;
        expect(entry.sourceURL.trim(), label).not.toBe('');
        expect(['http:', 'https:'], label).toContain(new URL(entry.sourceURL).protocol);
        expect(entry.evidence.trim(), label).not.toBe('');
        expect(entry.status.trim(), label).not.toBe('');
        if (entry.release !== null) {
          expect(Number.isInteger(entry.release), label).toBe(true);
          expect(entry.release, label).toBeGreaterThanOrEqual(0);
          expect(entry.release, label).toBeLessThan(DLCS.length);
        }
      }
    });

    it(`${kind} 构建产物与核对清单逐 ID 一致，没有额外记录`, () => {
      expect(generated[kind]).toEqual(Object.fromEntries(audit[kind].map((entry) => [entry.id, entry.release])));
      const lookup = kind === 'units' ? unitDlc : buildingDlc;
      for (const entry of audit[kind]) expect(lookup({ id: entry.id }), `${kind}/${entry.id}`).toBe(entry.release);
    });
  }

  it('同一具名单位的不同生产 ID 使用相同首次引入版本', () => {
    const grouped = new Map<string, Set<number | null>>();
    for (const entry of audit.units) {
      const releases = grouped.get(entry.en) ?? new Set<number | null>();
      releases.add(entry.release);
      grouped.set(entry.en, releases);
    }
    for (const [en, releases] of grouped) expect(releases.size, en).toBe(1);
  });

  it('运行时加载与单测 helpers 使用相同的完整版本映射', async () => {
    const core = await loadCore();
    expect(core.units.map((unit) => [unit.id, unit.dlc])).toEqual(units.map((unit) => [unit.id, unit.dlc]));
    for (const unit of core.units) expect(core.unitById[unit.id]?.dlc).toBe(unitDlc(unit));
    for (const building of core.buildings) expect(core.buildingById[building.id]?.dlc).toBe(buildingDlc(building));
  });
});

describe('#190 科技版本语义保持不变', () => {
  // 独立保留改动前的科技规则，避免用被测函数生成预期。
  const oldCommonTechs = ['Bloodlines', 'Caravan', 'Herbal Medicine', 'Heresy', 'Theocracy', 'Parthian Tactics', 'Thumb Ring'];
  const before = techsRaw.map((tech) => [
    tech.id,
    oldCommonTechs.includes(tech.en) ? 1 : tech.type === 'UniqueTech' && tech.civs.length === 1 ? (CIV_DLC[tech.civs[0]!] ?? null) : null,
  ]);

  it('全部 199 条科技的函数、helpers 与运行时结果保持原值', async () => {
    expect(techsRaw).toHaveLength(199);
    expect(techsRaw.map((tech) => [tech.id, dlcOf(tech)])).toEqual(before);
    expect(techs.map((tech) => [tech.id, tech.dlc])).toEqual(before);
    expect((await loadCore()).techs.map((tech) => [tech.id, tech.dlc])).toEqual(before);
  });
});
