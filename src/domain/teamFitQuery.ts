/** Lightweight URL state: no model, raw units or cross-tool imports. */
import civs from '../data/raw/civs';
export interface TeamFitConfig {
  candidate: string;
  mates: string[];
}
const known = new Set(civs.map((c) => c.en));
const keys = ['v', 'mates', 'candidate'];
export const emptyTeamFit = (): TeamFitConfig => ({ candidate: '', mates: [] });
export function encodeTeamFit(config: TeamFitConfig): string {
  return new URLSearchParams({ v: '1', mates: config.mates.join(','), candidate: config.candidate }).toString();
}
export function decodeTeamFit(search: string): { config: TeamFitConfig; errors: string[]; locked: boolean } {
  const fail = (message: string) => ({ config: emptyTeamFit(), errors: [message], locked: true });
  if (!search || search === '?') return { config: emptyTeamFit(), errors: [], locked: false };
  if (search.length > 4096) return fail('搭配链接过长，请重置后重新选择。');
  try {
    decodeURIComponent(search.replace(/\+/g, ' '));
  } catch {
    return fail('搭配链接编码损坏，请重置后重新选择。');
  }
  const params = new URLSearchParams(search);
  if ([...params.keys()].some((k) => !keys.includes(k)) || keys.some((k) => params.getAll(k).length !== 1)) return fail('搭配链接参数缺失、重复或无法识别。');
  if (params.get('v') !== '1') return fail('搭配链接版本无法识别。');
  const candidate = params.get('candidate')!;
  const mates = params.get('mates') === '' ? [] : params.get('mates')!.split(',');
  if (mates.length > 3 || mates.some((c) => !known.has(c)) || (candidate !== '' && !known.has(candidate))) return fail('搭配链接含未知文明或超过三名队友。');
  return { config: { candidate, mates }, errors: [], locked: false };
}
