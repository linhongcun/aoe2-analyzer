import { AGE_BY_TECH } from './gameIds';
import { researchResolver, type ResearchEntry } from './armyCost';
import type { ArmyCostConfig } from './armyCostConfig';
import type { ArmyResearchData } from '../data/armyResearch';

export const ARMY_RESEARCH_STATES = {
  done: '你标记已完成',
  'inferred-done': '已满足前置（系统推导）',
  free: '免费自动完成',
  planned: '本次新增',
  invalid: '未核实，未计入',
};

/** Exposes every raw prerequisite, including unused alternatives, without turning them into selections. */
export function armyResearchConditions(data: ArmyResearchData, config: ArmyCostConfig, entries: ResearchEntry[], id: number | null) {
  const completed = new Set(entries.filter((e) => e.id !== null && ['done', 'inferred-done'].includes(e.status)).map((e) => e.id!));
  const resolver = researchResolver(data, config.civ, Number(config.age), completed);
  const context = data.civs[config.civ];
  const result: { id: number; parent: number; name: string; state: string; count: number; requires: number[] }[] = [];
  const seen = new Set<number>();
  const visit = (parent: number) => {
    if (seen.has(parent)) return;
    seen.add(parent);
    for (const tid of data.nodes[parent]?.requires ?? []) {
      const n = data.nodes[tid];
      const entry = entries.find((e) => e.id === tid);
      const closure = resolver.resolve(tid);
      const building = Object.entries(data.buildingTriggers)
        .filter(([, tech]) => tech === tid)
        .map(([b]) => b);
      const state = !n
        ? '身份未知，未计作已满足'
        : !context || !resolver.available(tid)
          ? '不适用于本文明，不计作已满足分支'
          : AGE_BY_TECH[tid]
            ? AGE_BY_TECH[tid]! <= Number(config.age)
              ? '已到达时代条件'
              : '尚未到达时代条件'
            : building.length
              ? `按已具备必要建筑的外部假设满足；建筑 ${building.join('、')}`
              : entry
                ? ARMY_RESEARCH_STATES[entry.status] + (entry.reason ? `：${entry.reason}` : '')
                : closure.error
                  ? closure.error
                  : n.location > 0
                    ? '未加入当前必要集合的替代研究'
                    : [...closure.ids].every((p) => completed.has(p))
                      ? '文明自动条件已满足'
                      : '在所列必要研究完成后自动满足';
      result.push({
        id: tid,
        parent,
        name: n?.name ?? (n?.enables.length ? '单位启用条件' : '条件节点'),
        state,
        count: n?.count ?? 0,
        requires: n?.requires ?? [],
      });
      visit(tid);
    }
  };
  if (id !== null) visit(id);
  return result;
}
