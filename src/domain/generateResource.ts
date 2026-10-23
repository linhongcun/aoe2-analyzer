/**
 * issue 383 瓦兰吉卫队产金估算。只读导出数据，不改战斗。
 *
 * 公式：交战单位·秒 × Task.work_value_1 × 资源 ResMul。
 * 2703/2704 的 ResOut 是 3（黄金），ResMul 是 297。同一单位对每个目标兵种各有一行，
 * Value / ResOut / ResMul 相同，这里用合并后的那一组。
 *
 * 资源 297 在固定 .dat 里每个文明的起始值都是 50。瓦兰吉人的自动加成是 effect type 6
 * 乘法，约 ×1.3333（tech 1488）。游戏说明写「产生的黄金 +50%」，UGC 资源 297 把这条加成
 * 记成 1.33（https://ugc.aoe2.rocks/general/resources/resources/ ）。页面用 .dat：
 * 50 × 该乘法，不把说明当成 ×1.5，也不把 UGC 的「默认 1」当成库存。
 * 其他文明不乘这条约 ×1.33。
 *
 * 不按攻击次数。UGC 对怯薛写过，reload 和帧延迟会让实际到手略低；本估算不套那一层，
 * 这样胜负、用时、剩余生命都不必跟着攻击间隔改。
 * 社区对「产金跟交战时间走」的说明：
 * https://www.reddit.com/r/aoe2/comments/1wpq9yi/reasoning_for_the_weird_numbers_behind_the/
 *
 * 数值来自 scripts/generate_resource_build.py（固定 .dat，四舍五入到 6 位小数）。
 */
import raw from '../data/generate_resource.json';

const VG_IDS = new Set([2703, 2704]);

interface GenTask {
  action: number;
  resOut: number;
  resMul: number;
  value: number;
  classes: number[];
}

interface GenResource {
  base: number;
  autoMul: Record<string, number>;
}

interface GenData {
  units: Record<string, GenTask>;
  resources: Record<string, GenResource>;
}

const data = raw as GenData;

export interface VarangianGold {
  gold: number;
  /** Task.work_value_1 */
  value: number;
  resOut: number;
  resMul: number;
  /** 资源起始值（本补丁各文明相同） */
  base: number;
  /** 该文明自动乘法；没有则为 1 */
  autoMul: number;
  /** base × autoMul */
  resource: number;
}

/** 说明文案里的倍率，保留两位，例如 1.3333 → 1.33。 */
export function formatRatio(mul: number): string {
  return (Math.round(mul * 100) / 100).toFixed(2);
}

/** 瓦兰吉人资源 297 的自动乘法。数据缺失时为 1。 */
export function varangianListedRatio(): number {
  return data.resources['297']?.autoMul.Varangians ?? 1;
}

/**
 * 一方是瓦兰吉卫队系时，按交战单位·秒估算本场黄金。
 * 非该单位、时长非法、或任务不是「黄金 × 资源 297」时返回 null。
 */
export function varangianGold(unitId: number, civ: string, engagementUnitSeconds: number): VarangianGold | null {
  if (!VG_IDS.has(unitId) || !Number.isFinite(engagementUnitSeconds) || engagementUnitSeconds < 0) return null;
  const task = data.units[String(unitId)];
  const row = task ? data.resources[String(task.resMul)] : undefined;
  if (!task || !row || task.action !== 151 || task.resOut !== 3 || task.resMul !== 297) return null;
  const autoMul = row.autoMul[civ] ?? 1;
  const resource = row.base * autoMul;
  return {
    gold: engagementUnitSeconds * task.value * resource,
    value: task.value,
    resOut: task.resOut,
    resMul: task.resMul,
    base: row.base,
    autoMul,
    resource,
  };
}

/**
 * 群战时间线里，一侧活着的单位·秒。
 * 相邻两点之间用前一点的存活数（该点结算之后、下一次结算之前）。
 */
export function sideEngagementSeconds(timeline: readonly (readonly [number, number, number])[], side: 'a' | 'b'): number {
  let sum = 0;
  for (let i = 0; i < timeline.length - 1; i++) {
    const cur = timeline[i]!;
    const nxt = timeline[i + 1]!;
    sum += (side === 'a' ? cur[1] : cur[2]) * (nxt[0] - cur[0]);
  }
  return sum;
}
