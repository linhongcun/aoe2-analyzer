/**
 * Issue 1429: Pure build-time library for deriving the lightweight civ bonus research-discount
 * usage index from the real evaluateArmyCost() engine across all 56 civs and ages 1-4.
 *
 * Side-effect-free module: importing this file never reads CLI args or writes files.
 * CLI entrypoint lives in scripts/army_cost_usage_build.ts.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARMY_RESEARCH, type ArmyResearchData, type ResearchCommand } from '../src/data/armyResearch';
import { civs } from '../src/data/index';
import { armyResearchChoices, emptyArmyCost, evaluateArmyCost, researchKey, type ArmyCostConfig, type ArmyCostResult } from '../src/domain/armyCost';
import { ARMY_RES, isGlobalResearchCostMod } from '../src/domain/armyResearchRules';
import { civBonuses, type CivBonusEnt } from '../src/domain/civBonus';
import { DAT, type DatEco } from '../src/domain/datEffects';
import { productionUnits, PRODUCTION_UNLOCK_TECH_IDS, type ProductionContext } from '../src/domain/production';
import type { Cost } from '../src/domain/types';

export type EcoOnlyUnitId = 83 | 128 | 17;
export interface ArmyCostUsageEntry {
  tids: number[];
  allFree: boolean;
  ecoOnlyUnits: EcoOnlyUnitId[];
}
export interface ArmyCostUsageFile {
  meta: { generatedBy: 'scripts/army_cost_usage_build.ts'; patch: string; commit: string; sha256: string };
  bonuses: Record<string, ArmyCostUsageEntry>;
}
export interface BuildArmyCostUsageOverrides {
  bonusesByCiv?: Readonly<Record<string, readonly CivBonusEnt[]>>;
  teamEcoByCiv?: Readonly<Record<string, readonly DatEco[]>>;
  civList?: readonly string[];
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_ARMY_COST_USAGE_DEST = resolve(ROOT, 'data/game/army_cost_usage.json');
const ECO_ONLY_UNIT_ORDER: readonly EcoOnlyUnitId[] = [83, 128, 17];
const ECO_ONLY_UNIT_SET = new Set<number>(ECO_ONLY_UNIT_ORDER);
const WHAT_TO_B: Readonly<Record<string, number>> = { 食物: 0, 木材: 1, 石料: 2, 黄金: 3, 全部资源: -1 };
const EPS = 1e-9;
const CMD_V_EPS = 1e-5;

function techCostOp(c: number): 'set' | 'mul' | 'add' | 'unknown' {
  if (c === 0) return 'set';
  if (c === 2) return 'mul';
  if (c === 1 || c === -1) return 'add';
  return 'unknown';
}

function res85Op(cmd: ResearchCommand): 'set' | 'mul' | 'add' {
  if (cmd.Type === 6) return 'mul';
  return cmd.B === 0 ? 'set' : 'add';
}

function opMatchesTechCost(op: string, c: number): boolean {
  return techCostOp(c) === op;
}

function opMatchesRes85(op: string, cmd: ResearchCommand): boolean {
  return res85Op(cmd) === op;
}

function isResearchCostMod(cmd: ResearchCommand): boolean {
  return cmd.Type === 101 || isGlobalResearchCostMod(cmd);
}

/** True when at least one resource in `actual` is strictly lower than in `ref`. */
function anyResourceLower(actual: Cost, ref: Cost): boolean {
  return ARMY_RES.some((r) => (actual[r] ?? 0) < (ref[r] ?? 0) - EPS);
}

interface CivCommandAttribution {
  civIndicesByBonus: Map<string, Set<number>>;
  posIndicesByBonus: Map<string, Map<number, Set<number>>>;
}

function mapCivCostCommands(civEn: string, bonuses: readonly CivBonusEnt[], data: ArmyResearchData, teamEco: readonly DatEco[]): CivCommandAttribution {
  const civData = data.civs[civEn];
  if (!civData) throw new Error(`${civEn}: army_research.json 缺少该文明数据`);

  const civMods = civData.mods;
  if (civMods.some(isGlobalResearchCostMod)) {
    throw new Error(`${civEn}: civ.mods 中出现未归属的全局研究费用倍率命令（res:85）`);
  }

  // 1. Collect all expected Type=101 civ.mods commands from non-team tech<0 bonuses and team eco.
  const type101Entries = civMods.map((cmd, idx) => ({ cmd, idx })).filter(({ cmd }) => cmd.Type === 101);
  interface ExpectedCivCmd {
    owner: string;
    isTeam: boolean;
    tid: number;
    b: number;
    op: string;
    v: number;
  }
  const expected: ExpectedCivCmd[] = [];

  const recordExpected = (owner: string, isTeam: boolean, e: DatEco) => {
    if (e.tid === undefined || e.what === '研究时间') return;
    const b = WHAT_TO_B[e.what ?? ''];
    if (b === undefined) {
      throw new Error(`${civEn} ${owner}: 无法识别的研究费用资源字段 what=${String(e.what)} (tid=${e.tid})`);
    }
    expected.push({ owner, isTeam, tid: e.tid, b, op: e.op, v: e.v });
  };

  for (const bon of bonuses) {
    if (bon.team) continue;
    for (const d of bon.dat) {
      if (d.tech >= 0) continue;
      for (const e of d.eco) recordExpected(bon.id, false, e);
    }
  }
  for (const e of teamEco) recordExpected(`${civEn}-team`, true, e);

  const matchesCivCmd = (exp: ExpectedCivCmd, cmd: ResearchCommand): boolean =>
    cmd.A === exp.tid && cmd.B === exp.b && opMatchesTechCost(exp.op, cmd.C) && Math.abs(cmd.D - exp.v) <= CMD_V_EPS;

  // Cross-owner ambiguity check using the exact same tolerance predicate as matching.
  for (let i = 0; i < expected.length; i++) {
    for (let j = i + 1; j < expected.length; j++) {
      const a = expected[i]!;
      const b = expected[j]!;
      if (a.owner !== b.owner && a.tid === b.tid && a.b === b.b && a.op === b.op && Math.abs(a.v - b.v) <= CMD_V_EPS) {
        throw new Error(
          `${civEn}: 负科技号研究费用预期命令（tid=${a.tid}, B=${a.b}, op=${a.op}）在容差内同时属于多个来源（${[a.owner, b.owner].sort().join(', ')}），来源无法唯一确定`,
        );
      }
    }
  }

  for (const { cmd, idx } of type101Entries) {
    const owners = new Set(expected.filter((exp) => matchesCivCmd(exp, cmd)).map((exp) => exp.owner));
    if (owners.size > 1) {
      throw new Error(
        `${civEn}: 常驻 Type=101 命令 #${idx}（tid=${cmd.A}, B=${cmd.B}, C=${cmd.C}, D=${cmd.D}）在容差内同时匹配多个来源（${[...owners].sort().join(', ')}），来源无法唯一确定`,
      );
    }
  }

  // Sort expected and actual candidates by canonical op (unifying add C=1/-1) then numeric value ascending
  // so 1D interval bipartite matching within [v - CMD_V_EPS, v + CMD_V_EPS] is provably optimal.
  const sortedExpected = [...expected].sort((a, b) => a.tid - b.tid || a.b - b.b || a.op.localeCompare(b.op) || a.v - b.v);
  const sortedActual = [...type101Entries].sort(
    (a, b) => a.cmd.A - b.cmd.A || a.cmd.B - b.cmd.B || techCostOp(a.cmd.C).localeCompare(techCostOp(b.cmd.C)) || a.cmd.D - b.cmd.D || a.idx - b.idx,
  );

  const usedCivIdx = new Set<number>();
  const civIndicesByBonus = new Map<string, Set<number>>();
  for (const exp of sortedExpected) {
    const match = sortedActual.find(({ cmd, idx }) => !usedCivIdx.has(idx) && matchesCivCmd(exp, cmd));
    if (!match) {
      throw new Error(`${civEn} ${exp.owner}: 缺少匹配的 Type=101 常驻命令（tid=${exp.tid}, B=${exp.b}, op=${exp.op}, v=${exp.v}）`);
    }
    usedCivIdx.add(match.idx);
    if (!exp.isTeam) {
      const set = civIndicesByBonus.get(exp.owner) ?? new Set<number>();
      set.add(match.idx);
      civIndicesByBonus.set(exp.owner, set);
    }
  }

  const leftover = type101Entries.filter(({ idx }) => !usedCivIdx.has(idx));
  if (leftover.length) {
    throw new Error(`${civEn}: 存在 ${leftover.length} 条未归属的 Type=101 常驻研究费用命令`);
  }

  // 2. Map positive tech>0 node cost commands 1-to-1 to non-team bonuses.
  const posNodeOwner = new Map<number, string>();
  const posIndicesByBonus = new Map<string, Map<number, Set<number>>>();

  for (const bon of bonuses) {
    if (bon.team) continue;
    for (const d of bon.dat) {
      if (d.tech <= 0) continue;
      const node = data.nodes[String(d.tech)];
      const actualCostMods = (node?.mods ?? []).map((cmd, idx) => ({ cmd, idx })).filter(({ cmd }) => isResearchCostMod(cmd));
      const expectedCostEco = d.eco.filter((e) => (e.tid !== undefined && e.what !== '研究时间') || e.res === 85);

      if (!actualCostMods.length && !expectedCostEco.length) continue;

      const prevOwner = posNodeOwner.get(d.tech);
      if (prevOwner && prevOwner !== bon.id) {
        throw new Error(`${civEn}: 正科技节点 t:${d.tech} 同时归属于 ${prevOwner} 与 ${bon.id}，来源无法唯一确定`);
      }
      posNodeOwner.set(d.tech, bon.id);

      if (expectedCostEco.length !== actualCostMods.length) {
        throw new Error(
          `${bon.id} t:${d.tech}: 预期费用命令数量（${expectedCostEco.length}）与 army_research 节点费用命令数量（${actualCostMods.length}）不一致`,
        );
      }

      const expSortKey = (e: DatEco) => {
        if (e.res === 85) return `r85:${e.op}`;
        const b = WHAT_TO_B[e.what ?? ''];
        if (b === undefined) {
          throw new Error(`${bon.id} t:${d.tech}: 无法识别的研究费用资源字段 what=${String(e.what)} (tid=${e.tid})`);
        }
        return `t101:${e.tid}:${b}:${e.op}`;
      };
      const cmdSortKey = (cmd: ResearchCommand) => (isGlobalResearchCostMod(cmd) ? `r85:${res85Op(cmd)}` : `t101:${cmd.A}:${cmd.B}:${techCostOp(cmd.C)}`);

      const sortedPosExpected = [...expectedCostEco].sort((a, b) => expSortKey(a).localeCompare(expSortKey(b)) || a.v - b.v);
      const sortedPosActual = [...actualCostMods].sort((a, b) => cmdSortKey(a.cmd).localeCompare(cmdSortKey(b.cmd)) || a.cmd.D - b.cmd.D || a.idx - b.idx);
      const usedPosIdx = new Set<number>();
      for (const e of sortedPosExpected) {
        const hit = sortedPosActual.find(({ cmd, idx }) => {
          if (usedPosIdx.has(idx)) return false;
          if (e.res === 85) {
            return isGlobalResearchCostMod(cmd) && opMatchesRes85(e.op, cmd) && Math.abs(cmd.D - e.v) <= CMD_V_EPS;
          }
          const b = WHAT_TO_B[e.what ?? '']!;
          return cmd.Type === 101 && cmd.A === e.tid && cmd.B === b && opMatchesTechCost(e.op, cmd.C) && Math.abs(cmd.D - e.v) <= CMD_V_EPS;
        });
        if (!hit) {
          throw new Error(`${bon.id} t:${d.tech}: 节点费用命令无法与 effects.json 精确配对（${JSON.stringify(e)}）`);
        }
        usedPosIdx.add(hit.idx);
      }

      const byNode = posIndicesByBonus.get(bon.id) ?? new Map<number, Set<number>>();
      byNode.set(d.tech, usedPosIdx);
      posIndicesByBonus.set(bon.id, byNode);
    }
  }

  return { civIndicesByBonus, posIndicesByBonus };
}

function ablateBonusCommands(
  civEn: string,
  data: ArmyResearchData,
  civDrop: ReadonlySet<number> | undefined,
  posDrop: ReadonlyMap<number, ReadonlySet<number>> | undefined,
): ArmyResearchData {
  const nextCivs = civDrop?.size
    ? {
        ...data.civs,
        [civEn]: {
          ...data.civs[civEn]!,
          mods: data.civs[civEn]!.mods.filter((_, idx) => !civDrop.has(idx)),
        },
      }
    : data.civs;

  let nextNodes = data.nodes;
  if (posDrop?.size) {
    nextNodes = { ...data.nodes };
    for (const [nodeId, dropSet] of posDrop) {
      const key = String(nodeId);
      const node = data.nodes[key]!;
      nextNodes[key] = {
        ...node,
        mods: node.mods.filter((_, idx) => !dropSet.has(idx)),
      };
    }
  }

  return { ...data, civs: nextCivs, nodes: nextNodes };
}

interface PassiveEvalConfig {
  label: string;
  cfg: ArmyCostConfig;
  res: ArmyCostResult;
}

interface AgePassiveEval {
  age: number;
  rows: readonly { unit: number; qty: string }[];
  configs: readonly PassiveEvalConfig[];
}

function evaluateAgePassiveConfigs(ctx: ProductionContext, civEn: string, age: number, data: ArmyResearchData): AgePassiveEval {
  const units = productionUnits(ctx, { civ: civEn, age, techs: [...PRODUCTION_UNLOCK_TECH_IDS], rows: [], walk: 0, farm: 0 });
  const rows = units.map((u) => ({ unit: u.id, qty: '1' }));
  const shapeCfg: ArmyCostConfig = { ...emptyArmyCost(civEn, String(age)), rows };
  const shapeRes = evaluateArmyCost(ctx, shapeCfg, data);

  const choices = armyResearchChoices(ctx, shapeCfg, false, data);
  const fullCfg: ArmyCostConfig = { ...shapeCfg, targets: choices.map(researchKey) };
  const fullRes = evaluateArmyCost(ctx, fullCfg, data);

  const configs: PassiveEvalConfig[] = [
    { label: 'shape', cfg: shapeCfg, res: shapeRes },
    { label: 'full', cfg: fullCfg, res: fullRes },
  ];

  // Fallback to single-target passive evaluation when a combined target batch causes
  // relative-order price invalidation (e.g. Bohemians t:785 masking monastery techs).
  for (const tid of choices) {
    const entry = fullRes.ledger.find((e) => e.id === tid);
    if (entry?.status === 'invalid' && entry.problem === 'price') {
      const singleCfg: ArmyCostConfig = { ...shapeCfg, targets: [researchKey(tid)] };
      configs.push({ label: `single:${tid}`, cfg: singleCfg, res: evaluateArmyCost(ctx, singleCfg, data) });
    }
  }

  return { age, rows, configs };
}

export function buildArmyCostUsage(
  ctx: ProductionContext,
  data: ArmyResearchData = ARMY_RESEARCH,
  overrides: BuildArmyCostUsageOverrides = {},
): ArmyCostUsageFile {
  const targetCivs = overrides.civList ? [...overrides.civList] : civs.map((c) => c.en);
  const sortedCivs = [...targetCivs].sort((a, b) => a.localeCompare(b));
  const resultBonuses: Record<string, ArmyCostUsageEntry> = {};

  for (const civEn of sortedCivs) {
    const civObj = civs.find((c) => c.en === civEn);
    const bonuses = overrides.bonusesByCiv?.[civEn] ?? (civObj ? civBonuses(civObj) : []);
    const teamEco = overrides.teamEcoByCiv?.[civEn] ?? DAT.civs[civEn]?.team.eco ?? [];

    const { civIndicesByBonus, posIndicesByBonus } = mapCivCostCommands(civEn, bonuses, data, teamEco);
    const ageEvals = [1, 2, 3, 4].map((age) => evaluateAgePassiveConfigs(ctx, civEn, age, data));

    const slotKey = (age: number, label: string, tid: number) => `${age}|${label}|${tid}`;
    const discountedOf = (res: ArmyCostResult) =>
      res.ledger.filter(
        (e) => e.id !== null && e.status !== 'invalid' && e.quote?.cost && e.quote.baseCost && anyResourceLower(e.quote.cost, e.quote.baseCost),
      );
    const civPassiveDiscountedKeys = new Set<string>();
    for (const { age, configs } of ageEvals) {
      for (const { label, res } of configs) {
        for (const entry of discountedOf(res)) civPassiveDiscountedKeys.add(slotKey(age, label, entry.id!));
      }
    }

    const attributedKeys = new Set<string>();
    for (const bon of bonuses.filter((b) => !b.team)) {
      const civDrop = civIndicesByBonus.get(bon.id);
      const posDrop = posIndicesByBonus.get(bon.id);
      if (!civDrop?.size && !posDrop?.size) continue;

      const ablatedData = ablateBonusCommands(civEn, data, civDrop, posDrop);
      const hitTids = new Set<number>();
      let allFree = true;
      const beneficiaries = new Set<number>();

      for (const { age, rows, configs } of ageEvals) {
        for (const { label, cfg, res: baseRes } of configs) {
          const discountedEntries = discountedOf(baseRes);
          if (!discountedEntries.length) continue;
          const abById = new Map(
            evaluateArmyCost(ctx, cfg, ablatedData)
              .ledger.filter((e) => e.id !== null)
              .map((e) => [e.id!, e]),
          );
          for (const baseEntry of discountedEntries) {
            const abEntry = abById.get(baseEntry.id!);
            if (!abEntry || abEntry.status === 'invalid' || !abEntry.quote?.cost) {
              throw new Error(`${bon.id}: 反事实摘除后研究 t:${baseEntry.id} 变为无效（${abEntry?.reason ?? '缺失'}）`);
            }
            if (!anyResourceLower(baseEntry.quote!.cost!, abEntry.quote.cost)) continue;
            hitTids.add(baseEntry.id!);
            attributedKeys.add(slotKey(age, label, baseEntry.id!));
            if (!baseEntry.quote!.zero) allFree = false;
            for (const bi of baseEntry.beneficiaries) {
              const uid = rows[bi]?.unit;
              if (uid !== undefined) beneficiaries.add(uid);
            }
          }
        }
      }

      if (hitTids.size > 0) {
        const ecoOnly = beneficiaries.size > 0 && [...beneficiaries].every((id) => ECO_ONLY_UNIT_SET.has(id));
        resultBonuses[bon.id] = {
          tids: [...hitTids].sort((a, b) => a - b),
          allFree,
          ecoOnlyUnits: ecoOnly ? ECO_ONLY_UNIT_ORDER.filter((id) => beneficiaries.has(id)) : [],
        };
      }
    }

    const unattributed = [...civPassiveDiscountedKeys].filter((key) => !attributedKeys.has(key)).sort();
    if (unattributed.length) {
      throw new Error(`${civEn}: 被动报价场景（done: []）存在未归属的折价研究条目：[${unattributed.join(', ')}]`);
    }

    if (civPassiveDiscountedKeys.size > 0) {
      const allCivDrop = new Set<number>();
      for (const s of civIndicesByBonus.values()) for (const idx of s) allCivDrop.add(idx);
      const allPosDrop = new Map<number, Set<number>>();
      for (const byNode of posIndicesByBonus.values()) {
        for (const [nodeId, idxs] of byNode) {
          const target = allPosDrop.get(nodeId) ?? new Set<number>();
          for (const idx of idxs) target.add(idx);
          allPosDrop.set(nodeId, target);
        }
      }
      const jointAblated = ablateBonusCommands(civEn, data, allCivDrop, allPosDrop);
      const residual: string[] = [];
      for (const { age, configs } of ageEvals) {
        for (const { label, cfg, res: baseRes } of configs) {
          const discountedEntries = discountedOf(baseRes);
          if (!discountedEntries.length) continue;
          const abById = new Map(
            evaluateArmyCost(ctx, cfg, jointAblated)
              .ledger.filter((e) => e.id !== null)
              .map((e) => [e.id!, e]),
          );
          for (const baseEntry of discountedEntries) {
            const abEntry = abById.get(baseEntry.id!);
            if (!abEntry || abEntry.status === 'invalid' || !abEntry.quote?.cost) {
              throw new Error(`${civEn}: 联合摘除全部非团队加成后研究 t:${baseEntry.id} 变为无效（${abEntry?.reason ?? '缺失'}）`);
            }
            if (anyResourceLower(abEntry.quote.cost, baseEntry.quote!.baseCost!)) {
              residual.push(slotKey(age, label, baseEntry.id!));
            }
          }
        }
      }
      if (residual.length) {
        throw new Error(`${civEn}: 联合摘除全部非团队加成后仍存在未归属的残余折价：[${residual.sort().join(', ')}]`);
      }
    }
  }

  const sortedBonuses = Object.fromEntries(Object.entries(resultBonuses).sort(([a], [b]) => a.localeCompare(b)));
  return {
    meta: {
      generatedBy: 'scripts/army_cost_usage_build.ts',
      patch: data.meta.patch,
      commit: data.meta.commit,
      sha256: data.meta.sha256,
    },
    bonuses: sortedBonuses,
  };
}

export function formatArmyCostUsageJson(file: ArmyCostUsageFile): string {
  return JSON.stringify(file) + '\n';
}
