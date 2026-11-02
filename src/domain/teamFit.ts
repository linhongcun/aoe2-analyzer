/** Read-only full-tree potential. Never supplies simulator values or completed state. */
import type { Core } from '../data';
import type { Trees, Unit } from './types';
import type { TeamFitConfig } from './teamFitQuery';
import { civStatus } from './civStatus';
import { unitRoles } from './unitRoles';
import { upgradeLine } from './units';
import { baseUnit } from './family';
import { productionBuildings, productionTechs, type ProductionConfig } from './production';
import {
  TEAM_BONUS_DATA,
  teamBonusSources,
  encodeTeamBonuses,
  type TeamTargetSource,
  type TeamProvider,
  type TeamTechnologySource,
  type PermanentTeamSource,
} from './teamBonuses';
import { defaultTeamPlan, emptyPlayerPhase, encodeTeamPlan, type PlayerId, type TeamPlan } from './teamPlan';

export const FIT_ROLES = { infantry: '步兵', cavalry: '骑兵', archer: '弓兵', siege: '攻城', antiCavalry: '对骑兵额外攻击' } as const;
export type FitRole = keyof typeof FIT_ROLES;
export interface FitLocation {
  rawId: number;
  building: number;
  player: number;
  civ: string;
  techs: number[];
}
export interface FitShape {
  key: string;
  unit: Unit;
  rawIds: number[];
  providers: TeamProvider[];
  locations: FitLocation[];
  roles: FitRole[];
  transport: boolean;
  route: string;
}
export interface FitRoute {
  key: string;
  forms: FitShape[];
  terminalKeys: string[];
  isNewRoute: boolean;
}
export interface FitRelation {
  player: number;
  civ: string;
  direct: number[];
  production: number[];
  buildings: number[];
}
export interface FitSource {
  key: string;
  source: PermanentTeamSource | TeamTechnologySource;
  providers: TeamProvider[];
  isNew: boolean;
  relations: FitRelation[];
  unlocks: number[];
}
export interface FitProjection {
  before: FitShape[];
  candidate: FitShape[];
  after: FitShape[];
  added: FitShape[];
  forward: FitSource[];
  reverse: FitSource[];
  directions: { role: FitRole; added: FitRoute[]; existing: FitRoute[] }[];
}
const siegeTransport = (unit: Unit) => unit.id === 1105 && unit.atk <= 0 && !unit.atks.some(([, value]) => value > 0);

/** Armor classification alone is insufficient for a combat comparison. */
export function fitUnitRoles(unit: Unit): FitRole[] {
  const roles = unitRoles(unit);
  if (roles.includes('ship')) return [];
  const attacks = unit.atk > 0 || unit.atks.some(([, value]) => value > 0);
  // The pinned Siege Tower is a reviewed non-attacking transport exception;
  // armor membership by itself must not admit future non-combat objects.
  const transport = !attacks && roles.includes('siege') && siegeTransport(unit);
  if (!attacks && !transport) return [];
  const result: FitRole[] = (['infantry', 'cavalry', 'archer', 'siege'] as const).filter((role) => roles.includes(role));
  if (unit.atks.some(([target, value]) => target === '骑兵' && value > 0)) result.push('antiCavalry');
  return result;
}
const specialUnits = new Set(TEAM_BONUS_DATA.technologies.filter((s) => s.kinds.includes('unlock')).flatMap((s) => s.targetUnits));

export function fitShapes(core: Core, trees: Trees, players: string[]): FitShape[] {
  const shapes = new Map<string, FitShape>();
  players.forEach((civ, index) => {
    const player = index + 1;
    const status = civStatus(trees, civ);
    const eligible = core.units.filter((u) => !specialUnits.has(u.id) && u.civs.includes(civ) && status['u' + u.id] === 1);
    const ids = new Set(eligible.map((u) => u.id));
    const techs = productionTechs({ core, trees }, { civ, age: 4 }).map((t) => t.id);
    const config: ProductionConfig = { civ, age: 4, techs, walk: 3, farm: 1, rows: [] };
    eligible.forEach((unit) => {
      // Normalize only same full English name. Elite and separate branches remain distinct.
      const shape = shapes.get(unit.en) ?? {
        key: unit.en,
        unit,
        rawIds: [],
        providers: [],
        locations: [],
        roles: fitUnitRoles(unit),
        transport: siegeTransport(unit),
        route: '',
      };
      if (!shape.rawIds.includes(unit.id)) shape.rawIds.push(unit.id);
      if (!shape.providers.some((p) => p.player === player)) shape.providers.push({ player, civ });
      const buildings = productionBuildings({ core, trees }, config, unit);
      const withoutResearch = productionBuildings({ core, trees }, { ...config, techs: [] }, unit);
      // Keep catalog locations even where this page does not model a training mechanism.
      for (const building of buildings.length ? buildings : [unit.b]) {
        const required =
          buildings.includes(building) && !withoutResearch.includes(building)
            ? techs.filter((id) => !productionBuildings({ core, trees }, { ...config, techs: techs.filter((t) => t !== id) }, unit).includes(building))
            : [];
        shape.locations.push({ rawId: unit.id, building, player, civ, techs: required });
      }
      const line = upgradeLine(unit, core.units, core.unitById, (id) => ids.has(id)).filter((u) => ids.has(u.id));
      shape.route ||= baseUnit(line[0] ?? unit, core.fam).en;
      shapes.set(shape.key, shape);
    });
  });
  return [...shapes.values()];
}
function relation(core: Core, trees: Trees, source: TeamTargetSource, civ: string, player: number): FitRelation {
  const status = civStatus(trees, civ);
  const allowed = (id: number) => core.unitById[id]?.civs.includes(civ) && status['u' + id] === 1 && !specialUnits.has(id);
  return {
    player,
    civ,
    direct: source.targetUnits.filter(allowed),
    production: source.productionUnits.filter(allowed),
    buildings: source.targetBuildings.filter((id) => core.buildingById[id]?.civs.includes(civ)),
  };
}
function routes(core: Core, shapes: FitShape[], all: FitShape[], before: Set<string>): FitRoute[] {
  const grouped = new Map<string, FitRoute>();
  shapes.forEach((shape) => {
    const route = grouped.get(shape.route) ?? {
      key: shape.route,
      forms: [],
      terminalKeys: [],
      isNewRoute: !all.some((s) => s.route === shape.route && before.has(s.key)),
    };
    route.forms.push(shape);
    grouped.set(shape.route, route);
  });
  for (const route of grouped.values()) {
    route.terminalKeys = route.forms
      .filter((s) =>
        s.providers.some(
          (provider) =>
            !route.forms.some((other) =>
              other.locations.some(
                (next) =>
                  next.player === provider.player &&
                  next.civ === provider.civ &&
                  s.locations.some(
                    (current) => current.player === provider.player && current.civ === provider.civ && core.unitById[next.rawId]?.from_ === current.rawId,
                  ),
              ),
            ),
        ),
      )
      .map((s) => s.key);
  }
  return [...grouped.values()];
}
export function projectTeamFit(core: Core, trees: Trees, config: TeamFitConfig): FitProjection {
  if (!config.candidate) return { before: [], candidate: [], after: [], added: [], forward: [], reverse: [], directions: [] };
  const before = fitShapes(core, trees, config.mates);
  const candidate = fitShapes(core, trees, config.candidate ? [config.candidate] : []);
  const after = fitShapes(core, trees, config.candidate ? [config.candidate, ...config.mates] : config.mates);
  const previous = new Set(before.map((s) => s.key));
  const added = candidate.filter((s) => !previous.has(s.key));
  const priorSources = teamBonusSources({ players: config.mates });
  const joined = teamBonusSources({ players: config.candidate ? [config.candidate, ...config.mates] : config.mates });
  const prior = new Set([...priorSources.permanent.map((r) => 'p:' + r.source.id), ...priorSources.technologies.map((r) => 't:' + r.source.id)]);
  const rows: FitSource[] = [
    ...joined.permanent.map((row) => ({ ...row, key: 'p:' + row.source.id })),
    ...joined.technologies.map((row) => ({ ...row, key: 't:' + row.source.id })),
  ].map((row) => ({
    ...row,
    isNew: !prior.has(row.key),
    unlocks: row.source.kinds.includes('unlock') ? row.source.targetUnits : [],
    relations: [config.candidate, ...config.mates].filter(Boolean).map((civ, i) => relation(core, trees, row.source, civ, i + 1)),
  }));
  return {
    before,
    candidate,
    after,
    added,
    forward: rows.filter((row) => row.providers.some((p) => p.player === 1)),
    reverse: rows.filter((row) => row.providers.some((p) => p.player !== 1)),
    directions: (Object.keys(FIT_ROLES) as FitRole[]).map((role) => ({
      role,
      added: routes(
        core,
        added.filter((s) => s.roles.includes(role)),
        after,
        previous,
      ),
      existing: routes(
        core,
        before.filter((s) => s.roles.includes(role)),
        before,
        previous,
      ),
    })),
  };
}
export function fitTeamPlan(config: TeamFitConfig): TeamPlan | null {
  if (!config.candidate || config.mates.length < 1) return null;
  const plan = defaultTeamPlan();
  const players = [config.candidate, ...config.mates].map((civ, index) => ({
    ...plan.players[0]!,
    id: ('p' + (index + 1)) as PlayerId,
    name: 'P' + (index + 1),
    civ,
  }));
  return { ...plan, players, phases: plan.phases.map((p) => ({ ...p, players: players.map((x) => emptyPlayerPhase(x.id)) })) };
}
export function fitToolLinks(config: TeamFitConfig): { bonuses: string; plan: string | null } | null {
  if (!config.candidate) return null;
  const players = [config.candidate, ...config.mates];
  const plan = fitTeamPlan(config);
  return {
    bonuses: '/team-bonuses?' + encodeTeamBonuses({ players, age: 4, target: 'all', unit: null, researched: [] }),
    plan: plan ? '/team-plan?' + encodeTeamPlan(plan) : null,
  };
}
