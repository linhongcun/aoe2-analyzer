/**
 * 核心目录（单位、科技、建筑）的唯一类型化形态：派生字段与索引只在这里建一次。
 * 同步消费方直接读 CORE；loadCore() 动态 import 本模块并返回同一个对象，目录数据仍不进主包。
 */
import unitsRaw from './raw/units';
import techsRaw from './raw/techs';
import buildingsRaw from './raw/buildings';
import type { Building, Tech, Unit } from '../domain/types';
import { buildingType } from '../domain/buildings';
import { buildingDlc, techDlc, techUpdate, unitDlc } from '../domain/introductions';
import { buildLinker, type Linker } from '../domain/linker';
import { buildFamilies, type Families } from '../domain/family';

export interface Core {
  units: Unit[];
  techs: Tech[];
  unitById: Record<number, Unit>;
  techById: Record<number, Tech>;
  buildings: Building[];
  buildingById: Record<number, Building>;
  linker: Linker;
  fam: Families;
}

export function buildCore(rawUnits: unknown, rawTechs: unknown, rawBuildings: unknown): Core {
  const units = (rawUnits as Unit[]).map((x) => ({ ...x, dlc: unitDlc(x) }));
  const techs = (rawTechs as Tech[]).map((x) => ({ ...x, dlc: techDlc(x), introducedUpdate: techUpdate(x) }));
  const unitById: Record<number, Unit> = {};
  units.forEach((x) => (unitById[x.id] = x));
  const techById: Record<number, Tech> = {};
  techs.forEach((x) => (techById[x.id] = x));
  const buildings = (rawBuildings as Omit<Building, 'dlc' | 'type'>[]).map((x) => ({
    ...x,
    dlc: buildingDlc(x),
    type: buildingType(x.en),
  }));
  const buildingById: Record<number, Building> = {};
  buildings.forEach((x) => (buildingById[x.id] = x));
  return {
    units,
    techs,
    buildings,
    unitById,
    techById,
    buildingById,
    linker: buildLinker(units, techs, buildings),
    fam: buildFamilies(units, unitById),
  };
}

export const CORE: Core = buildCore(unitsRaw, techsRaw, buildingsRaw);
