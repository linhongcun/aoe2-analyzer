import raw from '../content/campaigns.json';

export type CampaignKind = 'tutorial' | 'campaign' | 'historical-battle';
export type CampaignRegion = 'europe' | 'asia' | 'africa' | 'americas';
export type CampaignReleasePack = 'age-of-kings' | 'the-conquerors';
export interface CampaignEvidence {
  sourceIds: string[];
  status: string;
  locator?: string;
  note?: string;
}
export interface CampaignSource {
  title: string;
  kind: string;
  checkedAt: string;
  version: string;
  url?: string;
  publishedAt?: string;
  updatedAt?: string;
  sha256?: string;
}
export interface Campaign {
  id: string;
  nameZh: string;
  nameEn: string;
  aliases: string[];
  kind: CampaignKind;
  modeId: 'aoe2' | 'chronicles' | 'return-of-rome';
  civilizationIds: string[];
  regionIds: CampaignRegion[];
  settingZh: string;
  originalContentPackId: CampaignReleasePack;
  contentPackId: string;
  releaseYear: number | null;
  releaseDate: string | null;
  historicalStartYear: number | null;
  historicalEndYear: number | null;
  swords: 1 | 2 | 3 | null;
  verifiedAt: string;
  fieldEvidence: Record<string, CampaignEvidence>;
}
interface CampaignCatalog {
  schemaVersion: number;
  verifiedAt: string;
  sources: Record<string, CampaignSource>;
  campaigns: Campaign[];
}
export const CAMPAIGN_CATALOG = raw as CampaignCatalog;
export const CAMPAIGNS: readonly Campaign[] = CAMPAIGN_CATALOG.campaigns;
export const CAMPAIGN_REGIONS: Record<CampaignRegion, string> = { europe: '欧洲', asia: '亚洲', africa: '非洲', americas: '美洲' };
export const CAMPAIGN_KINDS: Record<CampaignKind, string> = { tutorial: '教程', campaign: '战役', 'historical-battle': '历史战役' };
export const CAMPAIGN_RELEASE_PACKS: Record<CampaignReleasePack, string> = { 'age-of-kings': '国王时代', 'the-conquerors': '征服者' };
export const CAMPAIGN_QUERY_LIMIT = 100;
export const CAMPAIGN_URL_LIMIT = 4096;

/** Keep invalid semantic values intact so the user can correct the field explicitly. */
export interface CampaignFilters {
  q: string;
  region: string;
  type: string;
  releasePack: string;
  sort: string;
}
export interface CampaignFilterDecode {
  filters: CampaignFilters;
  locked: boolean;
  errors: string[];
  raw: string;
}
export function defaultCampaignFilters(): CampaignFilters {
  return { q: '', region: 'all', type: 'all', releasePack: 'all', sort: 'release' };
}
export function campaignFilterErrors(filters: CampaignFilters): string[] {
  const errors: string[] = [];
  if (filters.q.length > CAMPAIGN_QUERY_LIMIT) errors.push(`搜索名称最多${CAMPAIGN_QUERY_LIMIT}个字符，请缩短后重试。`);
  if ([...filters.q].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) errors.push('搜索名称含控制字符，请删除后重试。');
  try {
    encodeURIComponent(filters.q);
  } catch {
    errors.push('搜索名称编码损坏，请重新输入。');
  }
  if (!['all', ...Object.keys(CAMPAIGN_REGIONS)].includes(filters.region)) errors.push('地区未识别，请重新选择。');
  if (!['all', ...Object.keys(CAMPAIGN_KINDS)].includes(filters.type)) errors.push('类型未识别，请重新选择。');
  if (!['all', ...Object.keys(CAMPAIGN_RELEASE_PACKS)].includes(filters.releasePack)) errors.push('首发内容包未识别，请重新选择。');
  if (!['release', 'history'].includes(filters.sort)) errors.push('排序未识别，请重新选择。');
  return errors;
}
const QUERY_KEYS = ['v', 'q', 'region', 'type', 'releasePack', 'sort'] as const;
/** Bare entry opens defaults. Nonempty links require the complete versioned contract. */
export function decodeCampaignFilters(search: string): CampaignFilterDecode {
  const filters = defaultCampaignFilters();
  const result: CampaignFilterDecode = { filters, locked: false, errors: [], raw: search };
  if (!search || search === '?') return result;
  const fail = (message: string) => ({ ...result, locked: true, errors: [message] });
  if (search.length > CAMPAIGN_URL_LIMIT) return fail('链接过长，目录恢复已暂停。原链接保留，请明确重置后再查找。');
  const query = search.startsWith('?') ? search.slice(1) : search;
  try {
    // URLSearchParams silently repairs malformed UTF-8 and percent escapes; reject those first.
    for (const part of query.split('&')) {
      if (!part || !part.includes('=')) return fail('链接参数结构损坏，目录恢复已暂停。');
      const at = part.indexOf('=');
      decodeURIComponent(part.slice(0, at).replace(/\+/g, ' '));
      decodeURIComponent(part.slice(at + 1).replace(/\+/g, ' '));
    }
  } catch {
    return fail('链接编码损坏，目录恢复已暂停。');
  }
  const params = new URLSearchParams(query);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) return fail('链接包含重复参数，目录恢复已暂停。');
  if (keys.some((key) => !(QUERY_KEYS as readonly string[]).includes(key))) return fail('链接包含未知参数，目录恢复已暂停。');
  if (QUERY_KEYS.some((key) => !params.has(key))) return fail('链接缺少版本或筛选字段，目录恢复已暂停。');
  if (params.get('v') !== '1') return fail('链接版本不受支持，目录恢复已暂停。');
  for (const key of ['q', 'region', 'type', 'releasePack', 'sort'] as const) filters[key] = params.get(key)!;
  result.errors = campaignFilterErrors(filters);
  return result;
}
export function encodeCampaignFilters(filters: CampaignFilters): string {
  const errors = campaignFilterErrors(filters);
  if (errors.length) throw new Error(errors.join(' '));
  return new URLSearchParams({ v: '1', ...filters }).toString();
}
/** Name-only matching: punctuation/spacing variants do not turn input into a regular expression. */
export function normalizeCampaignName(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s·・.\-_'’]/g, '');
}
const compareId = (a: Campaign, b: Campaign) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** issue 314：年份相同时按英文名（nameEn）字母顺序，与页面文案「同一年发行的按英文名字母顺序排列」一致；英文名相同才退回内部 id，保证顺序稳定 */
const compareNameEn = (a: Campaign, b: Campaign) => a.nameEn.localeCompare(b.nameEn, 'en') || compareId(a, b);
function compareYear(a: number | null, b: number | null): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return a - b;
}
/** Original release year and game-covered historical start are intentionally different fields. */
export function filterCampaigns(filters: CampaignFilters, entries: readonly Campaign[] = CAMPAIGNS): Campaign[] {
  if (campaignFilterErrors(filters).length) return [];
  const query = normalizeCampaignName(filters.q.trim());
  return entries
    .filter(
      (entry) =>
        (!query || [entry.nameZh, entry.nameEn, ...entry.aliases].some((name) => normalizeCampaignName(name).includes(query))) &&
        (filters.region === 'all' || entry.regionIds.some((region) => region === filters.region)) &&
        (filters.type === 'all' || entry.kind === filters.type) &&
        (filters.releasePack === 'all' || entry.originalContentPackId === filters.releasePack),
    )
    .sort((a, b) => {
      const years = filters.sort === 'history' ? compareYear(a.historicalStartYear, b.historicalStartYear) : compareYear(a.releaseYear, b.releaseYear);
      return years || compareNameEn(a, b);
    });
}
export function campaignHistoricalRange(entry: Pick<Campaign, 'historicalStartYear' | 'historicalEndYear'>): string {
  const start = entry.historicalStartYear;
  const end = entry.historicalEndYear;
  if (start === null) return end === null ? '未核实' : `起点未核实，止于${end}年`;
  if (end === null) return `${start}年起，终点未核实`;
  return start === end ? `${start}年` : `${start}–${end}年`;
}
export function campaignSwordLabel(swords: Campaign['swords']): string | null {
  return swords === null ? null : `${swords}剑`;
}
/** Small catalogue filters stay in the hash; outer tracking parameters are never copied. */
export function campaignShareUrl(filters: CampaignFilters, base: string): string {
  const url = new URL(base);
  url.pathname = url.pathname.replace(/\/campaigns\/?$/, '/');
  url.search = '';
  url.hash = '/campaigns?' + encodeCampaignFilters(filters);
  return url.href;
}

/** Validate curated data independently of the UI and reject invented zero-sword entries. */
export function campaignCatalogErrors(catalog: Pick<CampaignCatalog, 'sources' | 'campaigns'> = CAMPAIGN_CATALOG): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const entry of catalog.campaigns) {
    if (!entry.id || ids.has(entry.id)) errors.push('条目编号缺失或重复。');
    ids.add(entry.id);
    if (!entry.nameZh || !entry.nameEn) errors.push(`${entry.id}缺少中英文名称。`);
    if (!Object.hasOwn(CAMPAIGN_KINDS, entry.kind)) errors.push(`${entry.id}类型未识别。`);
    if (!['aoe2', 'chronicles', 'return-of-rome'].includes(entry.modeId)) errors.push(`${entry.id}模式未识别。`);
    if (!entry.regionIds.length || entry.regionIds.some((id) => !Object.hasOwn(CAMPAIGN_REGIONS, id))) errors.push(`${entry.id}地区未识别。`);
    if (!Object.hasOwn(CAMPAIGN_RELEASE_PACKS, entry.originalContentPackId) || !entry.contentPackId) errors.push(`${entry.id}内容包未识别。`);
    if (entry.swords !== null && ![1, 2, 3].includes(entry.swords)) errors.push(`${entry.id}剑级无效。`);
    for (const year of [entry.releaseYear, entry.historicalStartYear, entry.historicalEndYear]) {
      if (year !== null && (!Number.isSafeInteger(year) || year === 0)) errors.push(`${entry.id}年份无效。`);
    }
    if (entry.historicalStartYear !== null && entry.historicalEndYear !== null && entry.historicalStartYear > entry.historicalEndYear)
      errors.push(`${entry.id}年代区间颠倒。`);
    for (const field of [
      'nameZh',
      'nameEn',
      'kind',
      'modeId',
      'civilizationIds',
      'regionIds',
      'originalContentPackId',
      'releaseYear',
      'historicalRange',
      'swords',
    ]) {
      if (!entry.fieldEvidence[field]) errors.push(`${entry.id}缺少字段出处。`);
    }
    for (const evidence of Object.values(entry.fieldEvidence)) {
      if (evidence.sourceIds.some((id) => !Object.hasOwn(catalog.sources, id))) errors.push(`${entry.id}引用了未知来源。`);
    }
    if (entry.swords !== null && !entry.fieldEvidence.swords?.sourceIds.length) errors.push(`${entry.id}剑级缺少逐条证据。`);
  }
  return errors;
}
