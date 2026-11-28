/**
 * Issue 1496: Pure build-time library for deriving the lightweight simulator research-price
 * index from the real researchPrice() engine over all 56 civs, catalog techs, and ages 1-4.
 *
 * Side-effect-free module: importing this file never reads CLI args or writes files.
 * CLI entrypoint lives in scripts/sim_research_prices_build.ts.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ArmyResearchData } from '../src/data/armyResearch';
import { civs } from '../src/data/index';
import type { Core } from '../src/data/core';
import { isGlobalResearchCostMod, isUnreachableCountNode, researchPrice } from '../src/domain/armyResearchRules';
import { ARMY_RES } from '../src/domain/researchCostMath';
import type { Cost } from '../src/domain/types';

export type SimResearchAgeKey = '1' | '2' | '3' | '4';

export interface SimResearchPriceEntry {
  cost: Cost | null;
  free?: true;
  zero?: true;
  reason?: string;
}

export type SimResearchTechRecord =
  { kind: 'all'; entry: SimResearchPriceEntry } | { kind: 'byAge'; ages: Partial<Record<SimResearchAgeKey, SimResearchPriceEntry>> };

export interface SimOrderModifierEntry {
  civ: string | null;
  targets: number[];
  global?: true;
}

export interface SimResearchPricesFile {
  meta: {
    generatedBy: 'scripts/sim_research_prices_build.ts';
    patch: string;
    commit: string;
    sha256: string;
  };
  civs: Record<string, Record<string, SimResearchTechRecord>>;
  orderModifiers: Record<string, SimOrderModifierEntry>;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_SIM_RESEARCH_PRICES_DEST = resolve(ROOT, 'data/game/sim_research_prices.json');
const AGES: readonly SimResearchAgeKey[] = ['1', '2', '3', '4'];
const EPS = 1e-9;

function compactDiffCost(quoted: Cost, base: Cost): Cost {
  const out: Cost = {};
  for (const r of ARMY_RES) {
    const v = quoted[r] ?? 0;
    if (v > 0 || (v === 0 && (base[r] ?? 0) > 0)) out[r] = v;
  }
  return out;
}

function sameCost(a: Cost, b: Cost): boolean {
  return ARMY_RES.every((r) => Math.abs((a[r] ?? 0) - (b[r] ?? 0)) <= EPS);
}

/** True when passive rules strictly raise at least one resource with no resource lowered (e.g. variable villager surcharge). */
export function isPureVariableIncrease(quoted: Cost, base: Cost): boolean {
  const anyHigher = ARMY_RES.some((r) => (quoted[r] ?? 0) > (base[r] ?? 0) + EPS);
  const anyLower = ARMY_RES.some((r) => (quoted[r] ?? 0) < (base[r] ?? 0) - EPS);
  return anyHigher && !anyLower;
}

function sameEntry(a: SimResearchPriceEntry | undefined, b: SimResearchPriceEntry | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function buildSimResearchPrices(
  core: Pick<Core, 'techs' | 'techById'>,
  data: ArmyResearchData,
  opts: { civList?: readonly string[] } = {},
): SimResearchPricesFile {
  const playableCivs = new Set(civs.map((c) => c.en));
  const selectedCivs = opts.civList ? [...new Set(opts.civList)].sort() : [...playableCivs].sort();
  for (const civEn of selectedCivs) {
    if (!playableCivs.has(civEn)) throw new Error(`未知文明：${civEn}`);
    if (!data.civs[civEn]) throw new Error(`army_research.json 缺少文明数据：${civEn}`);
  }
  const selectedCivSet = new Set(selectedCivs);
  const sortedTechs = [...core.techs].sort((a, b) => a.id - b.id);
  const outCivs: Record<string, Record<string, SimResearchTechRecord>> = {};

  for (const civEn of selectedCivs) {
    const civEntries: Record<string, SimResearchTechRecord> = {};
    for (const tech of sortedTechs) {
      if (!tech.civs.includes(civEn)) continue;
      const byAge: Partial<Record<SimResearchAgeKey, SimResearchPriceEntry>> = {};
      for (const ageKey of AGES) {
        const age = Number(ageKey);
        const q = researchPrice(data, civEn, age, tech.id, new Set([tech.id]), new Set());
        if (q.baseCost && !sameCost(q.baseCost, tech.cost)) {
          throw new Error(
            `${civEn} t:${tech.id}（${tech.zh}）目录基础价 ${JSON.stringify(tech.cost)} 与 army_research.json 基础价 ${JSON.stringify(q.baseCost)} 不一致`,
          );
        }
        if (!q.cost) {
          byAge[ageKey] = { cost: null, reason: q.reason || '影响本项研究费用的规则尚未核实' };
          continue;
        }
        if (isPureVariableIncrease(q.cost, tech.cost)) continue;
        if (q.free) {
          byAge[ageKey] = { cost: {}, free: true };
          continue;
        }
        if (q.zero) {
          byAge[ageKey] = { cost: {}, zero: true };
          continue;
        }
        if (!sameCost(q.cost, tech.cost)) {
          byAge[ageKey] = { cost: compactDiffCost(q.cost, tech.cost) };
        }
      }
      const presentKeys = AGES.filter((k) => byAge[k] !== undefined);
      if (!presentKeys.length) continue;
      if (presentKeys.length === AGES.length && AGES.every((k) => sameEntry(byAge[k], byAge['1']))) {
        civEntries[String(tech.id)] = { kind: 'all', entry: byAge['1']! };
      } else {
        civEntries[String(tech.id)] = { kind: 'byAge', ages: byAge };
      }
    }
    if (Object.keys(civEntries).length) outCivs[civEn] = civEntries;
  }

  const civEnById = new Map<number, string>();
  for (const [civEn, info] of Object.entries(data.civs)) {
    if (playableCivs.has(civEn)) civEnById.set(info.id, civEn);
  }

  const orderModifiers: Record<string, SimOrderModifierEntry> = {};
  const sortedNodeIds = Object.keys(data.nodes)
    .map(Number)
    .filter((id) => Number.isInteger(id))
    .sort((a, b) => a - b);
  for (const tid of sortedNodeIds) {
    const node = data.nodes[String(tid)]!;
    if (node.location <= 0 || isUnreachableCountNode(data, tid, node)) continue;
    const targets = new Set<number>();
    let globalMod = false;
    for (const cmd of node.mods) {
      if (cmd.Type === 101 && cmd.A !== tid && core.techById[cmd.A]) targets.add(cmd.A);
      if (isGlobalResearchCostMod(cmd)) globalMod = true;
    }
    if (!targets.size && !globalMod) continue;
    let civ: string | null = null;
    if (node.civ >= 0) {
      const mapped = civEnById.get(node.civ);
      if (!mapped) continue;
      if (!selectedCivSet.has(mapped)) continue;
      civ = mapped;
    }
    orderModifiers[String(tid)] = {
      civ,
      targets: [...targets].sort((a, b) => a - b),
      ...(globalMod ? { global: true } : {}),
    };
  }

  return {
    meta: {
      generatedBy: 'scripts/sim_research_prices_build.ts',
      patch: data.meta.patch,
      commit: data.meta.commit,
      sha256: data.meta.sha256,
    },
    civs: outCivs,
    orderModifiers,
  };
}

export function formatSimResearchPricesJson(payload: SimResearchPricesFile): string {
  return JSON.stringify(payload) + '\n';
}
