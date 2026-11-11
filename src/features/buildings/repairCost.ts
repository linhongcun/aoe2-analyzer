/**
 * issue 744：修复费用。
 * 资源 270 / 271 的名称来自 UGC（核对 2026-11-07）。UGC 只说明它们是按造价计算的比例，没有给出基准数字。
 * 格鲁吉亚团队加成只读 eco.json civEco.Georgians 的 team 行，并与 effects.json 同一条 res 271 mul 对上。
 * 城镇中心、城门复合体倍率和固定每分钟修复量没有单独导出；对不上的 270/271 效果也不解释成这些数字。
 */
import { ECO } from '../../data/eco';
import { DAT, type DatFile } from '../../domain/datEffects';
import { TOWN_CENTER_ID } from '../../domain/gameIds';
export { TOWN_CENTER_ID };

export const UNIT_REPAIR_RES = 270;
export const BUILDING_REPAIR_RES = 271;
export const GEORGIANS_EN = 'Georgians';
export const REPAIR_ANCHOR = 'repair-cost';
export const REPAIR_COST_HREF = `/building/${TOWN_CENTER_ID}#${REPAIR_ANCHOR}`;

/** UGC Resources。只引用资源名称，不引用未列出的默认比例。 */
export const UGC_REPAIR_HREF = 'https://ugc.aoe2.rocks/general/resources/resources/';
export const UGC_REPAIR_CHECKED = '2026-11-07';
export const UGC_UNIT_REPAIR_EN = 'Unit Repair Cost';
export const UGC_BUILDING_REPAIR_EN = 'Building Repair Cost';

interface RepairEffect {
  kind?: unknown;
  op?: unknown;
  res?: unknown;
  v?: unknown;
}

interface RepairRow {
  source?: unknown;
  effects?: unknown;
}

/** UI 视图切片：防御式解析 eco.json，只声明本页读取的字段；不是 EcoData 的整表副本。 */
export interface RepairEco {
  meta?: { patch?: unknown };
  civEco?: Record<string, unknown>;
}

export interface RepairMul {
  res: number;
  op: 'mul';
  v: number;
  text: string;
}

export interface RepairCostFacts {
  patch: string | null;
  /** eco 与 effects 里出现了未能收成「仅这一条团队相乘」的 270/271。 */
  otherRepairEffects: boolean;
  georgians: RepairMul | null;
}

const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export function formatRepairFactor(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function effectsOf(value: unknown): RepairEffect[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RepairEffect => item !== null && typeof item === 'object');
}

function isRepairRes(effect: RepairEffect): boolean {
  return effect.res === UNIT_REPAIR_RES || effect.res === BUILDING_REPAIR_RES;
}

function walk(node: unknown, hits: RepairEffect[]) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, hits);
    return;
  }
  const record = node as RepairEffect & Record<string, unknown>;
  if (isRepairRes(record)) hits.push(record);
  for (const value of Object.values(record)) walk(value, hits);
}

function sameMul(effect: RepairEffect, mul: RepairMul): boolean {
  return effect.res === mul.res && effect.op === mul.op && effect.v === mul.v;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function patchOf(file: DatFile, eco: RepairEco): string | null {
  const ecoPatch = text(eco.meta?.patch);
  const effectPatch = text(file.meta?.sources?.find((source) => source.id === 'DAT')?.patch);
  if (ecoPatch && effectPatch && ecoPatch !== effectPatch) return null;
  return ecoPatch ?? effectPatch;
}

function rowsOf(eco: RepairEco): RepairRow[] | null {
  const rows = eco.civEco?.[GEORGIANS_EN];
  if (!Array.isArray(rows)) return null;
  if (!rows.every((row) => row !== null && typeof row === 'object')) return null;
  return rows as RepairRow[];
}

/** 恰好一条 team 上的资源 271 相乘，且 effects.json 的团队经济效果是同一个乘数。 */
function georgianMul(file: DatFile, eco: RepairEco): RepairMul | null {
  const rows = rowsOf(eco);
  if (!rows) return null;
  const hits = rows
    .filter((row) => row.source === 'team')
    .flatMap((row) => effectsOf(row.effects))
    .filter((effect) => effect.res === BUILDING_REPAIR_RES);
  const effect = hits[0];
  if (hits.length !== 1 || !effect || effect.kind !== 'res' || effect.op !== 'mul') return null;
  const value = finite(effect.v);
  if (value == null) return null;
  const fromFile = file.civs[GEORGIANS_EN]?.team.eco.filter((row) => row.res === BUILDING_REPAIR_RES) ?? [];
  const match = fromFile[0];
  if (fromFile.length !== 1 || !match || match.op !== 'mul' || match.v !== value) return null;
  return { res: BUILDING_REPAIR_RES, op: 'mul', v: value, text: `×${formatRepairFactor(value)}` };
}

export function repairCostFacts(file: DatFile = DAT, eco: RepairEco = ECO): RepairCostFacts {
  const ecoHits: RepairEffect[] = [];
  const effectHits: RepairEffect[] = [];
  walk(eco, ecoHits);
  walk(file, effectHits);
  const georgians = georgianMul(file, eco);
  const known = georgians != null && ecoHits.length === 1 && effectHits.length === 1 && sameMul(ecoHits[0]!, georgians) && sameMul(effectHits[0]!, georgians);
  return {
    patch: patchOf(file, eco),
    otherRepairEffects: ecoHits.length + effectHits.length > 0 && !known,
    georgians,
  };
}
