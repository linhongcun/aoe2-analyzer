/** Issue 237: explicit clock arithmetic, independent of all game simulation models. */
export type GameClockDirection = 'game-to-real' | 'real-to-game';
export type GameClockUnit = 'seconds' | 'minutes';
export interface GameClockConfig {
  direction: GameClockDirection;
  unit: GameClockUnit;
  duration: string;
  ratio: string;
}
export const GAME_CLOCK_DURATION_LIMIT = 100000000;
export const GAME_CLOCK_RATIO_LIMIT = 1000;
export const GAME_CLOCK_RESULT_LIMIT = Number.MAX_SAFE_INTEGER;
export const GAME_CLOCK_QUERY_LIMIT = 1024;
const TEXT_LIMIT = 64;
const decimal = /^\d+(?:\.\d+)?$/;
const clock = /^(\d+):([0-5]\d)(?:\.(\d+))?$/;

export function defaultGameClockConfig(): GameClockConfig {
  return { direction: 'game-to-real', unit: 'minutes', duration: '10:00', ratio: '1' };
}

export type GameClockDuration = { ok: true; seconds: number; whole: number; fraction: string } | { ok: false; error: string };

/** Preserve the lexical fractional part so changing input units never rounds it. */
export function parseGameClockDuration(value: string, unit: GameClockUnit): GameClockDuration {
  if (!value) return { ok: false, error: '请填写时长；零时长可以填写 0 或 0:00。' };
  if (value.length > TEXT_LIMIT) return { ok: false, error: '时长文本过长，请保留不超过 64 个字符。' };
  let whole: number;
  let fraction: string;
  if (unit === 'seconds') {
    if (!decimal.test(value)) return { ok: false, error: '秒数须为非负十进制数字，不使用负号、指数或单位文字。' };
    const [integer, part = ''] = value.split('.');
    whole = Number(integer);
    fraction = part;
  } else {
    const match = clock.exec(value);
    if (!match) return { ok: false, error: '请按“分:秒”填写，例如 10:00 或 0:05.5；秒位为 00–59。' };
    whole = Number(match[1]) * 60 + Number(match[2]);
    fraction = match[3] ?? '';
  }
  const seconds = Number(`${whole}${fraction ? '.' + fraction : ''}`);
  if (!Number.isFinite(seconds) || whole > GAME_CLOCK_DURATION_LIMIT || (whole === GAME_CLOCK_DURATION_LIMIT && /[1-9]/.test(fraction)))
    return { ok: false, error: '时长最多为 100000000 秒，请缩短输入时长。' };
  return { ok: true, seconds, whole, fraction };
}

export type GameClockResult =
  { ok: false; errors: string[] } | { ok: true; inputSeconds: number; outputSeconds: number; ratio: number; gameSeconds: number; realSeconds: number };

export function gameClockRatioError(value: string): string | null {
  const ratio = Number(value);
  return !value || value.length > TEXT_LIMIT || !decimal.test(value) || !Number.isFinite(ratio) || ratio <= 0 || ratio > GAME_CLOCK_RATIO_LIMIT
    ? '倍率须为大于 0、不超过 1000 的有限十进制数字，不使用指数写法。'
    : null;
}

export function calculateGameClock(config: GameClockConfig): GameClockResult {
  const errors: string[] = [];
  if (!['game-to-real', 'real-to-game'].includes(config.direction)) errors.push('换算方向无效。');
  if (!['seconds', 'minutes'].includes(config.unit)) errors.push('输入单位无效。');
  const duration = parseGameClockDuration(config.duration, config.unit);
  if (!duration.ok) errors.push(duration.error);
  const ratio = Number(config.ratio);
  const ratioError = gameClockRatioError(config.ratio);
  if (ratioError) errors.push(ratioError);
  if (errors.length || !duration.ok) return { ok: false, errors };
  const outputSeconds = config.direction === 'game-to-real' ? duration.seconds / ratio : duration.seconds * ratio;
  if (!Number.isFinite(outputSeconds) || outputSeconds > GAME_CLOCK_RESULT_LIMIT)
    return { ok: false, errors: ['换算结果超出可准确显示的范围，请缩短时长或调整倍率。'] };
  return {
    ok: true,
    inputSeconds: duration.seconds,
    outputSeconds,
    ratio,
    gameSeconds: config.direction === 'game-to-real' ? duration.seconds : outputSeconds,
    realSeconds: config.direction === 'game-to-real' ? outputSeconds : duration.seconds,
  };
}

export function changeGameClockUnit(config: GameClockConfig, unit: GameClockUnit): { config: GameClockConfig; error: string | null } {
  if (unit === config.unit) return { config: { ...config }, error: null };
  const duration = parseGameClockDuration(config.duration, config.unit);
  if (!duration.ok) return { config, error: '先修正时长，再切换单位；原输入已保留。' };
  const fraction = duration.fraction ? '.' + duration.fraction : '';
  const value =
    unit === 'seconds' ? String(duration.whole) + fraction : Math.floor(duration.whole / 60) + ':' + String(duration.whole % 60).padStart(2, '0') + fraction;
  if (value.length > TEXT_LIMIT) return { config, error: '换写后的时长超过 64 个字符，请缩短小数位；原输入已保留。' };
  return { config: { ...config, unit, duration: value }, error: null };
}

/** Rounded display only; original inputs and arithmetic retain their precision. */
export function gameClockMinutes(seconds: number): string {
  const rounded = Math.round(seconds);
  return Math.floor(rounded / 60).toLocaleString('zh-CN', { useGrouping: false }) + ':' + String(rounded % 60).padStart(2, '0');
}

/** Keep very small positive durations visible rather than displaying a false zero. */
export function gameClockSeconds(seconds: number): string {
  if (seconds > 0 && seconds < 0.000001) return seconds.toExponential(5);
  return seconds.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
}

export function encodeGameClock(config: GameClockConfig): string {
  return new URLSearchParams({ v: '1', direction: config.direction, unit: config.unit, duration: config.duration, ratio: config.ratio }).toString();
}

/** Structural URL errors stay locked until explicit reset. Numeric drafts remain editable. */
export function decodeGameClock(search: string): { config: GameClockConfig; errors: string[] } {
  const config = defaultGameClockConfig();
  if (!search || search === '?') return { config, errors: [] };
  const fail = (message: string) => ({ config, errors: [message] });
  if (search.length > GAME_CLOCK_QUERY_LIMIT) return fail('换算链接过长，请重置后重新填写。');
  if (/%(?![0-9a-f]{2})/i.test(search)) return fail('换算链接编码损坏，请重置。');
  const params = new URLSearchParams(search);
  const keys = ['v', 'direction', 'unit', 'duration', 'ratio'];
  for (const [key, value] of params) {
    if (!keys.includes(key) || params.getAll(key).length !== 1) return fail('换算链接含未知或重复参数，请重置。');
    if (value.includes('\uFFFD') || value.length > TEXT_LIMIT) return fail('换算链接包含损坏或过长的输入，请重置。');
  }
  if (keys.some((key) => !params.has(key))) return fail('换算链接缺少必要参数，请重置。');
  if (params.get('v') !== '1') return fail('换算链接版本不受支持，请重置。');
  const direction = params.get('direction');
  const unit = params.get('unit');
  if (direction !== 'game-to-real' && direction !== 'real-to-game') return fail('换算链接方向无效，请重置。');
  if (unit !== 'seconds' && unit !== 'minutes') return fail('换算链接单位无效，请重置。');
  return { config: { direction, unit, duration: params.get('duration')!, ratio: params.get('ratio')! }, errors: [] };
}

/** Context links always carry game seconds; callers never apply a speed multiplier. */
export function gameClockHref(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > GAME_CLOCK_DURATION_LIMIT) return null;
  let duration = String(seconds);
  // Convert scientific notation lexically, retaining the original finite number.
  if (duration.includes('e')) {
    const [coefficient = '', exponent = '0'] = duration.split('e');
    const [whole = '', fraction = ''] = coefficient.split('.');
    const digits = whole + fraction;
    const at = whole.length + Number(exponent);
    duration =
      at <= 0 ? '0.' + '0'.repeat(-at) + digits : at >= digits.length ? digits + '0'.repeat(at - digits.length) : digits.slice(0, at) + '.' + digits.slice(at);
  }
  if (duration.length > TEXT_LIMIT) return null;
  return '/game-clock?' + encodeGameClock({ direction: 'game-to-real', unit: 'seconds', duration, ratio: '1' });
}
