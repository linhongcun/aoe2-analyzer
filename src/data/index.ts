/**
 * 类型化数据加载器。civs 体积小、首页即需要，随主包加载；
 * units/techs（~340KB）与 trees（~175KB）通过 dynamic import 按路由懒加载。
 */
import civsRaw from './civs.json';
import type { Building, Civ, Tech, Trees, Unit } from '../domain/types';
import { buildingDlc, buildingType } from '../domain/buildings';
import { civDlc, dlcOf } from '../domain/dlc';
import { buildLinker, type Linker } from '../domain/linker';

export const civs: Civ[] = (civsRaw as Omit<Civ, 'dlc'>[]).map((c) => ({ ...c, ty: c.ty, dlc: civDlc(c.en) }) as Civ);
export const civIndex = (en: string) => civs.findIndex((c) => c.en === en);
export const civByEn = (en: string): Civ | undefined => civs.find((c) => c.en === en);

export interface Core {
  units: Unit[];
  techs: Tech[];
  unitById: Record<number, Unit>;
  techById: Record<number, Tech>;
  buildings: Building[];
  buildingById: Record<number, Building>;
  linker: Linker;
}
let corePromise: Promise<Core> | null = null;
export let coreCache: Core | null = null;
export function loadCore(): Promise<Core> {
  corePromise ??= Promise.all([import('./units.json'), import('./techs.json'), import('./buildings.json')]).then(([u, t, b]) => {
    const units = (u.default as unknown as Unit[]).map((x) => ({ ...x, dlc: dlcOf(x) }));
    const techs = (t.default as unknown as Tech[]).map((x) => ({ ...x, dlc: dlcOf(x) }));
    const unitById: Record<number, Unit> = {};
    units.forEach((x) => (unitById[x.id] = x));
    const techById: Record<number, Tech> = {};
    techs.forEach((x) => (techById[x.id] = x));
    const buildings = (b.default as unknown as Omit<Building, 'dlc' | 'type'>[]).map((x) => ({
      ...x,
      dlc: buildingDlc(x, civs.length),
      type: buildingType(x.en),
    }));
    const buildingById: Record<number, Building> = {};
    buildings.forEach((x) => (buildingById[x.id] = x));
    coreCache = { units, techs, buildings, unitById, techById, buildingById, linker: buildLinker(units, techs, buildings) };
    return coreCache;
  });
  return corePromise;
}

let treesPromise: Promise<Trees> | null = null;
export let treesCache: Trees | null = null;
export function loadTrees(): Promise<Trees> {
  treesPromise ??= import('./trees.json').then((m) => (treesCache = m.default as unknown as Trees));
  return treesPromise;
}
