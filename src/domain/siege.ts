/** issue 308 / 1469：固定生成数据驱动的理想齐射模型，不估计未收录的护甲类别。 */
import { DAT, toEffects } from './datEffects';
import { MOUNTED_REDUCTION_CLASS } from './affects';
import { civStatus } from './civStatus';
import { prereqChain, toggleSelected } from './prereq';
import { applyEffects, baseStats } from './simulator';
import { damageRows, hitCount, totalDamage } from './damageCore';
import { mainAttackType } from './duelFighter';
import { buildingBase } from './buildingSim';
import type { Building, Tech, Trees, Unit } from './types';
import { verifiedSiegeInputs } from './siegeEvidence';

// 有界的小规模理想齐射工具；避免把任意大军数量误读成包含碰撞/寻路的模拟。
export const SIEGE_MAX_COUNT = 40;
export const SIEGE_SPEED = 1.7;
export const SIEGE_DEFAULT_UNIT_ID = 1258;
export const SIEGE_DEFAULT_N = 4;
export const SIEGE_DEFAULT_BUILDING_ID = 82;
export const SIEGE_UNIT_IDS: readonly number[] = [1258, 422, 548, 1744, 1746, 331, 280, 550, 588, 36];
export const SIEGE_MANGONEL_IDS: readonly number[] = [280, 550, 588];
export const SIEGE_EVIDENCE_UNIT_ID = 36;
const SIEGE_ATTACKER_STATS = new Set(['atk', 'bonus', 'rof']);

export function isRegularSiegeUnit(unitId: number): boolean {
  return SIEGE_UNIT_IDS.includes(unitId) && unitId !== SIEGE_EVIDENCE_UNIT_ID && !SIEGE_MANGONEL_IDS.includes(unitId);
}

export function siegeUnitCounter(unitId: number): '头' | '台' {
  return unitId === 1744 || unitId === 1746 ? '头' : '台';
}

/** 仅接受严格十进制正整数且落在 [1, SIEGE_MAX_COUNT]（拒绝空串、前导零、正负号、空白、小数、科学计数法与非数字）。 */
export function parseSiegeCountInput(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 1 && n <= SIEGE_MAX_COUNT ? n : null;
}
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
  techs: number[];
}

export interface SiegeTechContext {
  techs: readonly Tech[];
  trees?: Trees;
}

export interface SiegeCatalog {
  units: readonly Unit[];
  buildings: readonly Building[];
  techs?: readonly Tech[];
  trees?: Trees;
}

export type SiegeResult = { verified: true; damage: number; hits: number; gameSeconds: number; realSeconds: number } | { verified: false; reason: string };
const unknown = (reason: string): SiegeResult => ({ verified: false, reason });

function buildTechById(techs: readonly Tech[]): Record<number, Tech> {
  const byId: Record<number, Tech> = {};
  for (const tech of techs) byId[tech.id] = tech;
  return byId;
}

function timedResult(hp: number, damage: number, interval: number, n: number): SiegeResult {
  const volleyDamage = n * damage;
  if (![hp, damage, interval, volleyDamage].every((value) => Number.isFinite(value) && value > 0)) return unknown('生命值、伤害或攻击间隔数据待补。');
  const hits = hitCount(hp, volleyDamage, { roundHp: true, epsilon: 0 });
  const gameSeconds = (hits - 1) * interval;
  const realSeconds = gameSeconds / SIEGE_SPEED;
  if (!Number.isSafeInteger(hits) || hits < 1 || !Number.isFinite(gameSeconds) || !Number.isFinite(realSeconds)) return unknown('伤害或用时数据待补。');
  return { verified: true, damage, hits, gameSeconds, realSeconds };
}

/** 只提供 .dat 中对当前目标有明确建筑效果的护甲科技。 */
export function siegeArmorTechs(building: Building) {
  return ['Masonry', 'Architecture'].flatMap((en) => {
    const entry = DAT.techs[en];
    return entry?.rules.some((r) => r.b && r.t.includes(building.id)) ? [{ id: entry.id, en }] : [];
  });
}

/**
 * 数据驱动提取常规攻城单位适用的已编码攻方攻城科技（atk / bonus / rof），零硬编码白名单。
 * 返回界面展示顺序（通用科技在前，文明独科在后，同组按时代升序、id 升序）；
 * 实际计算叠加在 calculateSiege 内严格按 DAT.techs（effects.json）键序执行。
 */
export function siegeAttackerTechs(u: Unit, civ: string, ctx: SiegeTechContext): Tech[] {
  if (!isRegularSiegeUnit(u.id)) return [];
  if (civ && (!DAT.civs[civ]?.dat || !u.civs.includes(civ) || !ctx.trees)) return [];
  const techById = buildTechById(ctx.techs);
  const selectedTree = civ && ctx.trees ? civStatus(ctx.trees, civ) : null;
  const treeCache = new Map<string, Record<string, number>>();
  const civHasInTree = (civEn: string, techId: number): boolean => {
    if (!ctx.trees) return true;
    let status = treeCache.get(civEn);
    if (!status) {
      status = civStatus(ctx.trees, civEn);
      treeCache.set(civEn, status);
    }
    return Boolean(status['t' + techId]);
  };
  const found: Tech[] = [];
  for (const [en, entry] of Object.entries(DAT.techs)) {
    if (!entry.combat) continue;
    const hits = entry.rules.some((r) => !r.b && r.t.includes(u.id) && r.fx.some((f) => SIEGE_ATTACKER_STATS.has(f.s)));
    if (!hits) continue;
    const tech = techById[entry.id];
    if (!tech || tech.en !== en) continue;
    if (civ) {
      if (!tech.civs.includes(civ) || !selectedTree?.['t' + tech.id]) continue;
    } else {
      if (tech.type === 'UniqueTech') continue;
      if (!u.civs.some((c) => tech.civs.includes(c) && civHasInTree(c, tech.id))) continue;
    }
    found.push(tech);
  }
  return found.sort((a, b) => {
    const aUnique = a.type === 'UniqueTech' ? 1 : 0;
    const bUnique = b.type === 'UniqueTech' ? 1 : 0;
    return aUnique - bUnique || a.age - b.age || a.id - b.id;
  });
}

/** 过滤不在当前可用集中的攻方科技，并沿 prereqChain 自动补齐合法前置，升序去重返回。 */
export function normalizeSiegeTechs(rawIds: readonly number[], available: readonly Tech[], techById: Record<number, Tech>): number[] {
  const availSet = new Set(available.map((t) => t.id));
  const out = new Set<number>();
  for (const id of rawIds) {
    if (!availSet.has(id)) continue;
    out.add(id);
    const tech = techById[id];
    if (!tech) continue;
    for (const pre of prereqChain(tech, techById)) {
      if (availSet.has(pre.id)) out.add(pre.id);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** 复用 prereq.ts 切换单项攻方科技：选中补前置，取消级联移除后继，升序返回。 */
export function toggleSiegeTech(id: number, selected: readonly number[], available: readonly Tech[], techById: Record<number, Tech>): number[] {
  const availSet = new Set(available.map((t) => t.id));
  const next = toggleSelected(id, new Set(selected), techById, {
    available: availSet,
    cascadeChain: true,
    crossUnavailable: true,
    sort: true,
  });
  return [...next].filter((tid) => availSet.has(tid)).sort((a, b) => a - b);
}

export function decodeSiege(search: string, catalog: SiegeCatalog): SiegeConfig {
  const params = new URLSearchParams(search);
  const unit = Number(params.get('unit'));
  const bldg = Number(params.get('bldg'));
  const n = params.get('n') ?? '';
  const target = catalog.buildings.find((b) => b.id === bldg) ?? catalog.buildings.find((b) => b.id === SIEGE_DEFAULT_BUILDING_ID)!;
  const civRaw = params.get('civ') ?? '';
  const civ = DAT.civs[civRaw]?.dat ? civRaw : '';
  const resolvedUnitId = SIEGE_UNIT_IDS.includes(unit) && catalog.units.some((u) => u.id === unit) ? unit : SIEGE_DEFAULT_UNIT_ID;
  const resolvedUnit = catalog.units.find((u) => u.id === resolvedUnitId);
  const allowed = siegeArmorTechs(target).map((t) => t.id);
  const armor = [
    ...new Set(
      (params.get('armor') ?? '')
        .split(',')
        .map(Number)
        .filter((id) => allowed.includes(id)),
    ),
  ].sort((a, b) => a - b);
  const rawTechs = (params.get('techs') ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => /^\d+$/.test(part))
    .map(Number);
  let techs: number[] = [];
  if (resolvedUnit && catalog.techs) {
    const available = siegeAttackerTechs(resolvedUnit, civ, { techs: catalog.techs, trees: catalog.trees });
    techs = normalizeSiegeTechs(rawTechs, available, buildTechById(catalog.techs));
  }
  return {
    unit: resolvedUnitId,
    n: /^\d+$/.test(n) && Number(n) > 0 ? Math.min(SIEGE_MAX_COUNT, Number(n)) : SIEGE_DEFAULT_N,
    bldg: target.id,
    civ,
    armor,
    techs,
  };
}

export function encodeSiege(config: SiegeConfig): string {
  const params = new URLSearchParams({ unit: String(config.unit), n: String(config.n), bldg: String(config.bldg) });
  if (config.civ) params.set('civ', config.civ);
  if (config.armor.length) params.set('armor', [...new Set(config.armor)].sort((a, b) => a - b).join(','));
  if (config.techs.length) params.set('techs', [...new Set(config.techs)].sort((a, b) => a - b).join(','));
  return params.toString();
}

export type SiegeCanonical = { kind: 'ignore' } | { kind: 'keep' } | { kind: 'replace' };

/**
 * 地址栏已经离开攻城页时，不要用这次渲染里的默认参数 replace 回去。
 * 路径尾斜杠不单独触发 replace；仅对路径做 decodeURIComponent，查询串保留原始编码以精确匹配 URLSearchParams（如 %2C）。
 */
export function decideSiegeCanonical(liveHash: string, canonicalSearch: string): SiegeCanonical {
  const raw = liveHash.startsWith('#') ? liveHash.slice(1) : liveHash;
  const q = raw.indexOf('?');
  const rawPath = q >= 0 ? raw.slice(0, q) : raw;
  const rawSearch = q >= 0 ? raw.slice(q) : '';
  let decodedPath = rawPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    // 不完整的百分号编码保持原样，避免一次坏地址打断默认参数同步。
  }
  const path = decodedPath.replace(/\/+$/, '') || '/';
  if (path !== '/siege') return { kind: 'ignore' };
  if (rawSearch === canonicalSearch) return { kind: 'keep' };
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

export function calculateSiege(
  u: Unit,
  b: Building,
  n: number,
  civ = '',
  armor: readonly number[] = [],
  attackerTechs: readonly number[] = [],
  techCtx?: SiegeTechContext,
): SiegeResult {
  if (SIEGE_MANGONEL_IDS.includes(u.id)) return unknown(SIEGE_MANGONEL_REASON);
  if (!Number.isInteger(n) || n < 1 || n > SIEGE_MAX_COUNT) return unknown('数量须在允许范围内。');
  if (civ && (!DAT.civs[civ]?.dat || !u.civs.includes(civ))) return unknown('当前文明的单位可用性或效果数据未核实。');
  if (u.id === SIEGE_EVIDENCE_UNIT_ID) {
    if (attackerTechs.length > 0) return unknown('手推炮暂不支持攻方科技计算。');
    const inputs = verifiedSiegeInputs(u, b, civ, armor);
    return inputs ? timedResult(inputs.hp, inputs.damage, inputs.interval, n) : unknown('当前手推炮配置的攻击、护甲或修正数据尚未核实。');
  }
  const selectedTechIds = new Set<number>();
  if (attackerTechs.length > 0) {
    if (!isRegularSiegeUnit(u.id)) return unknown('当前单位暂不支持攻方科技计算。');
    if (!techCtx || (civ && !techCtx.trees)) return unknown('缺少科技目录或科技树数据，暂不计算攻方科技。');
    const availableTechs = siegeAttackerTechs(u, civ, techCtx);
    const availIds = new Set(availableTechs.map((t) => t.id));
    for (const id of attackerTechs) {
      if (!Number.isInteger(id) || !availIds.has(id)) return unknown('当前攻方配置缺少该攻方科技的可核实效果。');
      selectedTechIds.add(id);
    }
    const techById = buildTechById(techCtx.techs);
    for (const id of selectedTechIds) {
      const tech = techById[id];
      if (!tech) return unknown('当前攻方配置缺少该攻方科技的可核实效果。');
      if (prereqChain(tech, techById).some((pre) => availIds.has(pre.id) && !selectedTechIds.has(pre.id))) {
        return unknown('所选攻方科技缺少必需的前置科技。');
      }
    }
  }
  const attacker = baseStats(u);
  const defender = buildingBase(b);
  // 按所选单位的时代计入无科技前置的文明属性效果；不加入手工回退或盟友效果。
  for (const entry of DAT.civs[civ]?.bonus ?? []) {
    if (entry.age > u.age || entry.req.length) continue;
    for (const rule of entry.rules) {
      if (!rule.b && rule.t.includes(u.id)) applyEffects(attacker, toEffects(rule.fx));
    }
  }
  if (selectedTechIds.size > 0) {
    // 严格按 effects.json（DAT.techs）键序叠加，与 simulator.ts（TECH_EFFECTS）完全同序，不受入参数组顺序影响。
    for (const entry of Object.values(DAT.techs)) {
      if (!entry.combat || !selectedTechIds.has(entry.id)) continue;
      for (const rule of entry.rules) {
        if (!rule.b && rule.t.includes(u.id)) applyEffects(attacker, toEffects(rule.fx));
      }
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
  const main = mainAttackType(u);
  for (const [category, amount] of u.atks) {
    if (category === '近战' || category === '穿刺') attacks[category] = category === main ? attacker.atk : amount;
  }
  // 旧 ram/331/南亚攻城象简表路径保持既有模型；手推炮使用上方独立的完整类别证据。
  const irrelevant = new Set(['攻城武器', '重型攻城武器', '船只', '僧侣', MOUNTED_REDUCTION_CLASS, '掷矛手']);
  const armors: Record<string, number> = { 近战: defender.ma, 穿刺: defender.pa, 所有建筑: defender.barm };
  const filtered = Object.fromEntries(
    Object.entries(attacks).filter(([category, amount]) => !irrelevant.has(category) && (category in armors || amount !== 0)),
  );
  const applied = damageRows(filtered, armors, { negativeAttack: false, missingArmor: 'error' });
  const bad = applied.problems[0];
  if (bad !== undefined) return unknown(bad === '石质防御' ? SIEGE_STONE_DEFENSE_REASON : `建筑缺少「${bad}」护甲的可核实数据。`);
  const damage = totalDamage(applied.rows);
  const interval = attacker.rof / attacker.rofx;
  if (!u.atks.length || !Number.isFinite(defender.hp) || defender.hp <= 0 || !Number.isFinite(interval) || interval <= 0)
    return unknown('生命值或攻击间隔数据待补。');
  return timedResult(defender.hp, damage, interval, n);
}
