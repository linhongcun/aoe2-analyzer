import raw from '../content/game-guide.json';

export const GAME_GUIDE_CARD_IDS = ['goal', 'roles', 'resources', 'ages', 'counters', 'watching'] as const;
export type GameGuideCardId = (typeof GAME_GUIDE_CARD_IDS)[number];
export const GAME_GUIDE_CONTEXTS = {
  standard: '通用黑暗时代开局',
  nomad: '游牧开局',
  'empire-wars': '帝国战争',
  'special-civ': '文明特殊开局',
  campaign: '战役或自制场景',
} as const;
export const GAME_GUIDE_VICTORIES = { conquest: '征服', other: '其他胜利设置', unknown: '胜利设置未知' } as const;
export type GameGuideContext = keyof typeof GAME_GUIDE_CONTEXTS;
export type GameGuideVictory = keyof typeof GAME_GUIDE_VICTORIES;
export interface GameGuideState {
  card: GameGuideCardId;
  context: GameGuideContext;
  victory: GameGuideVictory;
}
export interface GameGuideSource {
  title: string;
  url: string;
  kind: string;
  checkedAt: string;
  publishedAt: string | null;
  version: string;
  locator: string;
  note: string;
}
export interface GameGuideCard {
  id: GameGuideCardId;
  title: string;
  shortTitle: string;
  summary: string;
  paragraphs: string[];
  example: string;
  question: string;
  answer: string;
  boundary: string;
  sourceIds: string[];
  links: { label: string; to: string }[];
}
interface GameGuideCatalog {
  schemaVersion: number;
  checkedAt: string;
  dataVersion: string;
  scope: string;
  sources: Record<string, GameGuideSource>;
  cards: GameGuideCard[];
}
export const GAME_GUIDE_CATALOG = raw as GameGuideCatalog;
export const GAME_GUIDE_CARDS: readonly GameGuideCard[] = GAME_GUIDE_CATALOG.cards;
export const GAME_GUIDE_URL_LIMIT = 1024;
const KEYS = ['v', 'card', 'context', 'victory'] as const;
export function defaultGameGuideState(): GameGuideState {
  return { card: 'goal', context: 'standard', victory: 'conquest' };
}
export function gameGuideStateErrors(state: GameGuideState): string[] {
  const errors: string[] = [];
  if (!(GAME_GUIDE_CARD_IDS as readonly string[]).includes(state.card)) errors.push('入门卡片未识别。');
  if (!Object.hasOwn(GAME_GUIDE_CONTEXTS, state.context)) errors.push('开局或模式未识别。');
  if (!Object.hasOwn(GAME_GUIDE_VICTORIES, state.victory)) errors.push('胜利设置未识别。');
  return errors;
}
/** Bare entry has explicit defaults; every nonempty link must carry the full v1 contract. */
export function decodeGameGuideState(search: string): { state: GameGuideState; errors: string[]; raw: string } {
  const fallback = defaultGameGuideState();
  const fail = (error: string) => ({ state: fallback, errors: [error], raw: search });
  if (!search || search === '?') return { state: fallback, errors: [], raw: search };
  if (search.length > GAME_GUIDE_URL_LIMIT) return fail('链接过长，入门卡片恢复已暂停。');
  const query = search.startsWith('?') ? search.slice(1) : search;
  try {
    // URLSearchParams repairs malformed percent escapes/UTF-8, so validate them before parsing.
    for (const part of query.split('&')) {
      const at = part.indexOf('=');
      if (at < 1) return fail('链接参数结构无效，入门卡片恢复已暂停。');
      decodeURIComponent(part.slice(0, at).replace(/\+/g, ' '));
      decodeURIComponent(part.slice(at + 1).replace(/\+/g, ' '));
    }
  } catch {
    return fail('链接编码无效，入门卡片恢复已暂停。');
  }
  const params = new URLSearchParams(query);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) return fail('链接含重复参数，入门卡片恢复已暂停。');
  if (keys.some((key) => !(KEYS as readonly string[]).includes(key))) return fail('链接含未知参数，入门卡片恢复已暂停。');
  if (KEYS.some((key) => !params.has(key)) || params.get('v') !== '1') return fail('链接版本不支持或字段不完整，入门卡片恢复已暂停。');
  const state = { card: params.get('card'), context: params.get('context'), victory: params.get('victory') } as GameGuideState;
  const errors = gameGuideStateErrors(state);
  return { state, errors, raw: search };
}
export function encodeGameGuideState(state: GameGuideState): string {
  const errors = gameGuideStateErrors(state);
  if (errors.length) throw new Error(errors.join(' '));
  return new URLSearchParams({ v: '1', ...state }).toString();
}
export function gameGuideScope(state: GameGuideState): { supported: boolean; reasons: string[] } {
  const errors = gameGuideStateErrors(state);
  if (errors.length) return { supported: false, reasons: errors };
  const reasons: string[] = [];
  if (state.context !== 'standard') reasons.push(`${GAME_GUIDE_CONTEXTS[state.context]}的起始配置与规则暂未纳入这组六卡，不能沿用通用开局示例。`);
  if (state.victory !== 'conquest') reasons.push(`${GAME_GUIDE_VICTORIES[state.victory]}暂未覆盖；请先查本局房间、战役目标或赛事设置，不能用征服示例代替。`);
  return { supported: reasons.length === 0, reasons };
}
export function gameGuideShareUrl(state: GameGuideState, base: string): string {
  const root = new URL(base);
  root.pathname = root.pathname.replace(/\/game-guide\/(?:index\.html)?$/, '/').replace(/\/index\.html$/, '/');
  const url = new URL('./game-guide/', root);
  url.search = encodeGameGuideState(state);
  url.hash = '';
  if (url.href.length > GAME_GUIDE_URL_LIMIT) throw new Error('分享地址过长，未生成链接。');
  return url.href;
}
export function gameGuideCatalogErrors(catalog: GameGuideCatalog = GAME_GUIDE_CATALOG): string[] {
  const errors: string[] = [];
  if (catalog.schemaVersion !== 1 || catalog.dataVersion !== 'DE185872') errors.push('资料版本未识别。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(catalog.checkedAt) || !catalog.scope) errors.push('资料范围或核对日期缺失。');
  if (catalog.cards.map((card) => card.id).join('|') !== GAME_GUIDE_CARD_IDS.join('|')) errors.push('六卡清单、顺序或编号无效。');
  for (const card of catalog.cards) {
    if ([card.title, card.shortTitle, card.summary, card.example, card.question, card.answer, card.boundary].some((text) => !text?.trim()))
      errors.push(`${card.id}缺少正文、例子、自查或边界。`);
    if (card.paragraphs.length < 2 || card.paragraphs.some((text) => !text.trim())) errors.push(`${card.id}解释不完整。`);
    if (!card.sourceIds.length || new Set(card.sourceIds).size !== card.sourceIds.length) errors.push(`${card.id}来源缺失或重复。`);
    for (const id of card.sourceIds) if (!Object.hasOwn(catalog.sources, id)) errors.push(`${card.id}引用了未收录的来源。`);
    if (!card.links.length || card.links.some((link) => !link.label || !/^\/[a-z][a-z/-]*$/.test(link.to))) errors.push(`${card.id}细节链接无效。`);
  }
  for (const source of Object.values(catalog.sources)) {
    if (!/^https:\/\//.test(source.url) || !source.title || !source.kind || !source.version || !source.locator || !source.note) errors.push('来源信息不完整。');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source.checkedAt)) errors.push('来源核对日期缺失。');
    if (source.publishedAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(source.publishedAt)) errors.push('来源发布日期无效。');
  }
  return errors;
}
