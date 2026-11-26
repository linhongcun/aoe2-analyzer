import type { FormationEntityView, FormationScenarioGroup, FormationView } from './civFormations';

const OPPONENT_RE =
  /骑兵|重骑|游侠|骆驼|弓手|强弓|劲弩|掷矛|散兵|步兵|长戟|枪兵|剑士|冠军|近卫|弩炮|投石|手推炮|冲车|火枪|炮塔|攻城器|独特单位|敌方|对手|对方|反骑|反弓|反步|反攻城|压线|冲阵|切后排|突破屏障/;

function clampText(text: string, maxLen: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
}

export function deriveTabHint(condition: string): string {
  const trimmed = condition.trim();
  if (!trimmed) return '';
  const firstSentence = trimmed.split(/[。；！？]/)[0]?.trim() ?? trimmed;
  if (firstSentence.length <= 26) return firstSentence;
  const firstClause = firstSentence.split(/[，,]/)[0]?.trim() ?? firstSentence;
  if (firstClause.length >= 8 && firstClause.length <= 26) return firstClause;
  return clampText(firstSentence, 26);
}

export function formatSurvivingEntitiesTitle(entities: readonly FormationEntityView[]): string {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const row of entities) {
    if (!seen.has(row.entity.zh)) {
      seen.add(row.entity.zh);
      names.push(row.entity.zh);
    }
  }
  if (names.length === 0) return '按需补充方案';
  return clampText(`按需补充：${names.join('、')}`, 24);
}

export function deriveChipLabel(text?: string, entities: readonly FormationEntityView[] = []): string {
  const trimmed = text?.trim();
  if (!trimmed) return formatSurvivingEntitiesTitle(entities);
  const firstClause = trimmed.split(/[。；！？]/)[0]?.trim() ?? trimmed;
  return clampText(firstClause, 24);
}

export function classifyScenarioGroup({ when, chipLabel, summary }: { when?: string; chipLabel?: string; summary?: string }): FormationScenarioGroup {
  for (const text of [when, chipLabel, summary]) {
    if (text?.trim()) return OPPONENT_RE.test(text) ? 'opponent' : 'condition';
  }
  return 'condition';
}

export function formationEntityDomId(anchor: string, row: FormationEntityView, scenarioId?: string | null): string {
  const prefix = scenarioId ? `${anchor}-scenario-${scenarioId}` : anchor;
  const suffix = row.rawOccurrence ? `-repeat-${row.rawOccurrence}` : '';
  return `${prefix}-${row.kind}-${row.entity.id}${suffix}`;
}

export interface FormationRestoreMemoryInput {
  routeId?: string;
  route: string;
  scenarioId?: string | null;
}

export interface FormationRestoreTarget {
  routeId: string | null;
  scenarioId: string | null;
  fallbackToSection: boolean;
}

export function resolveFormationRestoreTarget(memory: FormationRestoreMemoryInput, views: readonly FormationView[]): FormationRestoreTarget {
  const visible = views.filter((view) => view.status !== 'draft');
  const wantedRouteId = memory.routeId ?? (memory.route.startsWith('formation-') ? memory.route.slice('formation-'.length) : undefined);
  if (!wantedRouteId) return { routeId: null, scenarioId: null, fallbackToSection: true };
  const targetView = visible.find((view) => (view.status === 'unverified' ? view.id : view.route.id) === wantedRouteId);
  if (!targetView) return { routeId: null, scenarioId: null, fallbackToSection: true };
  if (memory.scenarioId && targetView.status === 'current' && targetView.scenarios.some((sc) => sc.id === memory.scenarioId)) {
    return { routeId: wantedRouteId, scenarioId: memory.scenarioId, fallbackToSection: false };
  }
  return { routeId: wantedRouteId, scenarioId: null, fallbackToSection: false };
}
