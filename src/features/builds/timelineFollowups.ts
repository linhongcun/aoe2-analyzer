import type { Step } from '../../domain/buildOrder';
import type { BuildTimeline, TimelineStep, VillagerEvent } from '../../domain/buildSim';

/** 只合并实际连续的训练；房屋、研究及异常均打断折叠组。 */
export function villagerGroups(tl: BuildTimeline): VillagerEvent[][] {
  const cuts = [
    ...tl.housePaidAt,
    ...tl.steps.filter((s) => s.action === 'research' || s.action === 'ageup').map((s) => s.researchAt ?? s.startAt),
    ...tl.anomalies.filter((a) => ['idle_tc', 'pop_block', 'resource_short'].includes(a.type)).flatMap((a) => [a.from, a.to]),
  ];
  const groups: VillagerEvent[][] = [];
  for (const event of tl.villagerEvents ?? []) {
    const last = groups.at(-1),
      prev = last?.at(-1);
    if (prev && event.from - prev.to <= 0.11 && !cuts.some((t) => t > prev.from && t <= event.from)) last!.push(event);
    else groups.push([event]);
  }
  return groups;
}

export function followupHint(step: TimelineStep, noHouses: boolean): string | null {
  return !noHouses && step.pop.cap < 200 && step.pop.cap - step.pop.used <= 2 ? '接下来记得补房子，人口空位已不多；自动造房仍需要足够木头。' : null;
}

export function stepEntities(step: Step) {
  const refs: { kind: 'unit' | 'tech' | 'building'; id: number }[] = [];
  for (const action of step.actions) {
    if (action.type === 'build') refs.push({ kind: 'building', id: action.building });
    else if (action.type === 'research') refs.push({ kind: 'tech', id: action.tech });
    else if (action.type === 'train' || action.type === 'upgrade') refs.push({ kind: 'unit', id: action.unit });
    else if (action.type === 'ageUp') refs.push({ kind: 'tech', id: 99 + action.age });
    else if (action.type === 'gather') refs.push({ kind: 'unit', id: 83 });
  }
  return refs.filter((r, i) => refs.findIndex((x) => x.kind === r.kind && x.id === r.id) === i);
}
