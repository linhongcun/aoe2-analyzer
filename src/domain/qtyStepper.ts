/** 数量步进边界与非法手工输入恢复纯函数（Issue 1281）。 */

export interface QtyStepBounds {
  min: number;
  max: number;
  step?: number;
}

const STRICT_DECIMAL_RE = /^-?\d+(?:\.\d+)?$/;

function normalizeZero(n: number): number {
  return n === 0 ? 0 : n;
}

/** 仅解析严格十进制有限数；拒绝空串、科学计数法、Infinity、NaN 与带单位文本。 */
export function parseStrictDecimal(raw: string): number | null {
  const trimmed = raw.trim();
  if (!STRICT_DECIMAL_RE.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return normalizeZero(n);
}

function clampInt(n: number, { min, max }: QtyStepBounds): number {
  return normalizeZero(Math.min(max, Math.max(min, Math.trunc(n))));
}

function normalizeStep({ step }: QtyStepBounds): number {
  return step !== undefined && Number.isInteger(step) && step > 1 ? step : 1;
}

function defaultActiveValue(bounds: QtyStepBounds): number {
  const step = normalizeStep(bounds);
  return normalizeZero(Math.min(bounds.max, Math.max(bounds.min, step)));
}

/** 判断指定步进方向是否允许点击（用于按钮 disabled 状态）。 */
export function canStepQuantity(raw: string, delta: -1 | 1, bounds: QtyStepBounds): boolean {
  const trimmed = raw.trim();
  if (trimmed === '') return delta > 0;
  const parsed = parseStrictDecimal(trimmed);
  if (parsed === null) return true;
  if (delta < 0) return parsed > bounds.min;
  return parsed < bounds.max;
}

/** 计算点击减/加按钮后的规范整数字符串；保证恒落在 [min, max] 且永不输出 -0。 */
export function stepQuantity(raw: string, delta: -1 | 1, bounds: QtyStepBounds): string {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return String(delta > 0 ? defaultActiveValue(bounds) : normalizeZero(bounds.min));
  }
  const parsed = parseStrictDecimal(trimmed);
  if (parsed === null) {
    return String(delta > 0 ? defaultActiveValue(bounds) : normalizeZero(bounds.min));
  }
  if (parsed < bounds.min) {
    return String(normalizeZero(bounds.min));
  }
  if (parsed > bounds.max) {
    return String(normalizeZero(bounds.max));
  }
  const step = normalizeStep(bounds);
  if (Number.isInteger(parsed)) {
    const stepped = delta > 0 ? (Math.floor(parsed / step) + 1) * step : (Math.ceil(parsed / step) - 1) * step;
    return String(clampInt(stepped, bounds));
  }
  const stepped = delta < 0 ? Math.floor(parsed / step) * step : Math.ceil(parsed / step) * step;
  return String(clampInt(stepped, bounds));
}
