import { buildingAge } from './availabilityAge';
import type { FormationSource } from './civFormationsSource.mjs';
import { resolveFormationSource } from './civFormationsSource.mjs';
import { isAgeProgressionSupplement } from './formationPartition.mjs';
import { projectFormationScenarios, type FormationScenarioView, type SupplementProjectionResult } from './formationScenarios';
import type { Building, Cost, Tech, Trees, Unit } from './types';
import { techAvailable, unitAvailable } from './unitAvailability';

export type {
  FormationScenarioAdjustmentBlock,
  FormationScenarioBranchBlock,
  FormationScenarioSupplementBlock,
  FormationScenarioView,
} from './formationScenarios';

export type FormationAge = 2 | 3 | 4;
type FormationStatus = 'approved' | 'candidate' | 'unverified' | 'draft';
type FormationPlaytest = 'reported' | 'pending' | 'unreported';
type FormationComposition = 'combined' | 'choice' | 'progression';
export type EntityKind = 'unit' | 'building' | 'tech';
export type FormationScenarioGroup = 'opponent' | 'condition';

export interface FormationPatch {
  build: number;
  date: string;
}

export interface EntityRef {
  kind: EntityKind;
  id: number;
  age?: FormationAge;
}

export interface FormationDecision {
  condition?: string;
  also?: string;
  exception: string;
}

export interface FormationResearch {
  tech: number;
  effect: string;
  caveat?: string;
  decision?: FormationDecision;
  optional?: true;
  trainingPrice?: { before: Cost; after: Cost };
}

export interface FormationEntity extends EntityRef {
  historicalName: string;
  role: string;
  research?: FormationResearch;
}

export interface FormationPrerequisite extends FormationEntity {
  condition?: string;
}

export interface FormationChoice {
  id: string;
  title: string;
  preconditions: string[];
  entities: FormationEntity[];
}

export interface FormationSupplement {
  mode:
    | 'as-needed'
    | 'choice'
    | 'replace'
    | 'progression'
    | 'mechanism-support'
    | 'support'
    | 'conditional'
    | 'position-variant'
    | 'mechanism-only'
    | 'continuation-adjustment'
    | 'production-alternative'
    | 'upgrade'
    | 'conditional-evaluation';
  condition?: string;
  label?: string;
  requires?: EntityRef[];
  entities: FormationEntity[];
}

interface RouteDependency {
  kind: 'route';
  id: string;
}

type AdjustmentDependency = EntityRef | RouteDependency;

export interface Adjustment {
  id: string;
  when: string;
  text: string;
  decision?: FormationDecision;
  requires?: AdjustmentDependency[];
  fallback?: string;
}

export interface FormationConditionBranch {
  id: string;
  title: string;
  requires: EntityRef[];
  displayRequires?: EntityRef[];
  partialTitle?: string;
  partialFallback?: string;
  context: { label: string; text: string };
  decision: { label: string; text: string };
  evidence: string;
}

export interface FormationEvidenceLink {
  label: string;
  href: string;
  requires?: EntityRef[];
}

export interface FormationEvidence {
  recognition: string;
  playtest: string;
  scope: string;
  recordedVersion: string;
  sourceLines: number[];
  links?: FormationEvidenceLink[];
}

export type ScenarioGate =
  | { kind: 'supplement'; index: number; requireFull?: true }
  | { kind: 'adjustment'; id: string }
  | { kind: 'conditionBranch'; id: string }
  | { kind: 'entity'; entityKind: EntityKind; id: number; age?: FormationAge };

export interface ScenarioOmitSupplementCondition {
  supplementIndex: number;
  coveredBy: { kind: 'adjustment' | 'conditionBranch'; id: string };
}

export interface ScenarioCaveat {
  text: string;
  whenAvailable?: ScenarioGate;
}

export interface ScenarioLink {
  index: number;
  whenAvailable?: ScenarioGate;
}

export interface FormationScenario {
  id: string;
  chipLabel: string;
  actionHint?: string;
  actionHintGate?: ScenarioGate;
  group?: FormationScenarioGroup;
  title?: string;
  when?: string;
  summary?: string;
  summaryGate?: ScenarioGate;
  omitSupplementConditions?: ScenarioOmitSupplementCondition[];
  caveats?: ScenarioCaveat[];
  links?: ScenarioLink[];
  supplementIndices?: number[];
  adjustmentIds?: string[];
  conditionBranchIds?: string[];
}

export interface Formation {
  id: string;
  title: string;
  tabHint?: string;
  status: FormationStatus;
  playtest: FormationPlaytest;
  composition: FormationComposition;
  presentation?: 'age-progression' | 'separate-support';
  age: FormationAge;
  patch: FormationPatch;
  revised: string;
  condition: string;
  required: FormationEntity[];
  choices?: FormationChoice[];
  choiceLabel?: string;
  prerequisites: FormationPrerequisite[];
  supplements: FormationSupplement[];
  reason?: string;
  limitation?: string;
  attack?: string;
  defense?: string;
  adjustments?: Adjustment[];
  conditionBranches?: FormationConditionBranch[];
  scenarios?: FormationScenario[];
  alternatives?: string;
  evidence: FormationEvidence;
  source?: FormationSource;
}

export interface CivFormationContent {
  civ: string;
  lead: string;
  source: FormationSource;
  routes: Formation[];
  routeGroups?: { title: string; note: string; routes: { id: string; label: string }[] }[];
}

export interface FormationCatalog {
  core: {
    unitById: Record<number, Unit>;
    techById: Record<number, Tech>;
    buildingById: Record<number, Building>;
  };
  trees: Trees;
}

export type FormationEntityView =
  | { kind: 'unit'; entity: Unit; role: string; age: FormationAge; rawOccurrence?: number; research?: Omit<FormationResearch, 'tech'> & { tech: Tech } }
  | { kind: 'tech'; entity: Tech; role: string; age: FormationAge; rawOccurrence?: number }
  | { kind: 'building'; entity: Building; role: string; age: FormationAge; rawOccurrence?: number };

export type FormationChoiceView = Omit<FormationChoice, 'entities'> & { entities: FormationEntityView[] };
export type FormationSupplementView = Omit<FormationSupplement, 'entities'> & {
  entities: FormationEntityView[];
  sourceIndex?: number;
  partial?: boolean;
  missingOptionalResearch?: boolean;
};
export type FormationAdjustmentView = Pick<Adjustment, 'id' | 'when' | 'decision' | 'fallback'> & {
  text?: string;
  unavailable?: boolean;
  candidateBoundary?: string;
};

export type FormationView =
  | { status: 'draft' }
  | { status: 'unverified'; id: string; source: FormationSource | null; pendingText: string }
  | { status: 'historical'; route: Formation; source: FormationSource | null }
  | { status: 'unavailable'; route: Formation; source: FormationSource | null }
  | {
      status: 'current';
      route: Formation;
      source: FormationSource | null;
      required: FormationEntityView[];
      prerequisites: FormationEntityView[];
      choices: FormationChoiceView[];
      supplements: FormationSupplementView[];
      adjustments: FormationAdjustmentView[];
      conditionBranches?: FormationConditionBranch[];
      scenarios: FormationScenarioView[];
      evidenceLinks: FormationEvidenceLink[];
    };

export function currentFormationPatch(source: FormationPatch, site: FormationPatch): boolean {
  return source.build === site.build && source.date === site.date;
}

export function publishedFormations(content: CivFormationContent | undefined): Formation[] {
  return content?.routes.filter((route) => route.status !== 'draft') ?? [];
}

export function approvedFormations(content: CivFormationContent | undefined): Formation[] {
  return content?.routes.filter((route) => route.status === 'approved') ?? [];
}

function availableEntity(catalog: FormationCatalog, civ: string, ref: EntityRef, routeAge: FormationAge, role = ''): FormationEntityView | null {
  const age = ref.age ?? routeAge;
  const { core, trees } = catalog;
  switch (ref.kind) {
    case 'unit': {
      const entity = core.unitById[ref.id];
      return entity && unitAvailable(catalog, civ, ref.id, age) ? { kind: ref.kind, entity, role, age } : null;
    }
    case 'tech': {
      const entity = core.techById[ref.id];
      return entity && techAvailable(catalog, civ, ref.id, age) ? { kind: ref.kind, entity, role, age } : null;
    }
    case 'building': {
      const entity = core.buildingById[ref.id];
      return entity?.civs.includes(civ) && buildingAge(entity, civ, trees) <= age ? { kind: ref.kind, entity, role, age } : null;
    }
  }
}

export function isEntityRefAvailable(catalog: FormationCatalog, civ: string, ref: EntityRef, routeAge: FormationAge): boolean {
  return availableEntity(catalog, civ, ref, routeAge) !== null;
}

function projectEntity(
  catalog: FormationCatalog,
  civ: string,
  ref: FormationEntity,
  routeAge: FormationAge,
): { view: FormationEntityView | null; missingOptionalResearch: boolean } {
  const row = availableEntity(catalog, civ, ref, routeAge, ref.role);
  if (row?.kind !== 'unit' || !ref.research) return { view: row, missingOptionalResearch: false };
  const tech = catalog.core.techById[ref.research.tech];
  if (!tech || !techAvailable(catalog, civ, tech.id, row.age)) {
    return ref.research.trainingPrice ? { view: null, missingOptionalResearch: false } : { view: row, missingOptionalResearch: true };
  }
  return { view: { ...row, research: { ...ref.research, tech } }, missingOptionalResearch: false };
}

function targetAvailable(target: Formation, civ: string, patch: FormationPatch, catalog: FormationCatalog): boolean {
  if (target.status === 'draft' || target.status === 'unverified' || !currentFormationPatch(target.patch, patch)) return false;
  const required = [...target.required, ...target.prerequisites, ...(target.choices ?? []).flatMap((choice) => choice.entities)];
  return required.every((ref) => availableEntity(catalog, civ, ref, target.age, ref.role) !== null);
}

export function projectFormation(
  route: Formation,
  civ: string,
  patch: FormationPatch,
  catalog?: FormationCatalog,
  siblings: Formation[] = [],
  defaultSource?: FormationSource,
): FormationView {
  if (route.status === 'draft') return { status: 'draft' };
  const source = resolveFormationSource(defaultSource, route);
  if (route.status === 'unverified') return { status: 'unverified', id: route.id, source, pendingText: '路线依据待核实；暂不展示组成或作为当前推荐。' };
  if (!currentFormationPatch(route.patch, patch)) return { status: 'historical', route, source };
  if (!catalog) return { status: 'unavailable', route, source };

  const coreSeen = new Map<string, number>();
  const nextCoreOcc = (ref: EntityRef) => {
    const key = `${ref.kind}-${ref.id}`;
    const occ = coreSeen.get(key) ?? 0;
    coreSeen.set(key, occ + 1);
    return occ;
  };

  const required: (FormationEntityView | null)[] = route.required.map((ref) => {
    const rawOccurrence = nextCoreOcc(ref);
    const { view } = projectEntity(catalog, civ, ref, route.age);
    return view ? { ...view, rawOccurrence } : null;
  });
  const choices = (route.choices ?? []).map((choice) => ({
    ...choice,
    entities: choice.entities.map((ref): FormationEntityView | null => {
      const rawOccurrence = nextCoreOcc(ref);
      const { view } = projectEntity(catalog, civ, ref, route.age);
      return view ? { ...view, rawOccurrence } : null;
    }),
  }));
  const prerequisites: (FormationEntityView | null)[] = route.prerequisites.map((ref) => {
    const rawOccurrence = nextCoreOcc(ref);
    const view = availableEntity(catalog, civ, ref, route.age, ref.role);
    return view ? { ...view, rawOccurrence } : null;
  });

  if (
    required.some((ref) => ref === null) ||
    prerequisites.some((ref) => ref === null) ||
    choices.some((choice) => choice.entities.some((ref) => ref === null))
  )
    return { status: 'unavailable', route, source };

  const adjustments: FormationAdjustmentView[] = (route.adjustments ?? []).map(({ id, when, text, decision, requires, fallback }) => {
    let unavailable = false;
    let candidateBoundary: string | undefined;
    for (const dependency of requires ?? []) {
      if (dependency.kind !== 'route') {
        unavailable ||= availableEntity(catalog, civ, dependency, route.age) === null;
        continue;
      }
      const target = siblings.find((item) => item.id === dependency.id);
      if (!target || !targetAvailable(target, civ, patch, catalog)) {
        unavailable = true;
        continue;
      }
      if (target.status === 'candidate') {
        if (route.status !== 'candidate') unavailable = true;
        else candidateBoundary = target.condition;
      }
    }
    return unavailable
      ? { id, when, ...(fallback ? { text: fallback, fallback } : {}), unavailable: true }
      : { id, when, text, ...(decision ? { decision } : {}), ...(fallback ? { fallback } : {}), ...(candidateBoundary ? { candidateBoundary } : {}) };
  });

  const supplementViews: FormationSupplementView[] = [];
  const supplementResults = new Map<number, SupplementProjectionResult>();
  for (const [sourceIndex, group] of route.supplements.entries()) {
    const isAgeStage = isAgeProgressionSupplement(route, group);
    const rawOccs = isAgeStage ? group.entities.map((ref) => nextCoreOcc(ref)) : undefined;
    if (group.requires?.some((ref) => !availableEntity(catalog, civ, ref, route.age))) {
      supplementResults.set(sourceIndex, { view: null, rawSlots: group.entities.map(() => null) });
      continue;
    }
    const projected = group.entities.map((ref, idx) => {
      const res = projectEntity(catalog, civ, ref, route.age);
      const view = res.view && rawOccs ? { ...res.view, rawOccurrence: rawOccs[idx] } : res.view;
      return { view, missingOptionalResearch: res.missingOptionalResearch };
    });
    const rawSlots = projected.map((item) => item.view);
    if (group.mode === 'position-variant' && rawSlots.some((entity) => entity === null)) {
      supplementResults.set(sourceIndex, { view: null, rawSlots });
      continue;
    }
    const availableEntities = rawSlots.filter((entity): entity is FormationEntityView => entity !== null);
    if (availableEntities.length === 0) {
      supplementResults.set(sourceIndex, { view: null, rawSlots });
      continue;
    }
    const partial = availableEntities.length < group.entities.length;
    const missingOptionalResearch = projected.some((item) => item.view !== null && item.missingOptionalResearch);
    const supView: FormationSupplementView = {
      ...group,
      entities: availableEntities,
      sourceIndex,
      partial,
      missingOptionalResearch,
    };
    supplementViews.push(supView);
    supplementResults.set(sourceIndex, { view: supView, rawSlots });
  }

  const conditionBranches = route.conditionBranches?.filter((branch) => branch.requires.every((ref) => availableEntity(catalog, civ, ref, route.age) !== null));
  const { scenarios, evidenceLinks } = projectFormationScenarios({
    route,
    supplementResults,
    adjustments,
    isEntityAvailable: (ref) => isEntityRefAvailable(catalog, civ, ref, route.age),
  });

  return {
    status: 'current',
    route,
    source,
    required: required.filter((ref): ref is FormationEntityView => ref !== null),
    prerequisites: prerequisites.filter((ref): ref is FormationEntityView => ref !== null),
    choices: choices.map((choice) => ({
      ...choice,
      entities: choice.entities.filter((ref): ref is FormationEntityView => ref !== null),
    })),
    supplements: supplementViews,
    adjustments,
    ...(conditionBranches?.length ? { conditionBranches } : {}),
    scenarios,
    evidenceLinks,
  };
}
