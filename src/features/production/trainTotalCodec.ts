import { civs } from '../../data';
import { DEFAULT_PRODUCTION, PRODUCTION_LIMIT } from '../../domain/production';
import { TRAIN_TOTAL_DEFAULT_AGE, emptyTrainTotal, type TrainTotalConfig, type TrainTotalRow } from '../../domain/trainTotal';

const KNOWN = new Set(['mode', 'civ', 'age', 'techs', 'units', 'v']);
const LEGACY = ['rows', 'walk', 'farm', 'building'];

export function trainTotalHrefFrom(search: string): string {
  const params = new URLSearchParams(search);
  const query = new URLSearchParams();
  query.set('mode', 'train-total');
  const civ = params.get('civ');
  query.set('civ', civ && civs.some((item) => item.en === civ) ? civ : DEFAULT_PRODUCTION.civ);
  const age = params.get('age');
  query.set('age', age != null && ['1', '2', '3', '4'].includes(age) ? age : String(TRAIN_TOTAL_DEFAULT_AGE));
  return '/production?' + query.toString();
}

export function legacyHrefFromTotal(search: string): string {
  const params = new URLSearchParams(search);
  const query = new URLSearchParams();
  const civ = params.get('civ');
  if (civ && civs.some((item) => item.en === civ)) query.set('civ', civ);
  const age = params.get('age');
  if (age != null && ['1', '2', '3', '4'].includes(age)) query.set('age', age);
  const text = query.toString();
  return text ? '/production?' + text : '/production';
}

export function decodeTrainTotal(search: string): { config: TrainTotalConfig; warnings: string[] } {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const warnings: string[] = [];
  const config = emptyTrainTotal();
  const civ = params.get('civ');
  if (civ != null && civ !== '') config.civ = civs.some((item) => item.en === civ) ? civ : civ;
  if (params.has('age')) {
    const raw = params.get('age') ?? '';
    if (['1', '2', '3', '4'].includes(raw)) config.age = Number(raw);
    else {
      config.age = null;
      config.ageRaw = raw;
    }
  }
  if (params.has('techs') && params.get('techs')) {
    const ids: number[] = [];
    for (const part of params.get('techs')!.split(',')) {
      if (!/^[1-9]\d*$/.test(part)) {
        warnings.push(`科技参数「${part}」无法识别，已忽略。`);
        continue;
      }
      const id = Number(part);
      if (!ids.includes(id)) ids.push(id);
    }
    config.techs = ids;
  }
  if (params.has('units') && params.get('units')) {
    const rows: TrainTotalRow[] = [];
    let overflow = false;
    for (const token of params.get('units')!.split(',')) {
      if (!token) continue;
      const colon = token.indexOf(':');
      const idPart = colon < 0 ? '' : token.slice(0, colon);
      if (colon < 0 || (idPart !== '0' && !/^[1-9]\d*$/.test(idPart))) {
        warnings.push(`单位参数「${token}」无法识别，已忽略。`);
        continue;
      }
      if (rows.length >= PRODUCTION_LIMIT) {
        overflow = true;
        continue;
      }
      rows.push({ unit: Number(idPart), qty: token.slice(colon + 1) });
    }
    if (overflow) warnings.push('训练行超过 12 条，多出来的已忽略。');
    config.rows = rows;
  }
  const leftover = [...params.keys()].filter((key) => !KNOWN.has(key));
  const legacy = leftover.filter((key) => LEGACY.includes(key));
  const other = leftover.filter((key) => !LEGACY.includes(key));
  if (legacy.length)
    warnings.push(`地址里误带了 ${legacy.map((key) => `${key}=${params.get(key) ?? ''}`).join('、')}。这些键不属于训练总价，已忽略，没有当成训练数量。`);
  if (other.length) warnings.push(`地址里还有未使用的参数 ${other.join('、')}，已忽略。`);
  return { config, warnings: [...new Set(warnings)] };
}

export function encodeTrainTotal(config: TrainTotalConfig): string {
  const params = new URLSearchParams();
  params.set('mode', 'train-total');
  params.set('civ', config.civ);
  params.set('age', config.ageRaw != null ? config.ageRaw : String(config.age ?? TRAIN_TOTAL_DEFAULT_AGE));
  if (config.techs.length) params.set('techs', [...new Set(config.techs)].sort((a, b) => a - b).join(','));
  if (config.rows.length) params.set('units', config.rows.map((row) => `${row.unit}:${row.qty}`).join(','));
  return params.toString();
}
