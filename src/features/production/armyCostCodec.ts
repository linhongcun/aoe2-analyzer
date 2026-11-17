import { ARMY_COST_DATA, ARMY_COST_VERSION, emptyArmyCost, type ArmyCostConfig } from '../../domain/armyCostConfig';
import { civByEn } from '../../data';

export function encodeArmyCost(config: ArmyCostConfig, dataVersion = ARMY_COST_DATA): string {
  return new URLSearchParams({
    mode: 'army-cost',
    acv: ARMY_COST_VERSION,
    acdata: dataVersion,
    civ: config.civ,
    age: config.age,
    acunits: JSON.stringify(config.rows),
    acdone: JSON.stringify([...new Set(config.done)].sort()),
    actargets: JSON.stringify([...new Set(config.targets)].sort()),
  }).toString();
}
export function decodeArmyCost(search: string): { config: ArmyCostConfig | null; errors: string[]; dataChanged: boolean } {
  const p = new URLSearchParams(search);
  const errors: string[] = [];
  try {
    decodeURIComponent(search.replace(/\+/g, ' '));
  } catch {
    return { config: null, errors: ['方案链接编码损坏。'], dataChanged: false };
  }
  for (const key of new Set([...p.keys()].filter((k) => ['mode', 'civ', 'age'].includes(k) || k.startsWith('ac'))))
    if (p.getAll(key).length > 1) errors.push(`方案字段 ${key} 重复。`);
  if (p.get('mode') !== 'army-cost') errors.push('阵容模式无效。');
  const hasPlan = ['acv', 'acdata', 'acunits', 'acdone', 'actargets'].some((key) => p.has(key));
  if (hasPlan && p.get('acv') !== ARMY_COST_VERSION) errors.push('方案格式版本缺失或不支持，无法安全恢复。');
  if (hasPlan && !p.has('acdata')) errors.push('方案缺少数据版本。');
  const config = emptyArmyCost(p.get('civ') ?? undefined, p.get('age') ?? undefined);
  if (hasPlan)
    try {
      const rows: unknown = JSON.parse(p.get('acunits') ?? 'null');
      const done: unknown = JSON.parse(p.get('acdone') ?? 'null');
      const targets: unknown = JSON.parse(p.get('actargets') ?? 'null');
      if (
        !Array.isArray(rows) ||
        rows.length > 12 ||
        !rows.every((r: unknown) => !!r && typeof r === 'object' && 'unit' in r && Number.isSafeInteger(r.unit) && 'qty' in r && typeof r.qty === 'string')
      )
        throw new Error();
      if (![done, targets].every((v) => Array.isArray(v) && v.length <= 200 && v.every((s: unknown) => typeof s === 'string'))) throw new Error();
      config.rows = rows;
      config.done = [...new Set(done as string[])];
      config.targets = [...new Set(targets as string[])];
    } catch {
      errors.push('兵种或研究字段无法解析，未自动生成有效方案。');
    }
  return { config: errors.length ? null : config, errors, dataChanged: hasPlan && p.get('acdata') !== ARMY_COST_DATA };
}

/** All four modes share only a valid civilization/age at this boundary. */
export function armyContextQuery(search: string): string {
  const p = new URLSearchParams(search);
  const out = new URLSearchParams();
  const civ = p.get('civ');
  const age = p.get('age');
  if (civ && civByEn(civ)) out.set('civ', civ);
  if (age && /^[1-4]$/.test(age)) out.set('age', age);
  return out.toString();
}
