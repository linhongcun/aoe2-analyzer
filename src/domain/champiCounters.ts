/** Issue 657: finite current-age contact comparisons, without a global ranking. */
import type { Core } from '../data';
import type { SimStats, Trees, Unit } from './types';
import { makeSimContext, presetUpTo, simTechs, simulate, type SimContext } from './simulator';
import { duel, fighterFrom, type DuelResult } from './duel';
import { fmtSide, type SideSpec } from './duelState';
import { unitAvailable } from './unitAvailability';

export interface ChampiContext {
  core: Core;
  trees: Trees;
}
export interface ChampiSide {
  unit: Unit;
  civ: string;
  age: number;
  stats: SimStats;
  techIds: number[];
  spec: SideSpec;
}
export type ChampiCandidate =
  | {
      state: 'ok';
      unitId: number;
      civ: string;
      a: ChampiSide;
      b: ChampiSide;
      result: DuelResult;
      candidateOutcome: 'win' | 'draw' | 'loss';
      pkPath: string;
    }
  | { state: 'unavailable' | 'unverified'; unitId: number; civ: string; reason: string };
export interface ChampiAgeCard {
  age: 2 | 3 | 4;
  champiUnitId: number;
  champiCiv: string;
  candidates: ChampiCandidate[];
  main: Extract<ChampiCandidate, { state: 'ok' }> | null;
  reason?: string;
}
export type ChampiAnalysis =
  | { state: 'hidden' }
  | { state: 'unverified'; reason: string }
  | { state: 'ready'; me: string; opp: string; champiSide: 'a' | 'b'; candidateSide: 'a' | 'b'; cards: ChampiAgeCard[] };

const FORMS = [
  { id: 2550, age: 1, from: null },
  { id: 2588, age: 2, from: 2550 },
  { id: 2552, age: 3, from: 2588 },
  { id: 2554, age: 4, from: 2552 },
] as const;
const AGES = [
  { age: 2, id: 2588, candidates: [75, 448, 4] },
  { age: 3, id: 2552, candidates: [38, 77, 24] },
  { age: 4, id: 2554, candidates: [567, 5, 546] },
] as const;
const UNVERIFIED = '当前资料尚未核对，暂不生成蔷琵时代对照。';
const NO_CANDIDATE = '本卡三条候选中暂无本文明可用的已核对路线，不代表没有其他应对。';
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length > 0);
const tupleList = (v: unknown): v is [string, number][] =>
  Array.isArray(v) && v.every((x) => Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && x[0].length > 0 && Number.isFinite(x[1]));
const ageValid = (age: unknown): age is number => typeof age === 'number' && [1, 2, 3, 4].includes(age);

export const isChampiUnit = (id: number): boolean => FORMS.some((form) => form.id === id);

function validTree(ctx: ChampiContext, civ: string): boolean {
  const blocks = ctx.trees.t[civ];
  return (
    Array.isArray(blocks) &&
    blocks.every(
      (block) =>
        Array.isArray(block) &&
        block.length === 4 &&
        Number.isInteger(block[0]) &&
        Number.isInteger(block[1]) &&
        block[1] >= 0 &&
        block[1] <= 7 &&
        Number.isInteger(block[2]) &&
        block[2] > 0 &&
        Array.isArray(block[3]) &&
        block[3].every(
          (cell) =>
            Array.isArray(cell) &&
            cell.length === 6 &&
            Number.isInteger(cell[0]) &&
            cell[0] >= 0 &&
            Number.isInteger(cell[1]) &&
            cell[1] >= 0 &&
            ['u', 't', 'b'].includes(cell[2]) &&
            Number.isInteger(cell[3]) &&
            (cell[4] === 0 || cell[4] === 1) &&
            (cell[5] === null || Number.isInteger(cell[5])),
        ),
    )
  );
}

function sourceReason(ctx: ChampiContext, civs: string[], build: unknown): string | null {
  if (build !== 188329) return UNVERIFIED;
  if (
    !object(ctx?.core) ||
    !object(ctx.core.unitById) ||
    !object(ctx.core.techById) ||
    !Array.isArray(ctx.core.techs) ||
    !object(ctx?.trees) ||
    !object(ctx.trees.t)
  )
    return UNVERIFIED;
  if (civs.some((civ) => typeof civ !== 'string' || !civ || !validTree(ctx, civ))) return '双方文明或科技树关键资料缺失，暂不能计算。';
  // Every record is read by makeSimContext/simTechs; no fee gate for this contact model.
  if (
    !ctx.core.techs.every(
      (tech) =>
        object(tech) &&
        Number.isInteger(tech.id) &&
        tech.id > 0 &&
        ctx.core.techById[tech.id]?.id === tech.id &&
        ctx.core.techById[tech.id]?.en === tech.en &&
        typeof tech.en === 'string' &&
        tech.en.length > 0 &&
        typeof tech.type === 'string' &&
        Number.isInteger(tech.b) &&
        tech.b > 0 &&
        strings(tech.civs) &&
        ageValid(tech.age),
    )
  )
    return '科技身份、时代或文明资料缺失，暂不能计算。';
  if (
    FORMS.some((form) => {
      const unit = ctx.core.unitById[form.id];
      return (
        !unit ||
        unit.id !== form.id ||
        unit.age !== form.age ||
        unit.from_ !== form.from ||
        unit.b !== 12 ||
        unit.type !== 'RegionalUnit' ||
        typeof unit.en !== 'string' ||
        !unit.en.trim() ||
        typeof unit.zh !== 'string' ||
        !unit.zh.trim() ||
        !strings(unit.civs)
      );
    })
  )
    return UNVERIFIED;
  return null;
}

function validStats(stats: SimStats | Unit): boolean {
  return (
    ['hp', 'atk', 'ma', 'pa', 'rng', 'spd', 'rof', 'acc'].every((key) => {
      const value = stats[key as keyof typeof stats];
      return typeof value === 'number' && Number.isFinite(value) && value >= 0;
    }) &&
    stats.hp > 0 &&
    stats.spd > 0 &&
    stats.rof > 0 &&
    stats.acc <= 100
  );
}

type SideResult = { state: 'ok'; side: ChampiSide } | { state: 'unavailable' | 'unverified'; reason: string };
function sideFor(ctx: ChampiContext, sim: SimContext, civ: string, id: number, age: number): SideResult {
  const unit = ctx.core.unitById[id];
  if (
    !unit ||
    unit.id !== id ||
    !ageValid(unit.age) ||
    !strings(unit.civs) ||
    typeof unit.en !== 'string' ||
    !unit.en.trim() ||
    typeof unit.zh !== 'string' ||
    !unit.zh.trim() ||
    !Number.isInteger(unit.b) ||
    unit.b <= 0 ||
    !tupleList(unit.atks) ||
    !unit.atks.some(([name]) => name === '近战' || name === '穿刺') ||
    !tupleList(unit.armc) ||
    !Array.isArray(unit.cls) ||
    !unit.cls.every((n) => Number.isInteger(n) && n >= 0) ||
    !validStats(unit)
  )
    return { state: 'unverified', reason: '单位关键属性或类别资料缺失，暂不能计算。' };
  if (!unitAvailable(ctx, civ, id, age)) return { state: 'unavailable', reason: '此文明在本时代不能训练该单位。' };
  const avail = simTechs(sim, unit, civ);
  const sel = presetUpTo(avail, age);
  const stats = simulate(sim, unit, civ, age, sel, new Set());
  if (!validStats(stats) || !object(stats.bonus) || !Object.values(stats.bonus).every(Number.isFinite))
    return { state: 'unverified', reason: '当前模拟属性不可核对，暂不能计算。' };
  return {
    state: 'ok',
    side: { unit, civ, age, stats, techIds: [...sel].sort((a, b) => a - b), spec: { uid: id, civ, age, techs: 'c', team: [] } },
  };
}

function compare(
  ctx: ChampiContext,
  sim: SimContext,
  champiCiv: string,
  candidateCiv: string,
  champiId: number,
  unitId: number,
  age: number,
  candidateSide: 'a' | 'b',
): ChampiCandidate {
  const candidate = sideFor(ctx, sim, candidateCiv, unitId, age);
  if (candidate.state !== 'ok') return { ...candidate, unitId, civ: candidateCiv };
  const champi = sideFor(ctx, sim, champiCiv, champiId, age);
  if (champi.state !== 'ok') return { ...champi, unitId, civ: candidateCiv };
  const [a, b] = candidateSide === 'a' ? [candidate.side, champi.side] : [champi.side, candidate.side];
  const result = duel(fighterFrom(a.unit, a.stats), fighterFrom(b.unit, b.stats));
  if (
    ![result.duration, result.remaining].every((n) => Number.isFinite(n) && n >= 0) ||
    ![result.ab, result.ba].every(
      (way) =>
        Number.isInteger(way.hits) &&
        way.hits > 0 &&
        typeof way.time === 'number' &&
        Number.isFinite(way.time) &&
        way.time >= 0 &&
        [way.dmg, way.expDmg, way.dps].every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0),
    )
  )
    return { state: 'unverified', unitId, civ: candidateCiv, reason: '预计攻击次数或用时不可计算。' };
  return {
    state: 'ok',
    unitId,
    civ: candidateCiv,
    a,
    b,
    result,
    candidateOutcome: result.winner === 'draw' ? 'draw' : result.winner === candidateSide ? 'win' : 'loss',
    pkPath: '/duel?' + new URLSearchParams({ a: fmtSide(a.spec), b: fmtSide(b.spec), m: '1' }),
  };
}

export function analyzeChampi(ctx: ChampiContext, me: string, opp: string, build: unknown): ChampiAnalysis {
  const reason = sourceReason(ctx, [me, opp], build);
  if (reason) return { state: 'unverified', reason };
  const hasLine = (civ: string) => FORMS.some((form) => unitAvailable(ctx, civ, form.id, form.age));
  const champiSide = hasLine(opp) ? 'b' : hasLine(me) ? 'a' : null;
  if (!champiSide) return { state: 'hidden' };
  const candidateSide = champiSide === 'a' ? 'b' : 'a';
  const champiCiv = champiSide === 'a' ? me : opp;
  const candidateCiv = candidateSide === 'a' ? me : opp;
  const sim = makeSimContext(ctx.core.techs, ctx.trees);
  const cards: ChampiAgeCard[] = AGES.map(({ age, id, candidates: ids }) => {
    const candidates = ids.map((unitId) => compare(ctx, sim, champiCiv, candidateCiv, id, unitId, age, candidateSide));
    const ok = candidates.filter((row): row is Extract<ChampiCandidate, { state: 'ok' }> => row.state === 'ok');
    const main = ok.find((row) => row.candidateOutcome === 'win') ?? ok[0] ?? null;
    return { age, champiUnitId: id, champiCiv, candidates, main, ...(main ? {} : { reason: NO_CANDIDATE }) };
  });
  return { state: 'ready', me, opp, champiSide, candidateSide, cards };
}

export function champiPresets(ctx: ChampiContext, build: unknown): { key: 'feudal' | 'castle'; age: 2 | 3; result: ChampiCandidate }[] {
  const reason = sourceReason(ctx, ['Muisca', 'Franks'], build);
  const sim = reason ? null : makeSimContext(ctx.core.techs, ctx.trees);
  return (
    [
      ['feudal', 2, 2588, 4],
      ['castle', 3, 2552, 77],
    ] as const
  ).map(([key, age, champiId, unitId]) => ({
    key,
    age,
    result: sim ? compare(ctx, sim, 'Muisca', 'Franks', champiId, unitId, age, 'b') : { state: 'unverified', unitId, civ: 'Franks', reason: reason! },
  }));
}
