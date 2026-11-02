/** issue 652 有界点几何；不模拟发射动画、碰撞、命中或伤亡。 */
export const SCENE_EPS = 1e-9;
export function firstStrike(range: number, cycle: number, targetRange: number, targetSpeed: number, distance: number, reaction: number) {
  if (
    ![range, cycle, targetRange, targetSpeed, distance, reaction].every(Number.isFinite) ||
    cycle <= 0 ||
    targetSpeed <= 0 ||
    Math.min(range, targetRange, distance, reaction) < 0
  )
    return null;
  const entry = Math.max(0, (distance - range) / targetSpeed);
  const threat = Math.max(0, (distance - targetRange) / targetSpeed);
  const first = entry + reaction;
  const opportunities = threat <= first + SCENE_EPS ? 0 : Math.max(0, Math.ceil((threat - first) / cycle - SCENE_EPS));
  return { window: Math.max(0, threat - entry), opportunities, actualLaunches: null, hits: null, damage: null };
}
export function retreatContact(range: number, targetRange: number, targetSpeed: number, speed: number, reaction: number, room: number) {
  if (
    ![range, targetRange, targetSpeed, speed, reaction, room].every(Number.isFinite) ||
    Math.min(range, targetRange, reaction, room) < 0 ||
    targetSpeed <= 0 ||
    speed <= 0
  )
    return null;
  const gap = range - targetRange;
  if (gap <= 0) return 0;
  const standing = gap / targetSpeed;
  if (standing <= reaction) return standing;
  const remaining = gap - targetSpeed * reaction,
    closing = targetSpeed - speed,
    moving = room / speed;
  const catchDuringMove = closing > 0 ? remaining / closing : Infinity;
  if (catchDuringMove <= moving) return reaction + catchDuringMove;
  return reaction + moving + (remaining - closing * moving) / targetSpeed;
}
export function supportArrival(speed: number, cycle: number, affordable: number, distance: number, deadline: number, mode: 'ready' | 'new', startup = 0) {
  if (
    ![speed, cycle, affordable, distance, deadline, startup].every(Number.isFinite) ||
    speed <= 0 ||
    cycle <= 0 ||
    Math.min(affordable, distance, deadline, startup) < 0 ||
    !Number.isInteger(affordable)
  )
    return null;
  const travel = distance / speed;
  const first = affordable === 0 ? null : travel + (mode === 'new' ? startup + cycle : 0);
  const count =
    mode === 'ready'
      ? travel <= deadline + SCENE_EPS
        ? Math.min(6, affordable)
        : 0
      : Math.min(affordable, Math.max(0, Math.floor((deadline - startup - travel) / cycle + SCENE_EPS)));
  return { travel, first, count };
}
/** 可重现的非密码学输入摘要；对象键排序，纯文字字段不参与。 */
export function sceneSignature(value: unknown, shape = false): string {
  const clean = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(clean);
    if (x && typeof x === 'object')
      return Object.fromEntries(
        Object.entries(x)
          .sort(([a], [b]) => a.localeCompare(b))
          .filter(([k]) => !['desc', 'descEn', 'name', 'en', 'zh', 'fresh', 'py', 'pyi', 'text'].includes(k))
          .map(([k, v]) => [k, shape && k === 'v' && typeof v === 'number' ? '#number' : clean(v)]),
      );
    return x;
  };
  let hash = 2166136261;
  for (const ch of JSON.stringify(clean(value))) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
