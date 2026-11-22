import { civByEn } from '../../../data';
import type { CostDiscount } from '../../../domain/costDiscount';
import { fighterFrom, type Fighter } from '../../../domain/duel';
import { applicableTrainingTechs, quoteTraining, selectTrainingIds, type TrainingAgeMarker, type TrainingQuote } from '../../../domain/duelTrainingCost';
import { simTechs, simulate, type SimContext } from '../../../domain/simulator';
import type { StatSet, Trees, Unit } from '../../../domain/types';
import type { SideSpec } from '../../../domain/duelState';
import { unitAvailable } from '../../../domain/unitAvailability';
import { substituteIn } from './substitute';

export interface Resolved {
  spec: SideSpec;
  u: Unit;
  civ: string;
  age: number;
  sel: Set<number>;
  S: StatSet;
  F: Fighter;
  avail: ReturnType<typeof simTechs>;
  /** 常驻文明训练折扣（不含需研究的费用科技），供「已计入 / 未计入」句式 */
  disc: CostDiscount;
  /** 已选且本站已支持的费用科技之后的训练价，与 Fighter.cost 同一笔 unitCost */
  training: TrainingQuote;
  earlyAgeMarker?: TrainingAgeMarker;
}
/** issue 124 选的文明造不了这个单位：保留玩家选的文明，不出属性与战斗结果，等玩家点按钮 */
export interface Unavail {
  unavail: true;
  spec: SideSpec;
  u: Unit;
  civ: string;
  age: number;
  /** 可替代单位；null = 没有替代 */
  sub: Unit | null;
}
export type SideState = Resolved | Unavail;
export const isUnavail = (s: SideState): s is Unavail => 'unavail' in s;

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function unitAvailabilityTreeSafe(trees: unknown, civ: string): trees is Trees {
  if (!isRecord(trees) || !isRecord(trees.t) || !Array.isArray(trees.t[civ])) return false;
  const blocks = trees.t[civ] as unknown[];
  return (
    blocks.length > 0 &&
    blocks.some((block) => Array.isArray(block) && Array.isArray(block[3]) && block[3].length > 0) &&
    blocks.every(
      (block) =>
        Array.isArray(block) &&
        block.length >= 4 &&
        Array.isArray(block[3]) &&
        block[3].every(
          (cell: unknown) =>
            Array.isArray(cell) &&
            cell.length >= 6 &&
            Number.isSafeInteger(cell[0]) &&
            cell[0] >= 0 &&
            cell[0] <= 7 &&
            (cell[2] === 'u' || cell[2] === 't' || cell[2] === 'b') &&
            Number.isSafeInteger(cell[3]) &&
            cell[3] >= 0 &&
            (cell[4] === 0 || cell[4] === 1) &&
            (cell[5] === null || Number.isSafeInteger(cell[5])),
        ),
    )
  );
}

export function resolve(ctx: SimContext, byId: Record<number, Unit>, spec: SideSpec, fallback: number): SideState {
  const requestedUnit = byId[spec.uid];
  let u = requestedUnit;
  if (!u || !u.civs.length) u = byId[fallback]!;
  // issue 124：URL 里是一个真实文明但它造不了这个单位时，不再静默换成 civs[0]；只有文明为空/不认识时才回落
  if (!u.civs.includes(spec.civ) && civByEn(spec.civ)) {
    const s = substituteIn(byId, u.id, spec.civ);
    return { unavail: true, spec, u, civ: spec.civ, age: Math.max(u.age, spec.age), sub: s !== null && s !== u.id ? byId[s]! : null };
  }
  const civ = u.civs.includes(spec.civ) ? spec.civ : u.civs[0]!;
  let earlyAgeMarker: TrainingAgeMarker | undefined;
  if (
    requestedUnit === u &&
    requestedUnit?.id === spec.uid &&
    !!civByEn(spec.civ) &&
    requestedUnit.civs.includes(spec.civ) &&
    spec.ageSet === true &&
    Number.isInteger(spec.age) &&
    spec.age >= 1 &&
    spec.age <= 4 &&
    spec.age < requestedUnit.age &&
    unitAvailabilityTreeSafe(ctx.trees, spec.civ)
  ) {
    try {
      if (unitAvailable({ core: { unitById: byId }, trees: ctx.trees }, spec.civ, requestedUnit.id, spec.age)) {
        earlyAgeMarker = { unitId: requestedUnit.id, civ: spec.civ, age: spec.age };
      }
    } catch {
      earlyAgeMarker = undefined;
    }
  }
  const age = earlyAgeMarker?.age ?? Math.max(u.age, spec.age);
  const avail = simTechs(ctx, u, civ);
  const ok = new Set(avail.map((x) => x.t.id));
  // issue 100：模拟、标题、取价统一用 URL 时代（未写时代按帝王）。
  // issue 943：f / c 再纳入本站已支持的适用费用科技；战斗仍只吃 simulate 能用的效果。
  const costs = applicableTrainingTechs(ctx, u, civ, age, earlyAgeMarker);
  const sel = selectTrainingIds(spec.techs, avail, age, costs, civ);
  const S = simulate(ctx, u, civ, age, sel, new Set(spec.team));
  const training = quoteTraining(u, civ, age, sel, costs, ok, earlyAgeMarker);
  return {
    spec,
    u,
    civ,
    age,
    sel,
    S,
    F: { ...fighterFrom(u, S), cost: training.price.cost },
    avail,
    disc: training.price.discount,
    training,
    ...(earlyAgeMarker ? { earlyAgeMarker } : {}),
  };
}

export const r1 = (x: number) => String(Math.round(x * 10) / 10);
