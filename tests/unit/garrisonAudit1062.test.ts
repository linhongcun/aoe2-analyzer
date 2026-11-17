import { describe, expect, it } from 'vitest';
import input from '../../data/sources/garrison_audit.json';
import report from '../../data/reports/garrison-audit.json';
import { buildAudit, parseAuditUrl, validateInput } from '../../scripts/garrison_audit';
import { loadCore } from '../../src/data';

describe('#1062 fixed 188329 garrison model audit', () => {
  it('locks all 30 PRD configurations separately, including empty controls', () => {
    const groups: [string, string, number, number[], (number | null)[], number[]][] = [
      ['K-T', 'Koreans', 235, [], [null, 1903, 1903, 1903, 1903, 1903, 1901, 492, 83, 359, 567], [0, 1, 2, 3, 4, 5, 5, 5, 5, 5, 5]],
      ['K-C', 'Koreans', 82, [], [null, 1903], [0, 20]],
      ['K-TC', 'Koreans', 109, [], [null, 1903, 1903, 1903], [0, 5, 6, 15]],
      ['M-ON', 'Malians', 109, [576], [null, 1015, 1013, 567, 492, 492, 492, 83, 83, 83], [0, 5, 5, 5, 5, 8, 9, 5, 9, 10]],
      ['M-OFF', 'Malians', 109, [], [null, 492, 83], [0, 5, 5]],
    ];
    const expected = groups.flatMap(([prefix, civ, buildingId, techs, ids, counts]) =>
      ids.map((unitId, index) => ({
        id: `${prefix}-${String(index).padStart(2, '0')}`,
        buildingId,
        client: null,
        config: { civ, age: 4, techs, rows: unitId === null ? [] : [{ unitId, count: String(counts[index]), entry: 'enter' }] },
      })),
    );
    expect(input.samples).toEqual(expected);
    expect(new Set(report.samples.map((s) => s.url)).size).toBe(30);
  });

  it('reproduces fields, effective technology, formulas, full URLs and missing-evidence states', async () => {
    const audit = await buildAudit(input);
    expect(audit.meta).toEqual(report.meta);
    expect(audit.samples).toEqual(report.samples);
    expect(audit.samples.map((s) => s.model.totalProjectiles)).toEqual([
      1, 2, 3, 4, 5, 5, 5, 4, 4, 1, 1, 5, 21, 0, 9, 10, 10, 8, 8, 8, 8, 14, 17, 18, 13, 17, 18, 0, 6, 5,
    ]);
    for (const s of audit.samples) {
      expect(s.client).toBeNull();
      expect(s.siteBuild).toBeNull();
      expect(s.evidence.status).toBe('未核实（仅模型）');
      expect(s.model.errors).toEqual([]);
      expect(s.model.usedSlots).toBeLessThanOrEqual(s.model.capacity);
      expect(s.model.totalProjectiles).not.toBeNull();
    }
    const tower = audit.samples.find((s) => s.id === 'K-T-01')!;
    expect(tower.technology.explicit).toEqual([]);
    expect(tower.technology.free).toEqual([63, 140]);
    expect(tower.technology.implied).toEqual([63, 140, 982]);
    expect(tower.technology.selected).not.toContain(982);
    const onager = audit.samples.find((s) => s.id === 'M-ON-00')!;
    expect(onager.technology.relevantEffects.some((r) => r.id === 576)).toBe(true);
    expect(audit.samples.find((s) => s.id === 'M-ON-07')!.contributions[0]!.formula).toBe('-firepower');
  });

  it.each(['patch', 'datSha256', 'client', 'verified', 'count', 'entry', 'duplicate', 'missing', 'extra'])(
    'rejects %s drift/forged evidence instead of coercing unknowns',
    (kind) => {
      const copy: Record<string, unknown> = structuredClone(input);
      const samples = copy.samples as Record<string, unknown>[];
      const row = (samples[1]!.config as { rows: Record<string, unknown>[] }).rows[0]!;
      if (kind === 'patch') copy.patch = 1;
      if (kind === 'datSha256') copy.datSha256 = '0'.repeat(64);
      if (kind === 'client') samples[0]!.client = { patch: 188329, observed: 0 };
      if (kind === 'verified') samples[0]!.status = '已核实（仅此版本与配置）';
      if (kind === 'count') row.count = null;
      if (kind === 'entry') row.entry = 'created';
      if (kind === 'duplicate') samples[1]!.id = samples[0]!.id;
      if (kind === 'missing') samples.pop();
      if (kind === 'extra') samples.push(structuredClone(samples[0]!));
      expect(() => validateInput(copy)).toThrow();
    },
  );

  it('fails invalid model inputs instead of generating or clamping a report', async () => {
    const copy = structuredClone(input);
    copy.samples[1]!.config.rows[0]!.count = '99';
    await expect(buildAudit(copy)).rejects.toThrow('enum');
  });

  it.each(['unknown ID', 'missing empty control', 'swapped bindings'])('rejects PRD coverage drift: %s', async (kind) => {
    const copy = structuredClone(input);
    if (kind === 'unknown ID') copy.samples[0]!.id = 'K-T-99';
    if (kind === 'missing empty control') copy.samples[0]!.config = structuredClone(copy.samples[1]!.config);
    if (kind === 'swapped bindings') [copy.samples[1]!.config, copy.samples[2]!.config] = [copy.samples[2]!.config, copy.samples[1]!.config];
    expect(() => validateInput(copy)).toThrow();
    await expect(buildAudit(copy)).rejects.toThrow();
  });

  it('accepts schema-valid configurations whose object keys are reordered', async () => {
    const reordered = {
      ...input,
      samples: input.samples.map((s) => ({
        ...s,
        config: Object.fromEntries(
          Object.entries(s.config)
            .reverse()
            .map(([key, value]) => [key, key === 'rows' ? s.config.rows.map((row) => Object.fromEntries(Object.entries(row).reverse())) : value]),
        ),
      })),
    };
    expect(() => validateInput(reordered)).not.toThrow();
    await expect(buildAudit(reordered)).resolves.toEqual({ meta: report.meta, samples: report.samples });
  });

  it('validates full URL identity, tab and exact inputs rather than only decoding its query', async () => {
    const core = await loadCore();
    const sample = report.samples[1]!;
    const payload: unknown = input;
    validateInput(payload);
    const config = payload.samples[1]!.config;
    const b = core.buildingById[sample.buildingId]!;
    expect(parseAuditUrl(sample.url, b, config)).toEqual(config);
    for (const url of [
      sample.url.replace('linhongcun.github.io', 'example.invalid'),
      sample.url.replace('/aoe2-analyzer/', '/'),
      sample.url.replace('/building/235?', '/building/109?'),
      sample.url.replace('tab=garrison', 'tab=other'),
      sample.url.replace('tab=garrison', 'tab=garrison&tab=other'),
      sample.url.replace('army=1903%3A1', 'army=1903%3A2'),
      sample.url + '&unexpected=1',
    ])
      expect(() => parseAuditUrl(url, b, config)).toThrow();
  });
});
