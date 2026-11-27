/**
 * Issue #1525: 训练解锁科技与条件训练地点单一真源（trainingUnlocks）的固定 .dat 一致性与跨引擎守卫。
 *
 * 对照 data/game/army_research.json（可研究科技传递 enables + upgrades）、
 * data/game/garrison_general.json（trainingLocations）与全部 56 文明 trees.json，
 * 核验真源无漏写、无多写、无过期门控（如历史上曾残留的 755 弗拉芒革命），并校验内存突变立即失败。
 */
import { describe, expect, it } from 'vitest';
import armyResearchRaw from '../../data/game/army_research.json';
import garrisonGeneralRaw from '../../data/game/garrison_general.json';
import { civs, loadTrees } from '../../src/data';
import { CORE } from '../../src/data/core';
import { AGE_TECH_IDS } from '../../src/domain/gameIds';
import { getGarrisonCandidates } from '../../src/domain/garrisonGeneral';
import { availableHealingTechs, DEFAULT_HEALING_CONFIG, GARRISON_HEALING_DATA } from '../../src/domain/garrisonHealing';
import { DEFAULT_PRODUCTION, freeProductionTechs, PRODUCTION_UNLOCK_TECH_IDS, productionBuildings } from '../../src/domain/production';
import {
  CONDITIONAL_TRAINING_FAMILIES,
  isHealingUnlockTechForBuilding,
  requiredTrainingUnlockTech,
  TRAINING_UNLOCK_GATES,
  TRAINING_UNLOCK_TECH_ID_SET,
  TRAINING_UNLOCK_TECH_IDS,
  type ConditionalTrainingFamily,
  type TrainingUnlockGate,
} from '../../src/domain/trainingUnlocks';
import { trainingAtBuilding } from '../../src/domain/unitTrainingSites';

interface ArmyResearchNode {
  requires?: number[];
  enables?: number[];
  upgrades?: [number, number][];
}

interface ArmyResearchDataset {
  nodes: Record<string, ArmyResearchNode>;
}

interface GarrisonGeneralDataset {
  techs: Record<string, { trainingLocations?: { unit: number; location: number; slot: number }[] }>;
}

const armyResearch = armyResearchRaw as unknown as ArmyResearchDataset;
const garrisonGeneral = garrisonGeneralRaw as unknown as GarrisonGeneralDataset;
const trees = await loadTrees();
const ctx = { core: CORE, trees };
const ageTechSet = new Set<number>(AGE_TECH_IDS);

/**
 * Issue #1525 严守等价重构原则，不顺手修改未验收的既有页面行为。
 * 固定 .dat（army_research.json node 787）表明波希米亚「榴弹炮（1709）」由手推炮（36，需化学 47）升级而来，
 * 既有代码遗漏该门控已另立 Issue #1539 跟进；此处显式登记并做双向校验：
 * 一旦 #1539 补齐 1709（或 .dat 不再升级出 1709），须同步清空此项，防待修复记录过期。
 */
const KNOWN_PENDING_UPGRADE_GAPS: Readonly<Record<number, readonly number[]>> = {
  47: [1709],
};

/**
 * 从固定 .dat 派生数据（army_research.json + garrison_general.json + trees.json）独立推导期望的训练解锁规则，
 * 并校验传入的 gates 与 families 是否无多写、无漏写、无错配。
 */
function auditTrainingUnlocks(gates: readonly TrainingUnlockGate[], families: readonly ConditionalTrainingFamily[]): string[] {
  const errors: string[] = [];
  const nodes = new Map<number, ArmyResearchNode>();
  for (const [idStr, node] of Object.entries(armyResearch.nodes)) {
    nodes.set(Number(idStr), node);
  }

  // 1. 收集所有升级边 [from -> to]（如 420 -> 691、41 -> 555、755 -> 757）
  const upgradeEdges = new Map<number, number[]>();
  for (const node of nodes.values()) {
    for (const [from, to] of node.upgrades ?? []) {
      if (!CORE.unitById[to]) continue;
      const list = upgradeEdges.get(from) ?? [];
      list.push(to);
      upgradeEdges.set(from, list);
    }
  }
  const expandUpgrades = (baseIds: Iterable<number>): number[] => {
    const out = new Set<number>(baseIds);
    const queue = [...out];
    for (let i = 0; i < queue.length; i++) {
      for (const next of upgradeEdges.get(queue[i]!) ?? []) {
        if (!out.has(next)) {
          out.add(next);
          queue.push(next);
        }
      }
    }
    return [...out].sort((a, b) => a - b);
  };

  // 2. 从 army_research.json 传递推导：所有由非时代可研究科技解锁的目录单位
  const researchableAncestors = (nid: number, seen = new Set<number>()): Set<number> => {
    if (seen.has(nid)) return new Set();
    seen.add(nid);
    const out = new Set<number>();
    if (CORE.techById[nid] && !ageTechSet.has(nid)) out.add(nid);
    for (const req of nodes.get(nid)?.requires ?? []) {
      for (const anc of researchableAncestors(req, seen)) out.add(anc);
    }
    return out;
  };

  const datUnitEnablesByTech = new Map<number, Set<number>>();
  for (const [nid, node] of nodes) {
    const enabledUnits = (node.enables ?? []).filter((uid) => !!CORE.unitById[uid]);
    if (!enabledUnits.length) continue;
    for (const techId of researchableAncestors(nid)) {
      const set = datUnitEnablesByTech.get(techId) ?? new Set<number>();
      for (const uid of enabledUnits) set.add(uid);
      datUnitEnablesByTech.set(techId, set);
    }
  }

  // 3. 从 garrison_general.json 提取所有具条件训练地点的科技，并与全 56 国文明树 / 建筑目录核对次要节点 ID
  const datRelocByTech = new Map<number, { civ: string; building: number; pairs: [number, number][] }>();
  for (const [tidStr, entry] of Object.entries(garrisonGeneral.techs)) {
    const locs = entry.trainingLocations ?? [];
    if (!locs.length) continue;
    const techId = Number(tidStr);
    const tech = CORE.techById[techId];
    if (!tech || tech.civs.length !== 1) {
      errors.push(`relocation tech ${techId} missing single owner civ in techs.json`);
      continue;
    }
    const ownerCiv = tech.civs[0]!;
    const buildingIds = [...new Set(locs.map((l) => l.location))];
    if (buildingIds.length !== 1) {
      errors.push(`relocation tech ${techId} has unexpected multi-building locations: ${buildingIds.join(',')}`);
      continue;
    }
    const building = buildingIds[0]!;
    const buildingUnitSet = new Set(CORE.buildingById[building]?.units ?? []);
    const treeBlock = trees.t[ownerCiv]?.find((b) => b[0] === building);
    const treeUnitSet = new Set((treeBlock?.[3] ?? []).filter((c) => c[2] === 'u' && c[4] === 1).map((c) => c[3]));
    const pairs: [number, number][] = [];
    for (const loc of locs) {
      const primary = CORE.unitById[loc.unit];
      if (!primary) {
        errors.push(`relocation tech ${techId} references unknown unit ${loc.unit}`);
        continue;
      }
      const alt = CORE.units.find(
        (u) => u.id !== primary.id && u.en === primary.en && u.civs.includes(ownerCiv) && buildingUnitSet.has(u.id) && treeUnitSet.has(u.id),
      );
      if (!alt) {
        errors.push(`relocation tech ${techId} cannot locate alternate unit for primary ${primary.id} at building ${building}`);
        continue;
      }
      pairs.push([primary.id, alt.id]);
    }
    pairs.sort((a, b) => a[0] - b[0]);
    datRelocByTech.set(techId, { civ: ownerCiv, building, pairs });
  }

  // 4. 校验 CONDITIONAL_TRAINING_FAMILIES 与 .dat trainingLocations 双向一致
  const familyByTech = new Map<number, ConditionalTrainingFamily>();
  for (const fam of families) {
    if (familyByTech.has(fam.tech)) errors.push(`duplicate conditional family tech ${fam.tech}`);
    familyByTech.set(fam.tech, fam);
    const expected = datRelocByTech.get(fam.tech);
    if (!expected) {
      errors.push(`unexpected conditional family tech ${fam.tech} not in garrison_general.trainingLocations`);
      continue;
    }
    if (fam.civ !== expected.civ || fam.building !== expected.building) {
      errors.push(`conditional family tech ${fam.tech} mismatch civ/building`);
    }
    const actualPairs = [...fam.pairs].map(([p, a]) => `${p}:${a}`).sort();
    const expectedPairs = expected.pairs.map(([p, a]) => `${p}:${a}`).sort();
    if (actualPairs.join(',') !== expectedPairs.join(',')) {
      errors.push(`conditional family tech ${fam.tech} pairs mismatch: got [${actualPairs.join(',')}], expected [${expectedPairs.join(',')}]`);
    }
  }
  for (const expectedTech of datRelocByTech.keys()) {
    if (!familyByTech.has(expectedTech)) {
      errors.push(`missing conditional family for .dat relocation tech ${expectedTech}`);
    }
  }

  // 5. 校验 TRAINING_UNLOCK_GATES 与 .dat 推导集合双向一致（无过期门控、无漏项、单位集严格一致）
  const expectedGateMap = new Map<number, { unitIds: number[]; buildingId?: number }>();
  for (const [techId, reloc] of datRelocByTech) {
    expectedGateMap.set(techId, {
      unitIds: reloc.pairs.map(([, alt]) => alt).sort((a, b) => a - b),
      buildingId: reloc.building,
    });
  }
  for (const [techId, directUnits] of datUnitEnablesByTech) {
    if (datRelocByTech.has(techId)) continue;
    const expanded = expandUpgrades(directUnits);
    const pending = KNOWN_PENDING_UPGRADE_GAPS[techId] ?? [];
    for (const pid of pending) {
      if (!expanded.includes(pid)) {
        errors.push(`stale KNOWN_PENDING_UPGRADE_GAPS entry: tech ${techId} unit ${pid} no longer derived from .dat`);
      }
    }
    const pendingSet = new Set<number>(pending);
    expectedGateMap.set(techId, { unitIds: expanded.filter((uid) => !pendingSet.has(uid)) });
  }

  const seenGateTechs = new Set<number>();
  const seenUnitBuildingKeys = new Set<string>();
  for (const gate of gates) {
    if (seenGateTechs.has(gate.techId)) errors.push(`duplicate gate tech ${gate.techId}`);
    seenGateTechs.add(gate.techId);
    const expected = expectedGateMap.get(gate.techId);
    if (!expected) {
      errors.push(`stale or unverified unlock gate tech ${gate.techId} not backed by pinned .dat`);
      continue;
    }
    if (gate.buildingId !== expected.buildingId) {
      errors.push(`gate tech ${gate.techId} buildingId mismatch: got ${String(gate.buildingId)}, expected ${String(expected.buildingId)}`);
    }
    const actualUnits = [...gate.unitIds].sort((a, b) => a - b);
    if (actualUnits.join(',') !== expected.unitIds.join(',')) {
      errors.push(`gate tech ${gate.techId} unitIds mismatch: got [${actualUnits.join(',')}], expected [${expected.unitIds.join(',')}]`);
    }
    for (const uid of gate.unitIds) {
      const key = `${uid}@${gate.buildingId ?? '*'}`;
      if (seenUnitBuildingKeys.has(key)) errors.push(`duplicate (unit, building) gate mapping ${key}`);
      seenUnitBuildingKeys.add(key);
    }
  }
  for (const expectedTech of expectedGateMap.keys()) {
    if (!seenGateTechs.has(expectedTech)) {
      errors.push(`missing unlock gate for .dat tech ${expectedTech}`);
    }
  }

  return errors;
}

describe('#1525 trainingUnlocks single source of truth & .dat consistency', () => {
  it('matches pinned .dat army_research + garrison_general + all 56 civ trees with zero drift', () => {
    expect(civs).toHaveLength(56);
    expect(auditTrainingUnlocks(TRAINING_UNLOCK_GATES, CONDITIONAL_TRAINING_FAMILIES)).toEqual([]);
    expect(TRAINING_UNLOCK_TECH_IDS).toEqual([16, 47, 483]);
    expect(PRODUCTION_UNLOCK_TECH_IDS).toBe(TRAINING_UNLOCK_TECH_IDS);
    expect([...TRAINING_UNLOCK_TECH_ID_SET]).toEqual([16, 47, 483]);
  });

  it('catches stale gates, missing unlock techs, unit mismatches, and conditional family drift via in-memory mutations', () => {
    // 1. 注入过期门控（如 #1459 已移除的 755 弗拉芒革命）必须失败
    const withStale755: TrainingUnlockGate[] = [...TRAINING_UNLOCK_GATES, { techId: 755, unitIds: [1699], buildingId: 12, healingBuildingIds: [12] }];
    expect(auditTrainingUnlocks(withStale755, CONDITIONAL_TRAINING_FAMILIES).some((e) => e.includes('755'))).toBe(true);

    // 2. 漏掉任一真实解锁科技（16 / 47 / 483）必须失败
    for (const droppedTech of [16, 47, 483]) {
      const missingGate = TRAINING_UNLOCK_GATES.filter((g) => g.techId !== droppedTech);
      expect(auditTrainingUnlocks(missingGate, CONDITIONAL_TRAINING_FAMILIES).some((e) => e.includes(`missing unlock gate for .dat tech ${droppedTech}`))).toBe(
        true,
      );
    }

    // 3. 门控单位漏项或误增必须失败
    const droppedUnit = TRAINING_UNLOCK_GATES.map((g) => (g.techId === 47 ? { ...g, unitIds: g.unitIds.filter((u) => u !== 691) } : g));
    expect(auditTrainingUnlocks(droppedUnit, CONDITIONAL_TRAINING_FAMILIES).some((e) => e.includes('gate tech 47 unitIds mismatch'))).toBe(true);

    const extraUnit = TRAINING_UNLOCK_GATES.map((g) => (g.techId === 47 ? { ...g, unitIds: [...g.unitIds, 1699] } : g));
    expect(auditTrainingUnlocks(extraUnit, CONDITIONAL_TRAINING_FAMILIES).some((e) => e.includes('gate tech 47 unitIds mismatch'))).toBe(true);

    // 4. 条件训练家族错配或漏项必须失败
    const missingFamily = CONDITIONAL_TRAINING_FAMILIES.filter((f) => f.tech !== 483);
    expect(auditTrainingUnlocks(TRAINING_UNLOCK_GATES, missingFamily).some((e) => e.includes('missing conditional family for .dat relocation tech 483'))).toBe(
      true,
    );

    const brokenPair = CONDITIONAL_TRAINING_FAMILIES.map((f) => (f.tech === 16 ? { ...f, pairs: [[41, 759]] as const } : f));
    expect(auditTrainingUnlocks(TRAINING_UNLOCK_GATES, brokenPair).some((e) => e.includes('conditional family tech 16 pairs mismatch'))).toBe(true);
  });

  it('keeps requiredTrainingUnlockTech, unitTrainingSites, productionBuildings, and garrisonGeneral aligned across all 56 civs', () => {
    expect(requiredTrainingUnlockTech(5, 87)).toBe(47);
    expect(requiredTrainingUnlockTech(36, 49)).toBe(47);
    expect(requiredTrainingUnlockTech(420, 45)).toBe(47);
    expect(requiredTrainingUnlockTech(691, 45)).toBe(47);
    expect(requiredTrainingUnlockTech(759, 12)).toBe(16);
    expect(requiredTrainingUnlockTech(761, 12)).toBe(16);
    expect(requiredTrainingUnlockTech(759, 82)).toBeUndefined();
    expect(requiredTrainingUnlockTech(41, 82)).toBeUndefined();
    expect(requiredTrainingUnlockTech(886, 101)).toBe(483);
    expect(requiredTrainingUnlockTech(887, 101)).toBe(483);
    expect(requiredTrainingUnlockTech(886, 82)).toBeUndefined();
    expect(requiredTrainingUnlockTech(1699, 12)).toBeUndefined();

    // 全 56 文明遍历：对所有门控单位，未选解锁科技时生产与驻军留驻双双拦截，选中后恢复可用（文明可用前提下）
    for (const civ of civs) {
      for (const gate of TRAINING_UNLOCK_GATES) {
        for (const uid of gate.unitIds) {
          const u = CORE.unitById[uid]!;
          if (!u.civs.includes(civ.en)) continue;
          const bId = gate.buildingId ?? u.b;
          const b = CORE.buildingById[bId]!;
          if (!b.civs.includes(civ.en)) continue;

          if (gate.buildingId !== undefined) {
            expect(trainingAtBuilding(u, bId)?.tech).toBe(gate.techId);
          }

          const isFreeUnlock = freeProductionTechs(ctx, { civ: civ.en, age: 4 }).has(gate.techId);
          const prodWithout = productionBuildings(ctx, { ...DEFAULT_PRODUCTION, civ: civ.en, age: 4, techs: [] }, u);
          const prodWith = productionBuildings(ctx, { ...DEFAULT_PRODUCTION, civ: civ.en, age: 4, techs: [gate.techId] }, u);
          const candWithout = getGarrisonCandidates(ctx, b, { civ: civ.en, age: 4, techs: [], rows: [] }).find((c) => c.id === uid);
          const candWith = getGarrisonCandidates(ctx, b, { civ: civ.en, age: 4, techs: [gate.techId], rows: [] }).find((c) => c.id === uid);

          if (isFreeUnlock) {
            expect([civ.en, gate.techId]).toEqual(['Turks', 47]);
            expect(prodWithout).toContain(bId);
            expect(candWithout?.canCreate).toBe(true);
          } else {
            expect(prodWithout).not.toContain(bId);
            expect(candWithout?.canCreate ?? false).toBe(false);
          }
          expect(prodWith).toContain(bId);
          expect(candWith?.canCreate).toBe(true);
        }
      }
    }
  });

  it('preserves garrisonHealing Chemistry (47) host boundary (87/49 included; zero-rate 45/1189 excluded)', () => {
    expect(isHealingUnlockTechForBuilding(47, 87)).toBe(true);
    expect(isHealingUnlockTechForBuilding(47, 49)).toBe(true);
    expect(isHealingUnlockTechForBuilding(47, 45)).toBe(false);
    expect(isHealingUnlockTechForBuilding(47, 1189)).toBe(false);
    expect(isHealingUnlockTechForBuilding(16, 12)).toBe(true);
    expect(isHealingUnlockTechForBuilding(483, 101)).toBe(true);

    expect(GARRISON_HEALING_DATA.units[45]?.healRate).toBe(0);
    expect(GARRISON_HEALING_DATA.units[1189]?.healRate).toBe(0);

    // 陆地火药宿主（87 靶场、49 攻城武器厂）保留化学 47；船坞 45 与马来巨港 1189 维持既有口径不含 47
    expect(
      availableHealingTechs(ctx, { ...DEFAULT_HEALING_CONFIG, buildingId: 87, civ: 'Franks', age: 4, unitId: 5, entry: 'created' }).map((t) => t.id),
    ).toContain(47);
    expect(
      availableHealingTechs(ctx, { ...DEFAULT_HEALING_CONFIG, buildingId: 49, civ: 'Franks', age: 4, unitId: 36, entry: 'created' }).map((t) => t.id),
    ).toContain(47);
    expect(
      availableHealingTechs(ctx, { ...DEFAULT_HEALING_CONFIG, buildingId: 45, civ: 'Franks', age: 4, unitId: 420, entry: 'created' }).map((t) => t.id),
    ).not.toContain(47);
    expect(
      availableHealingTechs(ctx, { ...DEFAULT_HEALING_CONFIG, buildingId: 1189, civ: 'Malay', age: 4, unitId: 420, entry: 'created' }).map((t) => t.id),
    ).not.toContain(47);
  });
});
