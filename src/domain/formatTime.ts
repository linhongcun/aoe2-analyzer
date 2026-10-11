/** 全站唯一的时间格式化：秒 → m:ss，一律向下取整到整秒（Steve #53）。
 *  时刻（9:44 到达封建）和时长（约 0:24）都走这里，同一个秒数在任何地方显示都一字不差。
 *  加 1e-6 只为吸收浮点累加误差（如 599.9999999 当作 600），不改变向下取整的语义。 */
export const floorSec = (s: number): number => (Number.isFinite(s) ? Math.max(0, Math.floor(s + 1e-6)) : 0);

export function formatClock(seconds: number): string {
  const t = floorSec(seconds);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
