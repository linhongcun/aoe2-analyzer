/**
 * 类型化数据加载器。civs 体积小、首页即需要，随主包加载；
 * units/techs/buildings 经 ./core（类型化 CORE）、trees 直接通过 dynamic import 按路由懒加载。
 */
import civsRaw from './raw/civs';
import type { Civ, Trees } from '../domain/types';
import type { Core } from './core';
import { civDlc } from '../domain/dlc';

export const civs: Civ[] = (civsRaw as Omit<Civ, 'dlc'>[]).map((c) => ({ ...c, ty: c.ty, dlc: civDlc(c.en) }) as Civ);
export const civIndex = (en: string) => civs.findIndex((c) => c.en === en);
export const civByEn = (en: string): Civ | undefined => civs.find((c) => c.en === en);

export type { Core } from './core';
let corePromise: Promise<Core> | null = null;
export let coreCache: Core | null = null;
/** 与同步入口 `CORE`（src/data/core.ts）是同一个对象；动态 import 让目录数据留在主包之外。 */
export function loadCore(): Promise<Core> {
  corePromise ??= import('./core')
    .then(({ CORE }) => (coreCache = CORE))
    .catch((error: unknown) => {
      // 网络失败不永久缓存拒绝结果；局部重试保留调用方的玩家选择。
      corePromise = null;
      throw error;
    });
  return corePromise;
}

let treesPromise: Promise<Trees> | null = null;
export let treesCache: Trees | null = null;
export function loadTrees(): Promise<Trees> {
  treesPromise ??= import('../../data/game/trees.json')
    .then((m) => (treesCache = m.default as unknown as Trees))
    .catch((error: unknown) => {
      treesPromise = null;
      throw error;
    });
  return treesPromise;
}
