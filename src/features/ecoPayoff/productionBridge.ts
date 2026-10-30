import { decodeEcoPayoff, encodeEcoPayoff, type EcoPayoffConfig } from '../../domain/ecoPayoff';
import { mergeNavigationSearch, stripNavigation } from '../../shared/nav/context';

export type PayoffPeople = 'none' | 'theory' | 'adjusted' | 'manual';
export function readPayoffBridge(search: string) {
  const params = new URLSearchParams(stripNavigation(search));
  const values = params.getAll('ctxPeople');
  params.delete('ctxPeople');
  const decoded = decodeEcoPayoff(params.toString());
  const value = values[0];
  const valid = value === 'none' || value === 'theory' || value === 'adjusted' || value === 'manual';
  const people: PayoffPeople | null = values.length ? (valid ? value : 'none') : null;
  const errors = [...decoded.errors];
  if (values.length > 1 || (values.length && !valid)) errors.push('链接中的人数来源无效，请重置后重新选择。');
  return { ...decoded, errors, people };
}
export function writePayoffBridge(config: EcoPayoffConfig, currentSearch: string, people: PayoffPeople | null) {
  const params = new URLSearchParams(encodeEcoPayoff(config));
  if (people) params.set('ctxPeople', people);
  return mergeNavigationSearch(params.toString(), currentSearch);
}
