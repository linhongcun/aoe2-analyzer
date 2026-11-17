import { buildingAge } from './availabilityAge';
import type { Building, Tech, Trees, Unit } from './types';
import { techAvailable, unitAvailable } from './unitAvailability';

interface FormationPatch {
  build: number;
  date: string;
}

type EntityRef = { kind: 'unit' | 'building' | 'tech'; id: number };

interface FormationEntity extends EntityRef {
  historicalName: string;
  role: string;
}

interface Adjustment {
  id: string;
  when: string;
  text: string;
  requires?: (EntityRef | { kind: 'route'; id: string })[];
  fallback?: string;
}

interface Formation {
  id: string;
  title: string;
  status: 'approved' | 'draft';
  playtest: 'unreported';
  patch: FormationPatch;
  revised: string;
  condition: string;
  required: FormationEntity[];
  prerequisites: EntityRef[];
  supplements: FormationEntity[];
  reason: string;
  limitation: string;
  attack: string;
  defense: string;
  adjustments: Adjustment[];
  alternatives: string;
}

export interface CivFormationContent {
  civ: string;
  lead: string;
  source: { content: string; discussion: string; boundary: string };
  routes: Formation[];
}

export type FormationEntityView =
  { kind: 'unit'; entity: Unit; role: string } | { kind: 'tech'; entity: Tech; role: string } | { kind: 'building'; entity: Building; role: string };

interface FormationCatalog {
  core: {
    unitById: Record<number, Unit>;
    techById: Record<number, Tech>;
    buildingById: Record<number, Building>;
  };
  trees: Trees;
}

export type FormationView =
  | { status: 'historical'; route: Formation }
  | { status: 'unavailable'; route: Formation }
  | {
      status: 'current';
      route: Formation;
      required: FormationEntityView[];
      supplements: (FormationEntityView | null)[];
      adjustments: (Pick<Adjustment, 'id' | 'when'> & { text?: string; unavailable?: boolean })[];
    };

export function currentFormationPatch(source: FormationPatch, site: FormationPatch): boolean {
  return source.build === site.build && source.date === site.date;
}

export function approvedFormations(content: CivFormationContent | undefined): Formation[] {
  return content?.routes.filter((route) => route.status === 'approved') ?? [];
}

function availableEntity(catalog: FormationCatalog, civ: string, ref: EntityRef, role = ''): FormationEntityView | null {
  // 已确认的首批条件路线只用于帝王时代中后期。
  const imperial = 4;
  const { core, trees } = catalog;
  switch (ref.kind) {
    case 'unit': {
      const entity = core.unitById[ref.id];
      return entity && unitAvailable(catalog, civ, ref.id, imperial) ? { kind: ref.kind, entity, role } : null;
    }
    case 'tech': {
      const entity = core.techById[ref.id];
      return entity && techAvailable(catalog, civ, ref.id, imperial) ? { kind: ref.kind, entity, role } : null;
    }
    case 'building': {
      const entity = core.buildingById[ref.id];
      // 大型箭塔等升级形态未必是科技树的独立建筑列。
      return entity?.civs.includes(civ) && buildingAge(entity, civ, trees) <= imperial ? { kind: ref.kind, entity, role } : null;
    }
  }
}

export function projectFormation(route: Formation, civ: string, patch: FormationPatch, catalog?: FormationCatalog, siblings: Formation[] = []): FormationView {
  if (!currentFormationPatch(route.patch, patch)) return { status: 'historical', route };
  if (!catalog) return { status: 'unavailable', route };
  const required = route.required.map((ref) => availableEntity(catalog, civ, ref, ref.role));
  if (required.some((ref) => ref === null) || route.prerequisites.some((ref) => !availableEntity(catalog, civ, ref))) {
    return { status: 'unavailable', route };
  }
  const available = (dependency: NonNullable<Adjustment['requires']>[number]) => {
    if (dependency.kind !== 'route') return !!availableEntity(catalog, civ, dependency);
    const target = siblings.find((item) => item.id === dependency.id && item.status === 'approved');
    return (
      !!target && currentFormationPatch(target.patch, patch) && [...target.required, ...target.prerequisites].every((ref) => availableEntity(catalog, civ, ref))
    );
  };
  return {
    status: 'current',
    route,
    required: required.filter((ref) => ref !== null),
    supplements: route.supplements.map((ref) => availableEntity(catalog, civ, ref, ref.role)),
    adjustments: route.adjustments.map(({ id, when, text, requires, fallback }) => ({
      id,
      when,
      ...(requires && !requires.every(available) ? { text: fallback, unavailable: true } : { text }),
    })),
  };
}
