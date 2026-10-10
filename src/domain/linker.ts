/** 自动链接器：在中文文本中识别单位/科技名称并生成链接片段 */
import type { Tech, Unit } from './types';

export type Segment = { text: string; href?: undefined } | { text: string; href: string; kind: 'unit' | 'tech' };
export interface Linker {
  re: RegExp | null;
  map: Record<string, string>;
}

export function buildLinker(units: Unit[], techs: Tech[]): Linker {
  const map: Record<string, string> = {};
  units
    .filter((u) => u.zh.length >= 2)
    .forEach((u) => {
      if (!map[u.zh] || u.type !== 'UniqueUnit') map[u.zh] = 'unit/' + u.id;
    });
  techs
    .filter((t) => t.zh.length >= 2)
    .forEach((t) => {
      if (!map[t.zh]) map[t.zh] = 'tech/' + t.id;
    });
  const keys = Object.keys(map)
    .sort((a, b) => b.length - a.length)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return { map, re: keys.length ? new RegExp('(' + keys.join('|') + ')', 'g') : null };
}

export function linkify(text: string, L: Linker): Segment[] {
  if (!L.re) return [{ text }];
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(L.re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i) });
    const href = L.map[m[0]]!;
    out.push({ text: m[0], href, kind: href[0] === 't' ? 'tech' : 'unit' });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** 解析“中文名 (说明)｜English”形式的独特科技字段 */
export function findUniqueTech(s: string, civ: string, techs: Tech[]): { tech: Tech; zh: string; rest: string; en: string } | null {
  const i = s.indexOf('｜');
  const en = s.slice(i + 1);
  const tech = techs.find((x) => x.type === 'UniqueTech' && x.en === en && x.civs.includes(civ));
  if (!tech) return null;
  const p = s.indexOf(' (');
  return { tech, zh: s.slice(0, p), rest: s.slice(p, i), en };
}
