/** Fixed DE188329 source admission; corpse decay and finite animal food remain outside the model. */
import type { EcoData, EffectRow } from './buildSim';

export interface JurchenRawTech {
  tech: number;
  civ: number;
  effectId: number;
  requiredCount: number;
  requires: number[];
  researchLocation: number;
  researchAt: number[][];
  researchTime: number;
  cost: number[][];
  commands: { Type: number; A: number; B: number; C: number; D: number }[];
}
export const JURCHEN_SOURCE_REASON = '女真加成缺少完整已核来源，未计入';
export const JURCHEN_DECAY_NOTE = '按资源不耗尽估算，尸体腐烂与耗尽未模拟，不腐烂收益未计入';
export const JURCHEN_KNIGHT_NOTE = '女真没有骑士；骑士方案仅供通用模板经济估算。';
export const JURCHEN_RESEARCH_NOTE = '当前8套开局不研究该加成涉及的攻城和防御科技，未产生费用或研究时间收益。';
// Ordered source identities from complete995 commands, not new gameplay multipliers.
const COST_TARGETS = [377, 50, 51, 54, 63, 64, 140, 194, 608, 239, 980, 321, 379, 322];
const TIME_TARGETS = [377, 50, 51, 54, 63, 64, 140, 194, 608, 239, 980, 321, 379, 380, 96, 255, 322];
const empty = (value: unknown): boolean => Array.isArray(value) && value.length === 0;
const header = (row: EffectRow, tech: number): boolean => {
  const raw = row.jurchenTech;
  return (
    !!raw &&
    Array.isArray(raw.commands) &&
    Array.isArray(row.effects) &&
    row.source === 'bonus' &&
    row.age === 1 &&
    row.tech === tech &&
    empty(row.requires) &&
    raw.tech === tech &&
    raw.civ === 52 &&
    raw.effectId === tech &&
    raw.requiredCount === 0 &&
    empty(raw.requires) &&
    raw.researchLocation === -1 &&
    empty(raw.researchAt) &&
    raw.researchTime === 0 &&
    empty(raw.cost)
  );
};
const noDecay = (row: EffectRow): boolean => {
  if (!header(row, 993) || row.jurchenTech!.commands.length !== 1 || row.effects.length !== 1) return false;
  const c = row.jurchenTech!.commands[0]!,
    e = row.effects[0]!;
  return (
    !!c &&
    !!e &&
    c.Type === 1 &&
    c.A === 292 &&
    c.B === 0 &&
    c.C === -1 &&
    c.D === 1 &&
    e.kind === 'res' &&
    e.res === 292 &&
    e.op === 'set' &&
    e.v === 1 &&
    e.target === undefined &&
    e.attr === undefined &&
    e.tech === undefined
  );
};
const research = (row: EffectRow): boolean => {
  if (!header(row, 995) || row.jurchenTech!.commands.length !== 31 || row.effects.length !== 31) return false;
  return row.jurchenTech!.commands.every((command, i) => {
    const cost = i < COST_TARGETS.length,
      target = cost ? COST_TARGETS[i] : TIME_TARGETS[i - COST_TARGETS.length];
    const effect = row.effects[i]!;
    // Values validate the pinned source shape only; existing generic effects read their values from eco.
    return (
      !!command &&
      !!effect &&
      command.Type === (cost ? 101 : 103) &&
      command.A === target &&
      command.B === (cost ? 1 : -1) &&
      command.C === 2 &&
      command.D === (cost ? 0.25 : 0.5) &&
      effect.kind === (cost ? 'techCost' : 'techTime') &&
      effect.tech === target &&
      effect.op === 'mul' &&
      effect.v === command.D &&
      (cost ? String(effect.res) === 'Wood' : effect.res === undefined) &&
      effect.target === undefined &&
      effect.attr === undefined
    );
  });
};
export const hasJurchenMarker = (row: EffectRow): boolean => 'jurchenTech' in row || row.tech === 993 || row.tech === 995;
export function jurchenContext(eco: EcoData) {
  const rows = eco.civEco.Jurchens ?? [];
  const decayRows = rows.filter((row) => row.tech === 993),
    researchRows = rows.filter((row) => row.tech === 995);
  const decay = decayRows.length === 1 && noDecay(decayRows[0]!);
  const upgrades = researchRows.length === 1 && research(researchRows[0]!);
  const knownMarkers = rows.every((row) => !('jurchenTech' in row) || row.tech === 993 || row.tech === 995);
  const complete = decay && upgrades && knownMarkers;
  return { decay, upgrades, complete, decayRow: decayRows[0], researchRow: researchRows[0], reasons: complete ? [] : [JURCHEN_SOURCE_REASON] };
}
export function jurchenRowClass(
  row: EffectRow,
  civ?: string,
  context?: ReturnType<typeof jurchenContext>,
): { kind: 'unhandled' | 'irrelevant'; reason: string } | null {
  if (!hasJurchenMarker(row)) return null;
  if (
    civ !== 'Jurchens' ||
    !context ||
    (row.tech === 993 ? !context.decay || row !== context.decayRow : row.tech === 995 ? !context.upgrades || row !== context.researchRow : true)
  )
    return { kind: 'unhandled', reason: JURCHEN_SOURCE_REASON };
  // Complete995 continues through the existing target-aware generic technology classifier.
  return row.tech === 993 ? { kind: 'irrelevant', reason: JURCHEN_DECAY_NOTE } : null;
}
export function jurchenNotes(eco: EcoData, boId?: string): string[] {
  return jurchenContext(eco).complete ? [JURCHEN_DECAY_NOTE, ...(boId === 'fast-castle-knights' ? [JURCHEN_KNIGHT_NOTE] : [])] : [];
}
