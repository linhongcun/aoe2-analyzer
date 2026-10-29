import { civs } from '../../data';

export const TRAIN_COMPARE_UNITS = [38, 283, 569] as const;
export const TRAIN_COMPARE_ENTRY = '/production?mode=train-compare&v=1&unit=38&age=3&n=10';
export interface TrainCompareConfig {
  unit: number;
  age: 3;
  n: number;
  /** null means an initial default, resolved from actual availability after loading. */
  civs: string[] | null;
}
export const orderedCivs = (selected: readonly string[]) => civs.filter((civ) => selected.includes(civ.en)).map((civ) => civ.en);
export function trainCompareErrors(config: TrainCompareConfig): string[] {
  const errors: string[] = [];
  if (!(TRAIN_COMPARE_UNITS as readonly number[]).includes(config.unit)) errors.push('本轮仅支持骑士、重装骑士和游侠形态，其它单位不支持。');
  if (config.age !== 3) errors.push('本轮仅支持城堡时代。');
  if (!Number.isSafeInteger(config.n) || config.n < 1 || config.n > 1000) errors.push('目标数量须为 1–1000 的整数。');
  if (config.civs?.some((name) => !civs.some((civ) => civ.en === name))) errors.push('文明集合含未知文明。');
  return errors;
}
export function decodeTrainCompare(search: string): { config: TrainCompareConfig | null; errors: string[] } {
  const params = new URLSearchParams(search),
    errors: string[] = [];
  try {
    decodeURIComponent(search.replace(/\+/g, ' '));
  } catch {
    errors.push('对照链接编码损坏。');
  }
  const required = ['mode', 'v', 'unit', 'age', 'n'];
  for (const key of params.keys()) if (![...required, 'civs'].includes(key)) errors.push(`对照链接含未知参数 ${key}。`);
  for (const key of required) if (params.getAll(key).length !== 1) errors.push(`对照参数 ${key} 缺失或重复。`);
  if (params.getAll('civs').length > 1) errors.push('对照参数 civs 重复。');
  if (params.get('mode') !== 'train-compare') errors.push('对照模式不支持。');
  if (params.get('v') !== '1') errors.push('对照链接版本不支持。');
  if (!/^(38|283|569)$/.test(params.get('unit') ?? '')) errors.push('请求的单位形态不支持。');
  if (params.get('age') !== '3') errors.push('本轮仅支持城堡时代。');
  if (!/^[1-9]\d*$/.test(params.get('n') ?? '')) errors.push('目标数量格式无效。');
  const selected = params.has('civs') ? (params.get('civs') === '' ? [] : params.get('civs')!.split(',')) : null;
  const config: TrainCompareConfig = { unit: Number(params.get('unit')), age: 3, n: Number(params.get('n')), civs: selected };
  errors.push(...trainCompareErrors(config));
  return { config: errors.length ? null : { ...config, civs: selected === null ? null : orderedCivs(selected) }, errors: [...new Set(errors)] };
}
export function encodeTrainCompare(config: TrainCompareConfig): string {
  const errors = trainCompareErrors(config);
  if (config.civs === null) errors.push('请先加载并确认默认文明集合。');
  if (errors.length) throw new Error(errors.join(' '));
  return new URLSearchParams({
    mode: 'train-compare',
    v: '1',
    unit: String(config.unit),
    age: '3',
    n: String(config.n),
    civs: orderedCivs(config.civs!).join(','),
  }).toString();
}
