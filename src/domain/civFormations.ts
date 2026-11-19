import { buildingAge } from './availabilityAge';
import type { FormationSource } from './civFormationsSource.mjs';
import { resolveFormationSource } from './civFormationsSource.mjs';
import type { Building, Tech, Trees, Unit } from './types';
import { techAvailable, unitAvailable } from './unitAvailability';

type FormationAge = 3 | 4;
type FormationStatus = 'approved' | 'candidate' | 'unverified' | 'draft';
type FormationPlaytest = 'reported' | 'pending' | 'unreported';
type FormationComposition = 'combined' | 'choice' | 'progression';
type EntityKind = 'unit' | 'building' | 'tech';

interface FormationPatch {
  build: number;
  date: string;
}

interface EntityRef {
  kind: EntityKind;
  id: number;
  age?: FormationAge;
}

interface FormationEntity extends EntityRef {
  historicalName: string;
  role: string;
}

interface FormationPrerequisite extends FormationEntity {
  condition?: string;
}

interface FormationChoice {
  id: string;
  title: string;
  preconditions: string[];
  entities: FormationEntity[];
}

interface FormationSupplement {
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
  entities: FormationEntity[];
}

interface RouteDependency {
  kind: 'route';
  id: string;
}

type AdjustmentDependency = EntityRef | RouteDependency;

interface Adjustment {
  id: string;
  when: string;
  text: string;
  requires?: AdjustmentDependency[];
  fallback?: string;
}

interface FormationEvidence {
  recognition: string;
  playtest: string;
  scope: string;
  recordedVersion: string;
  sourceLines: number[];
  links?: { label: string; href: string }[];
}

interface Formation {
  id: string;
  title: string;
  status: FormationStatus;
  playtest: FormationPlaytest;
  composition: FormationComposition;
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
  alternatives?: string;
  evidence: FormationEvidence;
  source?: FormationSource;
}

export interface CivFormationContent {
  civ: string;
  lead: string;
  source: FormationSource;
  routes: Formation[];
}

interface FormationCatalog {
  core: {
    unitById: Record<number, Unit>;
    techById: Record<number, Tech>;
    buildingById: Record<number, Building>;
  };
  trees: Trees;
}

export type FormationEntityView =
  | { kind: 'unit'; entity: Unit; role: string; age: FormationAge }
  | { kind: 'tech'; entity: Tech; role: string; age: FormationAge }
  | { kind: 'building'; entity: Building; role: string; age: FormationAge };

export type FormationChoiceView = Omit<FormationChoice, 'entities'> & { entities: FormationEntityView[] };
export type FormationSupplementView = Omit<FormationSupplement, 'entities'> & { entities: FormationEntityView[] };
export type FormationAdjustmentView = Pick<Adjustment, 'id' | 'when'> & {
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

  const required = route.required.map((ref) => availableEntity(catalog, civ, ref, route.age, ref.role));
  const prerequisites = route.prerequisites.map((ref) => availableEntity(catalog, civ, ref, route.age, ref.role));
  const choices = (route.choices ?? []).map((choice) => ({
    ...choice,
    entities: choice.entities.map((ref) => availableEntity(catalog, civ, ref, route.age, ref.role)),
  }));
  if (
    required.some((ref) => ref === null) ||
    prerequisites.some((ref) => ref === null) ||
    choices.some((choice) => choice.entities.some((ref) => ref === null))
  )
    return { status: 'unavailable', route, source };

  const adjustments = (route.adjustments ?? []).map(({ id, when, text, requires, fallback }) => {
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
      ? { id, when, ...(fallback ? { text: fallback } : {}), unavailable: true }
      : { id, when, text, ...(candidateBoundary ? { candidateBoundary } : {}) };
  });

  const supplementViews: FormationSupplementView[] = [];
  for (const group of route.supplements) {
    const entities = group.entities.map((ref) => availableEntity(catalog, civ, ref, route.age, ref.role));
    if (group.mode === 'position-variant' && entities.some((entity) => entity === null)) continue;
    const availableEntities = entities.filter((entity): entity is FormationEntityView => entity !== null);
    if (availableEntities.length > 0) supplementViews.push({ ...group, entities: availableEntities });
  }

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
  };
}
