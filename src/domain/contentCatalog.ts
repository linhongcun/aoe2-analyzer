import raw from '../content/contentCatalog.json';

export const CONTENT_MODES = {
  all: '全部模式',
  aoe2: '常规 AoE2',
  'return-of-rome': 'Return of Rome',
  chronicles: 'Chronicles 编年史',
  appearance: '玩家外观',
  audio: '游戏外音乐',
  graphics: '画质素材',
} as const;
export const CONTENT_KINDS = {
  all: '全部内容',
  civilizations: '文明',
  campaigns: '战役',
  scenarios: '单人剧本',
  cosmetics: '动态头像',
  soundtrack: '原声音乐',
  graphics: '高清画质',
} as const;
export const CONTENT_ACQUISITIONS = {
  'base-game': '本体',
  'included-with-base': '当前本体已包含',
  'paid-add-on': '另购',
  'free-download': '免费可选下载',
  unverified: '暂未核实',
} as const;
export type ContentMode = Exclude<keyof typeof CONTENT_MODES, 'all'>;
export type ContentKind = Exclude<keyof typeof CONTENT_KINDS, 'all'>;
export type ContentAcquisition = keyof typeof CONTENT_ACQUISITIONS;
export type ContentEvidenceStatus = 'verified' | 'unverified' | 'stale' | 'conflict';
export interface ContentEvidence {
  id: string;
  url: string;
  title: string;
  verifiedAt: string;
  publishedAt?: string;
  status: ContentEvidenceStatus;
  note: string;
}
export interface ContentName {
  id: string;
  en: string;
  zh?: string;
  siteCivEn?: string;
}
export interface ContentBlock {
  mode: ContentMode;
  kind: ContentKind;
  summary: string;
  names: ContentName[];
  count?: number;
  scenarioCount?: number;
  sourceIds: string[];
}
export interface ContentProduct {
  id: string;
  steamAppId: number;
  zh: string;
  en: string;
  releaseDate: string;
  acquisition: { kind: ContentAcquisition; sourceIds: string[] };
  prerequisites: { productIds: string[]; status: ContentEvidenceStatus; note?: string; sourceIds: string[] };
  includedProductIds?: string[];
  includedProductSourceIds?: string[];
  historicalReleaseIndex?: number;
  contents: ContentBlock[];
  sources: ContentEvidence[];
  modeNotes?: string[];
  modeNotesSourceIds?: string[];
  translationNote?: string;
  verificationNotes?: string[];
}
export interface ContentCatalog {
  schemaVersion: number;
  platform: string;
  verifiedAt: string;
  region: string;
  scope: string;
  baseProductId: string;
  products: ContentProduct[];
}
export const contentCatalog = raw as ContentCatalog;
export const contentProducts = contentCatalog.products;
export const contentProductById = (id: string) => contentProducts.find((product) => product.id === id);

/** Unknown enum strings remain editable after URL restoration; invalid states produce no results. */
export interface ContentGuideState {
  q: string;
  mode: string;
  kind: string;
  pack: string;
}
export const CONTENT_QUERY_LIMIT = 200;
export const CONTENT_URL_LIMIT = 4096;
export const defaultContentGuide = (): ContentGuideState => ({ q: '', mode: 'all', kind: 'all', pack: 'all' });
const own = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);
export function contentGuideErrors(state: ContentGuideState): string[] {
  const errors: string[] = [];
  if (Array.from(state.q).length > CONTENT_QUERY_LIMIT) errors.push(`搜索词最多${CONTENT_QUERY_LIMIT}个字符，请缩短后继续。`);
  if (!own(CONTENT_MODES, state.mode)) errors.push(`模式“${state.mode}”暂未支持，请重新选择。`);
  if (!own(CONTENT_KINDS, state.kind)) errors.push(`内容类型“${state.kind}”暂未支持，请重新选择。`);
  if (state.pack !== 'all' && !contentProductById(state.pack)) errors.push(`商品“${state.pack}”暂未收录，请重新选择。`);
  return errors;
}
export function encodeContentGuide(state: ContentGuideState): string {
  return new URLSearchParams({ v: '1', q: state.q, mode: state.mode, kind: state.kind, pack: state.pack }).toString();
}
export function decodeContentGuide(search: string): { state: ContentGuideState; errors: string[]; blocked: boolean } {
  const fail = (message: string) => ({ state: defaultContentGuide(), errors: [message], blocked: true });
  if (!search || search === '?') return { state: defaultContentGuide(), errors: [], blocked: false };
  if (search.length > CONTENT_URL_LIMIT) return fail('内容导航链接超长，未恢复筛选。请保留原链接或显式重置。');
  const query = search.startsWith('?') ? search.slice(1) : search;
  try {
    decodeURIComponent(query.replace(/\+/g, ' '));
  } catch {
    return fail('内容导航链接编码损坏，未恢复筛选。请显式重置。');
  }
  const params = new URLSearchParams(query);
  const keys = ['v', 'q', 'mode', 'kind', 'pack'];
  if ([...params.keys()].some((key) => !keys.includes(key) || params.getAll(key).length !== 1))
    return fail('内容导航链接含未知或重复参数，未恢复筛选。请显式重置。');
  // Campaign links carry only a stable product ID. Generated share links carry the complete versioned state.
  const packOnly = [...params.keys()].length === 1 && params.has('pack');
  if (!packOnly && (params.get('v') !== '1' || keys.some((key) => !params.has(key))))
    return fail('内容导航链接版本不支持或参数不完整，未恢复筛选。请显式重置。');
  const state = packOnly
    ? { ...defaultContentGuide(), pack: params.get('pack')! }
    : { q: params.get('q')!, mode: params.get('mode')!, kind: params.get('kind')!, pack: params.get('pack')! };
  return { state, errors: contentGuideErrors(state), blocked: false };
}
export function contentGuideShareUrl(state: ContentGuideState, base: string): string {
  const errors = contentGuideErrors(state);
  if (errors.length) throw new Error(errors.join(' '));
  const url = new URL('./content-guide/', base);
  url.search = encodeContentGuide(state);
  url.hash = '';
  if (url.href.length > CONTENT_URL_LIMIT) throw new Error('分享链接超长，未生成；请缩短搜索词。');
  return url.href;
}
const normalized = (text: string) => text.normalize('NFKC').toLocaleLowerCase().trim();
/** Both facets must match one block, never a cross-product of a product's modes and kinds. */
export function matchingContentBlocks(product: ContentProduct, state: ContentGuideState): ContentBlock[] {
  return product.contents.filter((block) => (state.mode === 'all' || block.mode === state.mode) && (state.kind === 'all' || block.kind === state.kind));
}
export function filterContentProducts(state: ContentGuideState, products: readonly ContentProduct[] = contentProducts): ContentProduct[] {
  if (contentGuideErrors(state).length) return [];
  const query = normalized(state.q);
  return products.filter((product) => {
    if (state.pack !== 'all' && state.pack !== product.id) return false;
    const blocks = matchingContentBlocks(product, state);
    if (!blocks.length) return false;
    return (
      !query ||
      normalized(`${product.zh} ${product.en}`).includes(query) ||
      blocks.some((block) => normalized(`${block.summary} ${block.names.map((name) => `${name.zh ?? ''} ${name.en}`).join(' ')}`).includes(query))
    );
  });
}
export function contentEvidenceState(product: ContentProduct, sourceIds: readonly string[]): ContentEvidenceStatus {
  if (!sourceIds.length) return 'unverified';
  const statuses = sourceIds.map((id) => product.sources.find((source) => source.id === id)?.status ?? 'unverified');
  if (statuses.includes('conflict')) return 'conflict';
  if (statuses.includes('stale')) return 'stale';
  return statuses.every((status) => status === 'verified') ? 'verified' : 'unverified';
}
export function contentAcquisitionLabel(product: ContentProduct): string {
  return contentEvidenceState(product, product.acquisition.sourceIds) === 'verified'
    ? CONTENT_ACQUISITIONS[product.acquisition.kind]
    : CONTENT_ACQUISITIONS.unverified;
}
export function contentPrerequisiteLabel(product: ContentProduct): string {
  if (product.prerequisites.status !== 'verified' || contentEvidenceState(product, product.prerequisites.sourceIds) !== 'verified') return '前置条件暂未核实';
  if (!product.prerequisites.productIds.length) return '本体商品，无其他前置';
  return product.prerequisites.productIds.map((id) => (id === 'base' ? '需 Steam 版决定版本体' : `需 ${contentProductById(id)?.zh ?? id}`)).join('；');
}
export function contentIncludedProductsLabel(product: ContentProduct): string | null {
  if (!product.includedProductIds?.length) return null;
  if (contentEvidenceState(product, product.includedProductSourceIds ?? []) !== 'verified') return '本体包含关系暂未核实，请到 Steam 确认。';
  return `本体购买项已包含：${product.includedProductIds.map((id) => contentProductById(id)?.zh ?? id).join('、')}。`;
}
/** Fail closed before making entitlement claims with the hand-maintained directory. */
export function validateContentCatalog(catalog: ContentCatalog = contentCatalog): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const apps = new Set<number>();
  if (catalog.schemaVersion !== 1 || catalog.platform !== 'steam') errors.push('目录版本或平台不支持。');
  for (const product of catalog.products) {
    if (ids.has(product.id) || apps.has(product.steamAppId)) errors.push(`${product.id}：商品身份重复。`);
    ids.add(product.id);
    apps.add(product.steamAppId);
    if (!own(CONTENT_ACQUISITIONS, product.acquisition.kind)) errors.push(`${product.id}：获取状态无效。`);
    const sourceIds = new Set(product.sources.map((source) => source.id));
    if (sourceIds.size !== product.sources.length) errors.push(`${product.id}：来源ID重复。`);
    for (const source of product.sources) {
      if (!/^https:\/\/(?:store\.steampowered\.com|www\.ageofempires\.com|support\.ageofempires\.com)\//.test(source.url))
        errors.push(`${product.id}：来源必须为官方HTTPS页面。`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(source.verifiedAt) || !source.note.trim()) errors.push(`${product.id}：来源缺少核对日期或证据说明。`);
    }
    for (const block of product.contents) {
      if (!own(CONTENT_MODES, block.mode) || !own(CONTENT_KINDS, block.kind)) errors.push(`${product.id}：内容分类无效。`);
      for (const name of block.names) {
        if (!name.id.startsWith(`${block.mode}:`)) errors.push(`${product.id}：内容身份缺少模式。`);
        if (name.siteCivEn && block.mode !== 'aoe2') errors.push(`${product.id}：古代模式不能链接常规文明。`);
      }
    }
    for (const id of [
      ...product.acquisition.sourceIds,
      ...product.prerequisites.sourceIds,
      ...(product.includedProductSourceIds ?? []),
      ...(product.modeNotesSourceIds ?? []),
      ...product.contents.flatMap((block) => block.sourceIds),
    ])
      if (!sourceIds.has(id)) errors.push(`${product.id}：来源引用${id}不存在。`);
  }
  const byId = new Map(catalog.products.map((product) => [product.id, product]));
  if (!byId.has(catalog.baseProductId)) errors.push('目录本体商品缺失。');
  for (const product of catalog.products) {
    for (const id of [...product.prerequisites.productIds, ...(product.includedProductIds ?? [])])
      if (!byId.has(id) || id === product.id) errors.push(`${product.id}：商品关系无效。`);
    const visit = (id: string, seen: Set<string>): boolean => {
      if (seen.has(id)) return true;
      const next = new Set(seen).add(id);
      return (byId.get(id)?.prerequisites.productIds ?? []).some((dependency) => visit(dependency, next));
    };
    if (visit(product.id, new Set())) errors.push(`${product.id}：前置关系成环。`);
    if (product.acquisition.kind === 'included-with-base' && !byId.get(catalog.baseProductId)?.includedProductIds?.includes(product.id))
      errors.push(`${product.id}：本体包含关系缺少对应记录。`);
  }
  return errors;
}
