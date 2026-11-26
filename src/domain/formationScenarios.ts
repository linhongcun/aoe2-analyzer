import type {
  EntityRef,
  Formation,
  FormationAdjustmentView,
  FormationDecision,
  FormationEntityView,
  FormationEvidenceLink,
  FormationScenario,
  FormationScenarioGroup,
  FormationSupplement,
  FormationSupplementView,
  ScenarioGate,
} from './civFormations';
import { partitionableSupplementIndices } from './formationPartition.mjs';
import { classifyScenarioGroup, deriveChipLabel, formatSurvivingEntitiesTitle } from './formationScenarioHelpers';

export {
  classifyScenarioGroup,
  deriveChipLabel,
  deriveTabHint,
  formationEntityDomId,
  formatSurvivingEntitiesTitle,
  resolveFormationRestoreTarget,
  type FormationRestoreMemoryInput,
  type FormationRestoreTarget,
} from './formationScenarioHelpers';

export interface SupplementProjectionResult {
  view: FormationSupplementView | null;
  rawSlots: (FormationEntityView | null)[];
}

export interface FormationScenarioAdjustmentBlock {
  id: string;
  when: string;
  available: boolean;
  text?: string;
  decision?: FormationDecision;
  candidateBoundary?: string;
  fallback?: string;
  showStatusNotice?: boolean;
}

export interface FormationScenarioBranchBlock {
  id: string;
  title: string;
  state: 'available' | 'partial';
  context?: { label: string; text: string };
  decision?: { label: string; text: string };
  partialFallback?: string;
  evidence: string;
}

export interface FormationScenarioSupplementBlock {
  sourceIndex: number;
  mode: FormationSupplement['mode'];
  condition?: string;
  choiceHint?: boolean;
  partialNotice?: boolean;
}

export interface FormationScenarioView {
  id: string;
  state: 'available' | 'partial' | 'unavailable';
  group: FormationScenarioGroup;
  chipLabel: string;
  actionHint?: string;
  title: string;
  when: string;
  summary?: string;
  adjustments: FormationScenarioAdjustmentBlock[];
  branches: FormationScenarioBranchBlock[];
  supplementNotes: FormationScenarioSupplementBlock[];
  entities: FormationEntityView[];
  caveats: string[];
  fallbacks: string[];
  links: FormationEvidenceLink[];
  showPartialNotice: boolean;
}

const CHOICE_SEMANTIC_RE = /择一|按需选|任选|选一/;
const DEFAULT_PARTIAL_BRANCH_TITLE = '已有前置条件保留方案';
const DEFAULT_UNAVAILABLE_FALLBACK = '这项补充资料暂不可用';

type SourceStatus = 'available' | 'partial' | 'unavailable';

interface ProjectScenariosInput {
  route: Formation;
  supplementResults: ReadonlyMap<number, SupplementProjectionResult>;
  adjustments: readonly FormationAdjustmentView[];
  isEntityAvailable: (ref: EntityRef) => boolean;
}

export function projectFormationScenarios({ route, supplementResults, adjustments, isEntityAvailable }: ProjectScenariosInput): {
  scenarios: FormationScenarioView[];
  evidenceLinks: FormationEvidenceLink[];
} {
  const adjustmentById = new Map(adjustments.map((adj) => [adj.id, adj]));
  const branchById = new Map((route.conditionBranches ?? []).map((branch) => [branch.id, branch]));

  const supStatus = (index: number): SourceStatus => {
    const res = supplementResults.get(index);
    if (!res?.view) return 'unavailable';
    return res.view.partial || res.view.missingOptionalResearch ? 'partial' : 'available';
  };

  const adjStatus = (id: string): 'available' | 'unavailable' => {
    const adj = adjustmentById.get(id);
    return adj && !adj.unavailable ? 'available' : 'unavailable';
  };

  const branchStatus = (id: string): SourceStatus => {
    const branch = branchById.get(id);
    if (!branch) return 'unavailable';
    if (!branch.requires.every((ref) => isEntityAvailable(ref))) return 'unavailable';
    if ((branch.displayRequires ?? []).every((ref) => isEntityAvailable(ref))) return 'available';
    return branch.partialFallback ? 'partial' : 'unavailable';
  };

  const evaluateGate = (gate: ScenarioGate): boolean => {
    switch (gate.kind) {
      case 'supplement': {
        const status = supStatus(gate.index);
        return gate.requireFull ? status === 'available' : status === 'available' || status === 'partial';
      }
      case 'adjustment':
        return adjStatus(gate.id) === 'available';
      case 'conditionBranch':
        return branchStatus(gate.id) === 'available';
      case 'entity':
        return isEntityAvailable({ kind: gate.entityKind, id: gate.id, age: gate.age });
    }
  };

  const rawLinks = route.evidence.links ?? [];
  const linkRequiresOk = (index: number): boolean => {
    const link = rawLinks[index];
    if (!link) return false;
    return (link.requires ?? []).every((ref) => isEntityAvailable(ref));
  };

  const synthetic = route.scenarios === undefined;
  const defs: FormationScenario[] = synthetic
    ? [
        ...partitionableSupplementIndices(route).map((si): FormationScenario => {
          const rawSup = route.supplements[si]!;
          const surviving = supplementResults.get(si)?.view?.entities ?? [];
          return {
            id: `sup-${si}`,
            chipLabel: deriveChipLabel(rawSup.condition ?? rawSup.label, surviving),
            ...(rawSup.condition ? { when: rawSup.condition } : rawSup.label ? { when: rawSup.label } : {}),
            supplementIndices: [si],
          };
        }),
        ...(route.adjustments ?? []).map((adj): FormationScenario => ({
          id: `adj-${adj.id}`,
          chipLabel: deriveChipLabel(adj.when),
          when: adj.when,
          adjustmentIds: [adj.id],
        })),
        ...(route.conditionBranches ?? []).map((branch): FormationScenario => ({
          id: `branch-${branch.id}`,
          chipLabel: deriveChipLabel(branch.title),
          title: branch.title,
          when: branch.title,
          conditionBranchIds: [branch.id],
        })),
      ]
    : route.scenarios!;

  const referencedLinkIndices = new Set<number>();
  const passingLinkIndices = new Set<number>();
  const scenarios: FormationScenarioView[] = [];

  for (const scenario of defs) {
    const supIndices = scenario.supplementIndices ?? [];
    const adjIds = scenario.adjustmentIds ?? [];
    const branchIds = scenario.conditionBranchIds ?? [];

    if (!synthetic) {
      for (const linkRef of scenario.links ?? []) referencedLinkIndices.add(linkRef.index);
    }

    let avail = 0;
    let part = 0;
    let unavailSB = 0;
    let unavailA = 0;

    for (const si of supIndices) {
      const st = supStatus(si);
      if (st === 'available') avail += 1;
      else if (st === 'partial') part += 1;
      else unavailSB += 1;
    }
    for (const id of adjIds) {
      if (adjStatus(id) === 'available') avail += 1;
      else unavailA += 1;
    }
    for (const id of branchIds) {
      const st = branchStatus(id);
      if (st === 'available') avail += 1;
      else if (st === 'partial') part += 1;
      else unavailSB += 1;
    }

    const hasSafe = avail + part > 0;
    if (!hasSafe && unavailA === 0) continue;

    if (!hasSafe && unavailA > 0) {
      const fallbacks: string[] = [];
      const seenFallbacks = new Set<string>();
      for (const id of adjIds) {
        const fb = adjustmentById.get(id)?.fallback ?? DEFAULT_UNAVAILABLE_FALLBACK;
        if (!seenFallbacks.has(fb)) {
          seenFallbacks.add(fb);
          fallbacks.push(fb);
        }
      }
      scenarios.push({
        id: scenario.id,
        state: 'unavailable',
        group: scenario.group ?? classifyScenarioGroup({ when: scenario.chipLabel, chipLabel: scenario.chipLabel }),
        chipLabel: scenario.chipLabel,
        title: scenario.chipLabel,
        when: scenario.chipLabel,
        adjustments: [],
        branches: [],
        supplementNotes: [],
        entities: [],
        caveats: [],
        fallbacks,
        links: [],
        showPartialNotice: true,
      });
      continue;
    }

    const state: 'available' | 'partial' = part > 0 || unavailSB > 0 || unavailA > 0 ? 'partial' : 'available';

    const rawSeen = new Map<string, number>();
    const entities: FormationEntityView[] = [];
    for (const si of supIndices) {
      const rawSup = route.supplements[si];
      const res = supplementResults.get(si);
      if (!rawSup) continue;
      for (let ei = 0; ei < rawSup.entities.length; ei += 1) {
        const rawEnt = rawSup.entities[ei]!;
        const key = `${rawEnt.kind}-${rawEnt.id}`;
        const rawOccurrence = rawSeen.get(key) ?? 0;
        rawSeen.set(key, rawOccurrence + 1);
        const projected = res?.view ? (res.rawSlots[ei] ?? null) : null;
        if (projected) entities.push({ ...projected, rawOccurrence });
      }
    }

    let chipLabel = scenario.chipLabel;
    let title = scenario.title ?? scenario.chipLabel;
    let when: string;

    if (state === 'partial') {
      if (synthetic) {
        if (branchIds.length === 1) {
          const b = branchById.get(branchIds[0]!);
          const safe = b?.partialTitle ?? DEFAULT_PARTIAL_BRANCH_TITLE;
          chipLabel = safe;
          title = safe;
          when = safe;
        } else if (supIndices.length === 1) {
          const rawSup = route.supplements[supIndices[0]!]!;
          if (rawSup.mode !== 'choice') {
            const safe = formatSurvivingEntitiesTitle(entities);
            chipLabel = safe;
            title = safe;
            when = safe;
          } else {
            const safe = deriveChipLabel(rawSup.condition ?? rawSup.label, entities);
            chipLabel = safe;
            title = safe;
            when = rawSup.condition ?? safe;
          }
        } else {
          title = scenario.chipLabel;
          when = scenario.chipLabel;
        }
      } else {
        title = scenario.chipLabel;
        when = scenario.chipLabel;
      }
    } else {
      const firstAvailAdj = adjIds.map((id) => adjustmentById.get(id)).find((a) => a && !a.unavailable);
      const firstAvailBranch = branchIds.map((id) => branchById.get(id)).find((b) => b && branchStatus(b.id) === 'available');
      when = scenario.when ?? firstAvailAdj?.when ?? firstAvailBranch?.title ?? chipLabel;
    }

    const actionHint =
      state === 'available' && scenario.actionHint && (!scenario.actionHintGate || evaluateGate(scenario.actionHintGate)) ? scenario.actionHint : undefined;

    const hasSurvivingSupWithCondition = supIndices.some((si) => {
      const st = supStatus(si);
      return (st === 'available' || st === 'partial') && Boolean(route.supplements[si]?.condition);
    });
    const summary =
      state === 'available' &&
      scenario.summary &&
      (!scenario.summaryGate || evaluateGate(scenario.summaryGate)) &&
      (adjIds.length + branchIds.length > 0 || !hasSurvivingSupWithCondition)
        ? scenario.summary
        : undefined;

    const standaloneFallbacks: string[] = [];
    const adjustmentBlocks: FormationScenarioAdjustmentBlock[] = [];
    for (const id of adjIds) {
      const adj = adjustmentById.get(id);
      if (adj && !adj.unavailable) {
        const inlineFallback = adjIds.length >= 2 ? adj.fallback : undefined;
        if (adjIds.length === 1 && adj.fallback) standaloneFallbacks.push(adj.fallback);
        adjustmentBlocks.push({
          id: adj.id,
          when: adj.when,
          available: true,
          ...(adj.text ? { text: adj.text } : {}),
          ...(adj.decision ? { decision: adj.decision } : {}),
          ...(adj.candidateBoundary ? { candidateBoundary: adj.candidateBoundary } : {}),
          ...(inlineFallback ? { fallback: inlineFallback } : {}),
        });
      } else {
        adjustmentBlocks.push({
          id,
          when: adj?.when ?? chipLabel,
          available: false,
          fallback: adj?.fallback ?? DEFAULT_UNAVAILABLE_FALLBACK,
          showStatusNotice: true,
        });
      }
    }

    const branchBlocks: FormationScenarioBranchBlock[] = [];
    for (const id of branchIds) {
      const st = branchStatus(id);
      if (st === 'unavailable') continue;
      const b = branchById.get(id)!;
      if (st === 'available') {
        branchBlocks.push({
          id: b.id,
          title: b.title,
          state: 'available',
          context: b.context,
          decision: b.decision,
          evidence: b.evidence,
        });
      } else {
        branchBlocks.push({
          id: b.id,
          title: b.partialTitle ?? DEFAULT_PARTIAL_BRANCH_TITLE,
          state: 'partial',
          partialFallback: b.partialFallback!,
          evidence: b.evidence,
        });
      }
    }

    const omitMap = new Map((scenario.omitSupplementConditions ?? []).map((item) => [item.supplementIndex, item.coveredBy]));
    const supplementNotes: FormationScenarioSupplementBlock[] = [];
    for (const si of supIndices) {
      const st = supStatus(si);
      if (st === 'unavailable') continue;
      const rawSup = route.supplements[si]!;
      if (st === 'partial' && rawSup.mode !== 'choice') {
        supplementNotes.push({ sourceIndex: si, mode: rawSup.mode, partialNotice: true });
        continue;
      }
      const coveredBy = !synthetic ? omitMap.get(si) : undefined;
      const omitted =
        coveredBy !== undefined &&
        (coveredBy.kind === 'adjustment'
          ? adjIds.includes(coveredBy.id) && adjStatus(coveredBy.id) === 'available'
          : branchIds.includes(coveredBy.id) && branchStatus(coveredBy.id) === 'available');
      if (omitted) continue;
      const choiceHint = rawSup.mode === 'choice' && (!rawSup.condition || !CHOICE_SEMANTIC_RE.test(rawSup.condition));
      if (rawSup.condition || choiceHint) {
        supplementNotes.push({
          sourceIndex: si,
          mode: rawSup.mode,
          ...(rawSup.condition ? { condition: rawSup.condition } : {}),
          ...(choiceHint ? { choiceHint: true } : {}),
        });
      }
    }

    const caveats = (scenario.caveats ?? []).filter((item) => !item.whenAvailable || evaluateGate(item.whenAvailable)).map((item) => item.text);

    const links: FormationEvidenceLink[] = [];
    if (!synthetic) {
      for (const linkRef of scenario.links ?? []) {
        const rawLink = rawLinks[linkRef.index];
        if (!rawLink || !linkRequiresOk(linkRef.index)) continue;
        if (linkRef.whenAvailable && !evaluateGate(linkRef.whenAvailable)) continue;
        passingLinkIndices.add(linkRef.index);
        links.push(rawLink);
      }
    }

    const blockAlreadyNoticed =
      adjustmentBlocks.some((block) => block.showStatusNotice) ||
      branchBlocks.some((block) => block.state === 'partial') ||
      supplementNotes.some((note) => note.partialNotice);

    scenarios.push({
      id: scenario.id,
      state,
      group: scenario.group ?? classifyScenarioGroup({ when, chipLabel, summary }),
      chipLabel,
      ...(actionHint ? { actionHint } : {}),
      title,
      when,
      ...(summary ? { summary } : {}),
      adjustments: adjustmentBlocks,
      branches: branchBlocks,
      supplementNotes,
      entities,
      caveats,
      fallbacks: standaloneFallbacks,
      links,
      showPartialNotice: state === 'partial' && !blockAlreadyNoticed,
    });
  }

  const evidenceLinks: FormationEvidenceLink[] = [];
  for (let index = 0; index < rawLinks.length; index += 1) {
    const rawLink = rawLinks[index]!;
    if (!linkRequiresOk(index)) continue;
    if (!synthetic && referencedLinkIndices.has(index) && !passingLinkIndices.has(index)) continue;
    evidenceLinks.push(rawLink);
  }

  return { scenarios, evidenceLinks };
}
