import { civByEn } from '../../data';
import { ARMY_COST_DATA, type ArmyCostConfig } from '../../domain/armyCostConfig';
import type { ArmySupplyRow, ArmySupplySettings } from '../../domain/armySupply';
import { DEFAULT_PRODUCTION } from '../../domain/production';
import { decodeArmyCost, encodeArmyCost } from './armyCostCodec';

const SUPPLY_VERSION = '1';
const MAX_QUERY_LENGTH = 32_768;
const SUPPLY_KEYS = ['mode', 'asv', 'asSource', 'asPlan'];

function supplyQuery(sourceQuery: string, settings: ArmySupplySettings): string {
  return new URLSearchParams({ mode: 'army-supply', asv: SUPPLY_VERSION, asSource: sourceQuery, asPlan: JSON.stringify(settings) }).toString();
}

export function emptyArmySupply(source: ArmyCostConfig): ArmySupplySettings {
  return {
    stance: '',
    planned: [],
    walk: DEFAULT_PRODUCTION.walk,
    farm: DEFAULT_PRODUCTION.farm,
    rows: source.rows.map(() => ({ building: 0, count: '', confirmed: false })),
  };
}

export function armySupplyHref(source: ArmyCostConfig): string | null {
  if (!civByEn(source.civ) || !/^[1-4]$/.test(source.age) || !source.rows.length) return null;
  const query = supplyQuery(encodeArmyCost(source), emptyArmySupply(source));
  return query.length < MAX_QUERY_LENGTH - 2048 ? '/production?' + query : null;
}

export function encodeArmySupply(source: ArmyCostConfig, settings: ArmySupplySettings): string {
  return supplyQuery(encodeArmyCost(source), settings);
}

type SupplyRead =
  { kind: 'valid'; source: ArmyCostConfig; sourceQuery: string; settings: ArmySupplySettings } | { kind: 'invalid'; reason: string; returnTo?: string };

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validDistance(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10;
}

function validRow(value: unknown): value is ArmySupplyRow {
  return (
    object(value) &&
    Object.keys(value).length === 3 &&
    Number.isSafeInteger(value.building) &&
    Number(value.building) >= 0 &&
    typeof value.count === 'string' &&
    typeof value.confirmed === 'boolean'
  );
}

export function decodeArmySupply(search: string): SupplyRead {
  const malformed: SupplyRead = { kind: 'invalid', reason: '无法打开这个供给方案。请从有效的阵容账本重新进入。' };
  if (search.length > MAX_QUERY_LENGTH) return malformed;
  try {
    decodeURIComponent(search);
    const params = new URLSearchParams(search);
    if (params.size !== SUPPLY_KEYS.length || SUPPLY_KEYS.some((key) => params.getAll(key).length !== 1)) return malformed;
    if (params.get('mode') !== 'army-supply' || params.get('asv') !== SUPPLY_VERSION) return malformed;
    const rawSource = params.get('asSource')!;
    const { config: source, dataChanged } = decodeArmyCost(rawSource);
    const dataVersion = new URLSearchParams(rawSource).get('acdata');
    if (!source || !dataVersion || !civByEn(source.civ) || !/^[1-4]$/.test(source.age) || !source.rows.length) return malformed;
    if (rawSource !== encodeArmyCost(source, dataVersion)) return malformed;
    const returnTo = '/production?' + rawSource;
    if (dataChanged || dataVersion !== ARMY_COST_DATA) return { kind: 'invalid', reason: '原账本数据版本已变化。请核对原账本后重新规划。', returnTo };
    let plan: unknown;
    try {
      plan = JSON.parse(params.get('asPlan')!);
    } catch {
      return { ...malformed, returnTo };
    }
    if (!object(plan) || Object.keys(plan).length !== 5) return { ...malformed, returnTo };
    const { stance, planned, walk, farm, rows } = plan;
    if (stance !== '' && stance !== 'current' && stance !== 'plan') return { ...malformed, returnTo };
    if (!Array.isArray(planned) || planned.length > 200 || planned.some((id) => !Number.isSafeInteger(id) || id <= 0)) return { ...malformed, returnTo };
    if (new Set(planned).size !== planned.length || !validDistance(walk) || !validDistance(farm)) return { ...malformed, returnTo };
    if (!Array.isArray(rows) || rows.length !== source.rows.length || !rows.every(validRow)) return { ...malformed, returnTo };
    return { kind: 'valid', source, sourceQuery: rawSource, settings: { stance, planned, walk, farm, rows } };
  } catch {
    return malformed;
  }
}
