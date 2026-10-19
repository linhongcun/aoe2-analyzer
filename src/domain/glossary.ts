import raw from '../content/glossary.json';
import { search, withSearchPy, type SearchItem } from './search';

export interface GlossaryTerm {
  id: string;
  zh: string;
  en: string;
  aliases: string[];
  meaning: string;
  example: string;
  note: string;
  links: { label: string; href: string }[];
  sources: { title: string; url: string; date: string }[];
}
export const glossary: readonly GlossaryTerm[] = raw;
export const termById = (id: string) => glossary.find((term) => term.id === id);
export const glossarySearchItems: SearchItem[] = glossary.map((term) =>
  withSearchPy({ kind: 'term', id: term.id, zh: term.zh, en: term.en, aliases: term.aliases, href: `/glossary/${term.id}`, sub: term.meaning, late: true }),
);
export function findTerms(query: string): readonly GlossaryTerm[] {
  if (!query.trim()) return glossary;
  const ids = search(glossarySearchItems, query, glossary.length).map((item) => item.id);
  return ids.map((id) => termById(id)!);
}
