/**
 * 全站唯一的时间格式化与秒/分换算。
 *
 * 时长显示（时刻、真实成本、开局时间线）默认向下取整到整秒（Steve #53）：
 * 时刻（9:44 到达封建）和时长（约 0:24）都走这里，同一个秒数在任何地方显示都一字不差。
 * 加 1e-6 只为吸收浮点累加误差（如 599.9999999 当作 600），不改变向下取整的语义。
 *
 * GameClock 是换算器，受保护验收 v0270 固定要求 352.94 秒显示 5:53，因此它显式使用
 * `rounding: 'nearest'`；这是有名字的 converter 模式，不是第二套无标注实现。
 */
export const SECONDS_PER_MINUTE = 60;

export type ClockRounding = 'floor' | 'nearest';

export interface ClockFormatOptions {
  rounding?: ClockRounding;
  /** 满 1 小时显示 h:mm:ss；默认 m:ss。 */
  hours?: boolean;
}

export const floorSec = (s: number): number => (Number.isFinite(s) ? Math.max(0, Math.floor(s + 1e-6)) : 0);

export const roundSec = (s: number): number => (Number.isFinite(s) ? Math.max(0, Math.round(s)) : 0);

/** 秒 → 整秒，调用方必须显式选择取整口径。 */
export const clockSec = (seconds: number, rounding: ClockRounding = 'floor'): number => (rounding === 'nearest' ? roundSec(seconds) : floorSec(seconds));

export function formatClock(seconds: number, { rounding = 'floor', hours = false }: ClockFormatOptions = {}): string {
  const t = clockSec(seconds, rounding);
  if (hours && t >= 3600) {
    return `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / SECONDS_PER_MINUTE)).padStart(2, '0')}:${String(t % SECONDS_PER_MINUTE).padStart(2, '0')}`;
  }
  return `${Math.floor(t / SECONDS_PER_MINUTE)}:${String(t % SECONDS_PER_MINUTE).padStart(2, '0')}`;
}

/** 每秒数量 → 每分钟数量；seconds 非正时返回 0，避免 Infinity 进入 UI。 */
export const ratePerMinute = (count: number, seconds: number): number => (seconds > 0 ? (count * SECONDS_PER_MINUTE) / seconds : 0);
