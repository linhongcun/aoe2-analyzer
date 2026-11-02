/** issue 308：固定生成数据驱动的理想齐射模型，不估计未收录的护甲类别。 */
import { DAT, toEffects } from './datEffects';
import { applyEffects, baseStats } from './simulator';
import { buildingBase } from './buildingSim';
import type { Building, Unit } from './types';

// 有界的小规模理想齐射工具；避免把任意大军数量误读成包含碰撞/寻路的模拟。
export const SIEGE_MAX_COUNT = 40;
export const SIEGE_SPEED = 1.7;
export const SIEGE_DEFAULT_UNIT_ID = 1258;
export const SIEGE_DEFAULT_N = 4;
export const SIEGE_DEFAULT_BUILDING_ID = 82;
export const SIEGE_UNIT_IDS: readonly number[] = [1258, 422, 548, 331, 280, 550, 588, 36];
export const SIEGE_COMPARE_IDS: readonly number[] = [109, 82, 79, 117, 487];
/** 石墙、城门不从建筑页进入攻城工具。对照表仍按既有攻城页显示。 */
const SIEGE_BUILDING_ENTRY_EXCLUDED = new Set([117, 487]);
export const SIEGE_MANGONEL_REASON = '主弹与副弹的伤害结算尚未对齐，不推算击数与用时。';
export const SIEGE_STONE_DEFENSE_REASON = '建筑的「石质防御」护甲数据尚未对齐，不推算击数与用时。';
export interface SiegeConfig {
  unit: number;
  n: number;
  bldg: number;
  civ: string;
  armor: number[];
}
interface SiegeCatalog {
  units: readonly Unit[];
  buildings: readonly Building[];
}
export type SiegeResult = { verified: true; damage: number; hits: number; gameSeconds: number; realSeconds: number } | { verified: false; reason: string };
const unknown = (reason: string): SiegeResult => ({ verified: false, reason });

/** 只提供 .dat 中对当前目标有明确建筑效果的护甲科技。 */
export function siegeArmorTechs(building: Building) {
  return ['Masonry', 'Architecture'].flatMap((en) => {
    const entry = DAT.techs[en];
    return entry?.rules.some((r) => r.b && r.t.includes(building.id)) ? [{ id: entry.id, en }] : [];
  });
}

export function decodeSiege(search: string, catalog: SiegeCatalog): SiegeConfig {
  const params = new URLSearchParams(search);
  const unit = Number(params.get('unit'));
  const bldg = Number(params.get('bldg'));
  const n = params.get('n') ?? '';
  const target = catalog.buildings.find((b) => b.id === bldg) ?? catalog.buildings.find((b) => b.id === SIEGE_DEFAULT_BUILDING_ID)!;
  const civ = params.get('civ') ?? '';
  const allowed = siegeArmorTechs(target).map((t) => t.id);
  const armor = [
    ...new Set(
      (params.get('armor') ?? '')
        .split(',')
        .map(Number)
        .filter((id) => allowed.includes(id)),
    ),
  ].sort((a, b) => a - b);
  return {
    unit: SIEGE_UNIT_IDS.includes(unit) && catalog.units.some((u) => u.id === unit) ? unit : SIEGE_DEFAULT_UNIT_ID,
    n: /^\d+$/.test(n) && Number(n) > 0 ? Math.min(SIEGE_MAX_COUNT, Number(n)) : SIEGE_DEFAULT_N,
    bldg: target.id,
    civ: DAT.civs[civ]?.dat ? civ : '',
    armor,
  };
}

export function encodeSiege(config: SiegeConfig): string {
  const params = new URLSearchParams({ unit: String(config.unit), n: String(config.n), bldg: String(config.bldg) });
  if (config.civ) params.set('civ', config.civ);
  if (config.armor.length) params.set('armor', [...config.armor].sort((a, b) => a - b).join(','));
  return params.toString();
}

export type SiegeCanonical = { kind: 'ignore' } | { kind: 'keep' } | { kind: 'replace' };

/**
 * 地址栏已经离开攻城页时，不要用这次渲染里的默认参数 replace 回去。
 * 路径尾斜杠不单独触发 replace。
 */
export function decideSiegeCanonical(liveHash: string, canonicalSearch: string): SiegeCanonical {
  const raw = liveHash.startsWith('#') ? liveHash.slice(1) : liveHash;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // 不完整的百分号编码保持原样，避免一次坏地址打断默认参数同步。
  }
  const q = decoded.indexOf('?');
  const path = (q >= 0 ? decoded.slice(0, q) : decoded).replace(/\/+$/, '') || '/';
  if (path !== '/siege') return { kind: 'ignore' };
  const search = q >= 0 ? decoded.slice(q) : '';
  if (search === canonicalSearch) return { kind: 'keep' };
  return { kind: 'replace' };
}

/** 单位详情「算拆建筑」：对城堡、缺省数量、无文明、无护甲已核实才显示。 */
export function siegeUnitEntryVerified(unit: Unit, castle: Building | undefined): boolean {
  return !!castle && castle.id === SIEGE_DEFAULT_BUILDING_ID && calculateSiege(unit, castle, SIEGE_DEFAULT_N, '', []).verified;
}

/** 建筑详情「算攻城拆这座」：对照表内、默认攻城锤已核实，且不是石墙或城门。 */
export function siegeBuildingEntryVerified(building: Building, ram: Unit | undefined): boolean {
  if (!ram || ram.id !== SIEGE_DEFAULT_UNIT_ID) return false;
  if (!SIEGE_COMPARE_IDS.includes(building.id) || SIEGE_BUILDING_ENTRY_EXCLUDED.has(building.id)) return false;
  return calculateSiege(ram, building, SIEGE_DEFAULT_N, '', []).verified;
}

export function calculateSiege(u: Unit, b: Building, n: number, civ = '', armor: readonly number[] = []): SiegeResult {
  if ([280, 550, 588].includes(u.id)) return unknown(SIEGE_MANGONEL_REASON);
  if (!Number.isInteger(n) || n < 1 || n > SIEGE_MAX_COUNT) return unknown('数量须在允许范围内。');
  if (civ && (!DAT.civs[civ]?.dat || !u.civs.includes(civ))) return unknown('当前文明的单位可用性或效果数据未核实。');
  const attacker = baseStats(u);
  const defender = buildingBase(b);
  // 按所选单位的时代计入无科技前置的文明属性效果；不加入手工回退、独特科技或盟友效果。
  for (const entry of DAT.civs[civ]?.bonus ?? []) {
    if (entry.age > u.age || entry.req.length) continue;
    for (const rule of entry.rules) {
      if (!rule.b && rule.t.includes(u.id)) applyEffects(attacker, toEffects(rule.fx));
    }
  }
  const available = siegeArmorTechs(b);
  if (armor.some((id) => !available.some((t) => t.id === id))) return unknown('目标建筑缺少该护甲科技的可核实效果。');
  for (const tech of available) {
    if (!armor.includes(tech.id)) continue;
    for (const rule of DAT.techs[tech.en]!.rules) {
      if (rule.b && rule.t.includes(b.id)) applyEffects(defender, toEffects(rule.fx));
    }
  }
  const attacks: Record<string, number> = { ...attacker.bonus };
  for (const [category] of u.atks) {
    if (category === '近战' || category === '穿刺') attacks[category] = attacker.atk;
  }
  // buildings_build.py 从 .dat 类别 11 生成 barm。建筑不属于攻城武器/船只/僧侣，不能加上对应伤害。
  const irrelevant = new Set(['攻城武器', '重型攻城武器', '船只', '僧侣']);
  const armors: Record<string, number> = { 近战: defender.ma, 穿刺: defender.pa, 所有建筑: defender.barm };
  let sum = 0;
  for (const [category, attack] of Object.entries(attacks)) {
    if (irrelevant.has(category)) continue;
    if (!(category in armors) || !Number.isFinite(armors[category]) || !Number.isFinite(attack))
      return unknown(category === '石质防御' ? SIEGE_STONE_DEFENSE_REASON : `建筑缺少「${category}」护甲的可核实数据。`);
    sum += Math.max(0, attack - armors[category]!);
  }
  const damage = Math.max(1, sum);
  const interval = attacker.rof / attacker.rofx;
  if (!u.atks.length || !Number.isFinite(defender.hp) || defender.hp <= 0 || !Number.isFinite(interval) || interval <= 0)
    return unknown('生命值或攻击间隔数据待补。');
  const hits = Math.ceil(Math.round(defender.hp) / (n * damage));
  const gameSeconds = (hits - 1) * interval;
  return { verified: true, damage, hits, gameSeconds, realSeconds: gameSeconds / SIEGE_SPEED };
}
