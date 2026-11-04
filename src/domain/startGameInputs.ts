/** 本局可操作输入；轻量协议，不加载机制模型或数据。 */
export interface SceneConfig {
  age: number;
  budget: number;
  distance: number;
  deadline: number;
  reaction: number;
  room: number;
  mode: 'ready' | 'new';
  husbandry: boolean;
}
export interface RouteConfig {
  feudalBudget: number;
  castleBudget: number;
  survivors: number;
  newLimit: number;
  husbandry: boolean;
  distance: number;
  deadline: number;
}
export const DEFAULT_SCENE: SceneConfig = { age: 3, budget: 12000, distance: 30, deadline: 120, reaction: 0.5, room: 0, mode: 'new', husbandry: true };
export const DEFAULT_FLANK_SCENE: SceneConfig = { ...DEFAULT_SCENE, distance: 12 };
export const DEFAULT_ROUTE: RouteConfig = { feudalBudget: 2000, castleBudget: 3000, survivors: 6, newLimit: 6, husbandry: true, distance: 30, deadline: 120 };
export const sceneDefaults = (lane: 'flank' | 'pocket') => (lane === 'flank' ? DEFAULT_FLANK_SCENE : DEFAULT_SCENE);
export const sceneSupported = (c: { mode: string | null; teamSize: string | null; mapId: string | null; lane: string | null }) =>
  c.mode === 'team' && c.teamSize === '4v4' && c.mapId === 'arabia' && (c.lane === 'flank' || c.lane === 'pocket');
const record = (v: unknown): v is Record<string, unknown> =>
  v != null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const exact = (v: Record<string, unknown>, fields: string[]) =>
  Object.keys(v).length === fields.length && fields.every((k) => Object.prototype.hasOwnProperty.call(v, k));
const member = (v: unknown, values: readonly number[]) => typeof v === 'number' && Number.isFinite(v) && values.includes(v);
export function validSceneInput(v: unknown, lane: 'flank' | 'pocket'): v is SceneConfig {
  if (
    !record(v) ||
    !exact(v, ['age', 'budget', 'distance', 'deadline', 'reaction', 'room', 'mode', 'husbandry']) ||
    v.age !== 3 ||
    !member(v.budget, [0, 2000, 12000]) ||
    typeof v.husbandry !== 'boolean'
  )
    return false;
  return lane === 'flank'
    ? member(v.distance, [2, 12]) &&
        member(v.reaction, [0, 0.5, 1.25]) &&
        member(v.room, [0, 4, 12]) &&
        v.deadline === 120 &&
        v.mode === 'new' &&
        v.husbandry === true
    : member(v.distance, [10, 30, 60]) &&
        member(v.deadline, [60, 120, 1200]) &&
        ['new', 'ready'].includes(v.mode as string) &&
        v.reaction === 0.5 &&
        v.room === 0;
}
export function validRouteInput(v: unknown, lane: 'flank' | 'pocket'): v is RouteConfig {
  return (
    record(v) &&
    exact(v, ['feudalBudget', 'castleBudget', 'survivors', 'newLimit', 'husbandry', 'distance', 'deadline']) &&
    member(v.feudalBudget, [0, 600, 2000, 3000, 6000, 12000]) &&
    member(v.castleBudget, [0, 600, 2000, 3000, 6000, 12000]) &&
    member(v.survivors, [0, 6, 12]) &&
    member(v.newLimit, [0, 6, 12]) &&
    member(v.distance, [0, 10, 30, 60]) &&
    member(v.deadline, [0, 60, 120, 1200]) &&
    typeof v.husbandry === 'boolean' &&
    (lane === 'pocket' || v.husbandry === true)
  );
}
