/**
 * issue 1387：单位详情「各文明满科技对照」纯领域计算引擎（无 React / UI / features 依赖）。
 * 100% 复用与单位 PK（duelSide.resolve）同源的底层领域函数，不静态导入 src/data/core.ts。
 */
import { civByEn, civs } from '../data';
import { militaryTechAge, trainingUnitAge } from './availabilityAge';
import { civStatus } from './civStatus';
import { hasIgnoreArmor } from './damageCore';
import { costSum, DPS_UNAVAILABLE_REASON, NO_NORMAL_ATTACK_REASON, unitHasNormalAttack } from './duel';
import { fmtSide, type SideSpec } from './duelState';
import { applicableTrainingTechs, quoteTraining, selectTrainingIds, type TrainingAgeMarker } from './duelTrainingCost';
import { applicableUnmodeledTechIds, detectUnitUnmodeled } from './duelUnmodeled';
import { TECH_EFFECTS } from './effects';
import { formatHp } from './hpFormat';
import { AGE_ZH } from './ratings';
import { norm, pyMatch } from './search';
import { applicableSimCostTechs } from './simEffectiveCost';
import { simTechs, simulate, unitPath, type SimContext } from './simulator';
import type { Civ, Tech, Unit } from './types';

export type RankCombatKind = 'normal' | 'suicide' | 'non-attacking';
export type RankMetricCol = 'hp' | 'atk' | 'rof' | 'dps' | 'ma' | 'pa' | 'rng' | 'spd' | 'totalCost' | 'gold' | 'bt';
export type RankSortCol = RankMetricCol | 'civ';
export type SortDir = 'asc' | 'desc';

export interface RankColMeta {
  col: RankMetricCol;
  shortLabel: string;
  unitLabel?: string;
  fullLabel: string;
  championLabel: string;
  bestDir: SortDir;
}

export const RANK_METRIC_COLS: readonly RankColMeta[] = [
  { col: 'hp', shortLabel: '生命', fullLabel: '生命值', championLabel: '生命最高', bestDir: 'desc' },
  { col: 'atk', shortLabel: '攻击', fullLabel: '攻击力', championLabel: '攻击最高', bestDir: 'desc' },
  { col: 'rof', shortLabel: '间隔', unitLabel: '秒', fullLabel: '攻击间隔（秒）', championLabel: '间隔最短', bestDir: 'asc' },
  { col: 'dps', shortLabel: '裸 DPS', fullLabel: '裸 DPS（攻击 ÷ 间隔）', championLabel: '裸 DPS 最高', bestDir: 'desc' },
  { col: 'ma', shortLabel: '近甲', fullLabel: '近战护甲', championLabel: '近甲最高', bestDir: 'desc' },
  { col: 'pa', shortLabel: '远甲', fullLabel: '远程护甲', championLabel: '远甲最高', bestDir: 'desc' },
  { col: 'rng', shortLabel: '射程', fullLabel: '射程', championLabel: '射程最远', bestDir: 'desc' },
  { col: 'spd', shortLabel: '移速', fullLabel: '移动速度', championLabel: '移速最快', bestDir: 'desc' },
  { col: 'totalCost', shortLabel: '总价', fullLabel: '有效总价', championLabel: '总价最低', bestDir: 'asc' },
  { col: 'gold', shortLabel: '黄金', fullLabel: '折后黄金', championLabel: '黄金最少', bestDir: 'asc' },
  { col: 'bt', shortLabel: '训练', unitLabel: '秒', fullLabel: '训练时间（秒）', championLabel: '训练最快', bestDir: 'asc' },
] as const;

export const RANK_COL_META_BY_KEY: Readonly<Record<RankMetricCol, RankColMeta>> = Object.fromEntries(
  RANK_METRIC_COLS.map((item) => [item.col, item]),
) as Record<RankMetricCol, RankColMeta>;

export interface UnitCivRankMissingTech {
  id: number;
  zh: string;
  age: number;
}

export interface UnitCivRankRow {
  civ: string;
  civZh: string;
  earlyUnlock: boolean;
  hp: number;
  atk: number | null;
  rof: number | null;
  dps: number | null;
  ma: number;
  pa: number;
  rng: number;
  spd: number;
  totalCost: number;
  gold: number;
  bt: number;
  estimatedCost: boolean;
  missingTechs: UnitCivRankMissingTech[];
  ignoreArmorTech?: string;
  unmodeledPills: string[];
  /** 与 duelSide.resolve(..., 'f') 一致的满科技所选 ID（有序） */
  selTechIds: number[];
  /** 与 useSimState 校验集一致的模拟器所选 ID（有序，已过滤零差额费用科技） */
  simTechIds: number[];
  /** 当前时代可用且尚未含于 selTechIds 之外的所有未建模科技 ID（有序） */
  activeUnmodeledTechIds: number[];
}

export interface UnitCivRankChampion {
  col: RankMetricCol;
  label: string;
  bestDir: SortDir;
  value: number;
  formattedValue: string;
  civs: { civ: string; civZh: string }[];
}

export interface UnitCivRankResult {
  unitId: number;
  unitZh: string;
  age: number;
  minAge: number;
  standardAge: number;
  availableAges: number[];
  totalCivCount: number;
  combatKind: RankCombatKind;
  canDuel: boolean;
  defaultSortCol: RankMetricCol;
  applicableCols: readonly RankMetricCol[];
  rows: UnitCivRankRow[];
  bestValues: Partial<Record<RankMetricCol, number>>;
  champions: UnitCivRankChampion[];
  commonMechanisms: string[];
  hasEstimatedCost: boolean;
}

export interface UnitCivRankFilterResult {
  rows: UnitCivRankRow[];
  emptyMessage: string | null;
}

const EPS = 1e-6;
export const DUEL_BUDGET_DEFAULT = 3000;
export { DPS_UNAVAILABLE_REASON, NO_NORMAL_ATTACK_REASON };

/** 适用范围判定：非切换副形态、无异常攻防投影且可用文明数 >= 2。 */
export function supportsUnitCivRank(u: Pick<Unit, 'civs'> | null | undefined, alternate: boolean, invalidCombatProjection: boolean): boolean {
  return !!u && !alternate && !invalidCombatProjection && Array.isArray(u.civs) && u.civs.length >= 2;
}

const finiteOr = (v: number, fallback = 0): number => (Number.isFinite(v) ? v : fallback);

function fmtTrim(value: number, maxDecimals: number): string {
  if (!Number.isFinite(value)) return '—';
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? '0' : rounded.toFixed(maxDecimals).replace(/\.?0+$/, '');
}

/** 各指标精确格式化（hp 复用 domain/hpFormat，总价与黄金保留至多一位小数，攻/射程至多两位小数）。 */
export function formatRankMetric(col: RankMetricCol, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (col === 'hp') return formatHp(value);
  if (col === 'atk' || col === 'rng') return fmtTrim(value, 2);
  if (col === 'rof' || col === 'dps' || col === 'spd') return value.toFixed(2);
  if (col === 'ma' || col === 'pa') return String(Math.round(value));
  if (col === 'totalCost' || col === 'gold') return fmtTrim(value, 1);
  return value.toFixed(1);
}

export function unitRankCombatKind(u: Pick<Unit, 'atks' | 'rof'>): RankCombatKind {
  if (!unitHasNormalAttack(u)) return 'non-attacking';
  return Number.isFinite(u.rof) && u.rof > 0 ? 'normal' : 'suicide';
}

export function unitRankAgeBounds(u: Pick<Unit, 'id' | 'age' | 'civs'>): { minAge: number; standardAge: number; availableAges: number[] } {
  const trainAges = u.civs.map((c) => trainingUnitAge(c, u.id, u.age));
  const minAge = trainAges.length ? Math.min(...trainAges) : Math.max(1, Math.min(4, u.age));
  const standardAge = trainAges.length ? Math.max(...trainAges) : Math.max(1, Math.min(4, u.age));
  const clampedMin = Math.max(1, Math.min(4, minAge));
  const availableAges: number[] = [];
  for (let a = clampedMin; a <= 4; a++) availableAges.push(a);
  return { minAge: clampedMin, standardAge: Math.max(clampedMin, Math.min(4, standardAge)), availableAges };
}

/** 按表格展示精度量化指标（直接与 formatRankMetric 同源），确保排序、并列判定、绿标高亮与展示数字 100% 一致。 */
export function quantizeRankMetric(col: RankMetricCol, value: number): number {
  if (!Number.isFinite(value)) return 0;
  const parsed = Number(formatRankMetric(col, value));
  return Number.isFinite(parsed) && !Object.is(parsed, -0) ? parsed : 0;
}

const cmpNum = (a: number, b: number, dir: SortDir): number => (Math.abs(a - b) <= EPS ? 0 : dir === 'desc' ? b - a : a - b);

/** 稳定排序：不适用（null）沉底；主维度按展示精度比较，同值按 生命降序 -> 总价升序 -> 文明英文名升序。 */
export function sortUnitCivRankRows(rows: readonly UnitCivRankRow[], col: RankSortCol, dir: SortDir): UnitCivRankRow[] {
  return [...rows].sort((a, b) => {
    let primary: number;
    if (col === 'civ') {
      primary = dir === 'asc' ? a.civ.localeCompare(b.civ) : b.civ.localeCompare(a.civ);
    } else {
      const va = a[col];
      const vb = b[col];
      if (va === null && vb === null) primary = 0;
      else if (va === null) return 1;
      else if (vb === null) return -1;
      else primary = cmpNum(quantizeRankMetric(col, va), quantizeRankMetric(col, vb), dir);
    }
    if (primary !== 0) return primary;
    const hpDiff = cmpNum(quantizeRankMetric('hp', a.hp), quantizeRankMetric('hp', b.hp), 'desc');
    if (hpDiff !== 0) return hpDiff;
    const costDiff = cmpNum(quantizeRankMetric('totalCost', a.totalCost), quantizeRankMetric('totalCost', b.totalCost), 'asc');
    return costDiff !== 0 ? costDiff : a.civ.localeCompare(b.civ);
  });
}

function findGenericBattleTechCandidates(ctx: SimContext, u: Unit, age: number): Tech[] {
  const out: Tech[] = [];
  for (const [en, rules] of Object.entries(TECH_EFFECTS)) {
    const t = ctx.techByEn[en];
    if (!t || t.type === 'UniqueTech' || t.age > age) continue;
    if (rules.some(([pred]) => pred(u))) out.push(t);
  }
  return out;
}

/** 计算指定单位与时代下的全部可训练文明满科技对照数据。 */
export function buildUnitCivRank(ctx: SimContext, u: Unit, requestedAge = 4): UnitCivRankResult {
  const { minAge, standardAge, availableAges } = unitRankAgeBounds(u);
  const age = Math.max(minAge, Math.min(4, Math.floor(Number.isFinite(requestedAge) ? requestedAge : 4)));
  const combatKind = unitRankCombatKind(u);
  const canDuel = combatKind !== 'non-attacking';
  const defaultSortCol: RankMetricCol = combatKind === 'normal' ? 'dps' : combatKind === 'suicide' ? 'atk' : 'hp';
  const applicableCols: RankMetricCol[] = RANK_METRIC_COLS.map((m) => m.col).filter((col) => {
    if (combatKind === 'non-attacking') return col !== 'atk' && col !== 'rof' && col !== 'dps';
    if (combatKind === 'suicide') return col !== 'rof' && col !== 'dps';
    return true;
  });

  const genericBattleCandidates = findGenericBattleTechCandidates(ctx, u, age);
  const unionGenericTechs = new Map<number, Tech>();

  interface PendingRow {
    row: UnitCivRankRow;
    st: Record<string, number>;
    rawPills: string[];
  }

  const pending: PendingRow[] = [];
  const trainableCivs = u.civs.filter((c) => trainingUnitAge(c, u.id, u.age) <= age);
  const intrinsicIgnoreArmor = hasIgnoreArmor(u.combatAbility);

  for (const civ of trainableCivs) {
    const civInfo = civByEn(civ);
    const civZh = civInfo?.zh ?? civ;
    const earlyAgeMarker: TrainingAgeMarker | undefined = age < u.age ? { unitId: u.id, civ, age } : undefined;
    const avail = simTechs(ctx, u, civ);
    const ok = new Set(avail.map((x) => x.t.id));
    const costs = applicableTrainingTechs(ctx, u, civ, age, earlyAgeMarker);
    const sel = selectTrainingIds('f', avail, age, costs, civ);

    let ignoreArmorTech: string | undefined;
    const S = simulate(
      ctx,
      u,
      civ,
      age,
      sel,
      new Set(),
      (step) => {
        if (intrinsicIgnoreArmor) return;
        const beforeOn = hasIgnoreArmor(step.before.ca);
        const afterOn = hasIgnoreArmor(step.after.ca);
        if (!beforeOn && afterOn && step.techId !== undefined) {
          ignoreArmorTech = avail.find((item) => item.t.id === step.techId)?.t.zh;
        } else if (beforeOn && !afterOn) {
          ignoreArmorTech = undefined;
        }
      },
      0,
    );
    if (intrinsicIgnoreArmor || !hasIgnoreArmor(S.ca)) ignoreArmorTech = undefined;

    const training = quoteTraining(u, civ, age, sel, costs, ok, earlyAgeMarker);
    const totalCost = finiteOr(costSum(training.price.cost));
    const gold = finiteOr(training.price.cost.Gold ?? 0);
    const estimatedCost = costs.some((c) => c.partial || !c.supported) || training.price.undecoded.length > 0 || training.price.discount.unsupported.length > 0;

    // 与 useSimState.ts 严格同源：avail 中仅 ef !== null 与 applicableSimCostTechs 合法，排除零差额独特科技（如古吉拉 835）
    const simCostTechs = applicableSimCostTechs(ctx, u, civ);
    const allowedSimIds = new Set<number>([...avail.filter((x) => x.ef !== null).map((x) => x.t.id), ...simCostTechs.map((item) => item.tech.id)]);
    const selTechIds = [...sel].sort((a, b) => a - b);
    const simTechIds = selTechIds.filter((id) => allowedSimIds.has(id));

    // 显式合并当前时代可用未建模特色科技 ID
    const unmodeledSet = applicableUnmodeledTechIds(avail, u.id, u.combatAbility ?? 0);
    const activeUnmodeledTechIds = avail
      .filter((x) => unmodeledSet.has(x.t.id) && militaryTechAge(civ, x.t.id, x.t.age) <= age)
      .map((x) => x.t.id)
      .sort((a, b) => a - b);

    const techById = new Map<number, Tech>();
    for (const item of avail) techById.set(item.t.id, item.t);
    for (const item of costs) techById.set(item.tech.id, item.tech);

    const detectIds = new Set<number>([...sel, ...activeUnmodeledTechIds]);
    const selectedTechsForDetect: Tech[] = [];
    for (const id of detectIds) {
      const t = techById.get(id);
      if (t) selectedTechsForDetect.push(t);
    }
    const mechanisms = detectUnitUnmodeled({ unit: u, civ, age, selectedTechs: selectedTechsForDetect });
    const rawPills = [...new Set(mechanisms.map((m) => m.pill))];

    // 收集该文明当前时代可用的标准时代通用科技入并集
    const st = civStatus(ctx.trees, civ);
    for (const t of genericBattleCandidates) {
      if (st['t' + t.id] && militaryTechAge(civ, t.id, t.age) <= age) unionGenericTechs.set(t.id, t);
    }
    for (const item of costs) {
      if (item.tech.type !== 'UniqueTech' && item.tech.age <= age && item.supported && !item.partial) {
        if (st['t' + item.tech.id] && militaryTechAge(civ, item.tech.id, item.tech.age) <= age) {
          unionGenericTechs.set(item.tech.id, item.tech);
        }
      }
    }

    const hp = finiteOr(S.hp);
    const atk = combatKind === 'non-attacking' ? null : finiteOr(S.atk);
    const rof = combatKind === 'normal' && Number.isFinite(S.rof) && S.rof > 0 ? S.rof : null;
    const dps = combatKind === 'normal' && atk !== null && rof !== null ? atk / rof : null;

    pending.push({
      row: {
        civ,
        civZh,
        earlyUnlock: trainingUnitAge(civ, u.id, u.age) < standardAge,
        hp,
        atk,
        rof,
        dps,
        ma: finiteOr(S.ma),
        pa: finiteOr(S.pa),
        rng: finiteOr(S.rng),
        spd: finiteOr(S.spd),
        totalCost,
        gold,
        bt: finiteOr(S.bt),
        estimatedCost,
        missingTechs: [],
        ...(ignoreArmorTech ? { ignoreArmorTech } : {}),
        unmodeledPills: rawPills,
        selTechIds,
        simTechIds,
        activeUnmodeledTechIds,
      },
      st,
      rawPills,
    });
  }

  // 1. 通用缺科并集差集（按 age 升序、id 升序）
  const unionList = [...unionGenericTechs.values()].sort((a, b) => a.age - b.age || a.id - b.id);
  for (const entry of pending) {
    entry.row.missingTechs = unionList
      .filter((t) => !(entry.st['t' + t.id] && militaryTechAge(entry.row.civ, t.id, t.age) <= age))
      .map((t) => ({ id: t.id, zh: t.zh, age: t.age }));
  }

  // 2. 全部文明共有的未建模机制（>= 2 个文明时提炼至表上方，行内剔除避免重复）
  let commonMechanisms: string[] = [];
  if (pending.length >= 2) {
    const firstPills = pending[0]!.rawPills;
    commonMechanisms = firstPills.filter((pill) => pending.every((p) => p.rawPills.includes(pill)));
    if (commonMechanisms.length > 0) {
      const commonSet = new Set(commonMechanisms);
      for (const entry of pending) {
        entry.row.unmodeledPills = entry.rawPills.filter((pill) => !commonSet.has(pill));
      }
    }
  }

  const rows = sortUnitCivRankRows(
    pending.map((p) => p.row),
    defaultSortCol,
    RANK_COL_META_BY_KEY[defaultSortCol].bestDir,
  );

  // 3. 最优值与各项第一：仅当领先者少于半数（且对 n = 2 退化边界放行 1/2 唯一胜出）
  const bestValues: Partial<Record<RankMetricCol, number>> = {};
  const champions: UnitCivRankChampion[] = [];
  if (rows.length >= 2) {
    for (const meta of RANK_METRIC_COLS) {
      if (!applicableCols.includes(meta.col)) continue;
      const valid = rows.filter((r) => r[meta.col] !== null);
      if (valid.length < 2) continue;
      let best = quantizeRankMetric(meta.col, valid[0]![meta.col]!);
      for (let i = 1; i < valid.length; i++) {
        const v = quantizeRankMetric(meta.col, valid[i]![meta.col]!);
        if (meta.bestDir === 'desc' ? v > best : v < best) best = v;
      }
      const leaders = valid.filter((r) => Math.abs(quantizeRankMetric(meta.col, r[meta.col]!) - best) <= EPS);
      const qualifies = leaders.length < valid.length / 2 || (valid.length === 2 && leaders.length === 1);
      if (!qualifies) continue;
      bestValues[meta.col] = best;
      champions.push({
        col: meta.col,
        label: meta.championLabel,
        bestDir: meta.bestDir,
        value: best,
        formattedValue: formatRankMetric(meta.col, best),
        civs: leaders.map((r) => ({ civ: r.civ, civZh: r.civZh })),
      });
    }
  }

  return {
    unitId: u.id,
    unitZh: u.zh,
    age,
    minAge,
    standardAge,
    availableAges,
    totalCivCount: u.civs.length,
    combatKind,
    canDuel,
    defaultSortCol,
    applicableCols,
    rows,
    bestValues,
    champions,
    commonMechanisms,
    hasEstimatedCost: rows.some((r) => r.estimatedCost),
  };
}

export function isRankBestCell(result: Pick<UnitCivRankResult, 'bestValues'>, col: RankMetricCol, value: number | null): boolean {
  if (value === null) return false;
  const best = result.bestValues[col];
  return best !== undefined && Math.abs(quantizeRankMetric(col, value) - best) <= EPS;
}

function matchesCivQuery(c: Pick<Civ, 'zh' | 'en' | 'py' | 'pyi'>, normalizedQuery: string): boolean {
  return c.zh.toLowerCase().includes(normalizedQuery) || c.en.toLowerCase().includes(normalizedQuery) || pyMatch(c, normalizedQuery);
}

function formatCivList(list: readonly Civ[]): string {
  if (list.length <= 2) return list.map((c) => c.zh).join('、');
  return `${list[0]!.zh}、${list[1]!.zh} 等 ${list.length} 个文明`;
}

/** 文明搜索与空结果三态分类：中/英文子串匹配 + 拼音前缀（pyMatch，先经 norm 归一化）。 */
export function filterUnitCivRankRows(
  rows: readonly UnitCivRankRow[],
  rawQuery: string,
  unit: Pick<Unit, 'zh' | 'civs'>,
  age: number,
): UnitCivRankFilterResult {
  const trimmed = rawQuery.trim();
  if (!trimmed) return { rows: [...rows], emptyMessage: null };
  const q = norm(trimmed);
  if (!q) return { rows: [...rows], emptyMessage: null };

  const matched = rows.filter((r) => {
    const c = civByEn(r.civ);
    if (c) return matchesCivQuery(c, q);
    return r.civZh.toLowerCase().includes(q) || r.civ.toLowerCase().includes(q);
  });
  if (matched.length > 0) return { rows: matched, emptyMessage: null };

  const unitCivSet = new Set(unit.civs);
  const allMatched = civs.filter((c) => matchesCivQuery(c, q));
  if (allMatched.length === 0) {
    return { rows: [], emptyMessage: `没有匹配「${trimmed}」的文明。` };
  }

  const laterAgeCivs = allMatched.filter((c) => unitCivSet.has(c.en));
  const neverCivs = allMatched.filter((c) => !unitCivSet.has(c.en));
  const ageLabel = AGE_ZH[age] ?? `${age}时代`;
  const parts: string[] = [];
  if (laterAgeCivs.length > 0) parts.push(`${formatCivList(laterAgeCivs)}在${ageLabel}不能训练${unit.zh}`);
  if (neverCivs.length > 0) parts.push(`${formatCivList(neverCivs)}不能训练${unit.zh}`);
  return { rows: [], emptyMessage: `${parts.join('；')}。` };
}

/** 构造单文明模拟器链接：省略冗余 ?civ= 与旧 relics，保留对局助手来源参数 me/opp。 */
export function buildCivRankSimHref(unitId: number, row: Pick<UnitCivRankRow, 'civ' | 'simTechIds'>, age: number, preserveSearch = ''): string {
  const src = new URLSearchParams(preserveSearch.startsWith('?') ? preserveSearch.slice(1) : preserveSearch);
  const next = new URLSearchParams();
  for (const key of ['me', 'opp'] as const) {
    const val = src.get(key);
    if (val) next.set(key, val);
  }
  next.set('tab', 'sim');
  return `${unitPath(unitId, row.civ, age, row.simTechIds, [])}?${next.toString()}`;
}

function buildDuelSideSpec(unitId: number, row: Pick<UnitCivRankRow, 'civ' | 'selTechIds' | 'activeUnmodeledTechIds'>, age: number): SideSpec {
  const selSet = new Set(row.selTechIds);
  const needsExplicit = row.activeUnmodeledTechIds.some((id) => !selSet.has(id));
  const techs = needsExplicit ? [...new Set([...row.selTechIds, ...row.activeUnmodeledTechIds])].sort((a, b) => a - b) : age < 4 ? 'c' : 'f';
  return { uid: unitId, civ: row.civ, age, ageSet: true, techs, team: [] };
}

/** 构造同兵种跨文明单位 PK 链接：常规战斗用等资源 3000，自爆单位走 1v1（m=1）规避群战红框并保留未建模提示。 */
export function buildCivRankDuelHref(
  unitId: number,
  rowA: Pick<UnitCivRankRow, 'civ' | 'selTechIds' | 'activeUnmodeledTechIds'>,
  rowB: Pick<UnitCivRankRow, 'civ' | 'selTechIds' | 'activeUnmodeledTechIds'>,
  age: number,
  combatKind: RankCombatKind,
): string {
  const params = new URLSearchParams({
    a: fmtSide(buildDuelSideSpec(unitId, rowA, age)),
    b: fmtSide(buildDuelSideSpec(unitId, rowB, age)),
    ...(combatKind === 'suicide' ? { m: '1' } : { m: 'r', bud: String(DUEL_BUDGET_DEFAULT) }),
  });
  return `/duel?${params.toString()}`;
}
