/** Verified original links only; no per-civilization ranking has been extracted. */
export interface ProSource {
  readonly id: string;
  readonly kind: 'original-video';
  readonly authorId: string;
  readonly author: string;
  readonly originalTitle: string;
  readonly originalUrl: string;
  readonly discoveryUrl: string;
  readonly publishedAt: null;
  readonly gamePatch: null;
  readonly mapScope: null;
  readonly checkedAt: string;
}

export const PRO_SOURCES: readonly ProSource[] = [
  {
    id: 'hera-civilizations-2026-10-29',
    kind: 'original-video',
    authorId: 'hera',
    author: 'Hera',
    originalTitle: 'I Ranked All 56 Civilizations in Age of Empires 2',
    originalUrl: 'https://www.youtube.com/watch?v=AaxJADJGjvU',
    discoveryUrl: 'https://ageofnews.com/en/aoe2/2026-10-25/',
    publishedAt: null,
    gamePatch: null,
    mapScope: null,
    checkedAt: '2026-10-29',
  },
];

type ProSourcesState = { status: 'ready'; sources: readonly ProSource[] } | { status: 'empty' } | { status: 'unavailable' };
const fields = ['id', 'kind', 'authorId', 'author', 'originalTitle', 'originalUrl', 'discoveryUrl', 'publishedAt', 'gamePatch', 'mapScope', 'checkedAt'];
const identifier = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value === value.trim();

function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function supportedUrl(value: unknown, original: boolean): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || value !== url.href) return false;
    if (original) {
      return (
        ['www.youtube.com', 'youtube.com'].includes(url.hostname) &&
        url.pathname === '/watch' &&
        url.searchParams.size === 1 &&
        /^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get('v') ?? '')
      );
    }
    const match = /^\/en\/aoe2\/(\d{4}-\d{2}-\d{2})\/$/.exec(url.pathname);
    return url.hostname === 'ageofnews.com' && !url.search && !!match && date(match[1]);
  } catch {
    return false;
  }
}

function source(value: unknown): value is ProSource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === fields.length &&
    fields.every((field) => Object.hasOwn(record, field)) &&
    text(record.id) &&
    identifier.test(record.id) &&
    record.kind === 'original-video' &&
    text(record.authorId) &&
    identifier.test(record.authorId) &&
    text(record.author) &&
    text(record.originalTitle) &&
    supportedUrl(record.originalUrl, true) &&
    supportedUrl(record.discoveryUrl, false) &&
    record.publishedAt === null &&
    record.gamePatch === null &&
    record.mapScope === null &&
    date(record.checkedAt)
  );
}

/** Reject the complete malformed catalogue instead of publishing a partial, misleading card. */
export function readProSources(catalogue: unknown): ProSourcesState {
  if (!Array.isArray(catalogue)) return { status: 'unavailable' };
  const sources = Array.from(catalogue);
  if (!sources.every(source) || new Set(sources.map((item) => item.id)).size !== sources.length) {
    return { status: 'unavailable' };
  }
  return sources.length ? { status: 'ready', sources } : { status: 'empty' };
}
