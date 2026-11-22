export const CHUNK_RELOAD_STORAGE_KEY = 'aoe2-chunk-reload';
export const CHUNK_RELOAD_WINDOW_MS = 30_000;

export interface ReloadStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ChunkReloadRecord {
  path: string;
  ts: number;
}

export type ChunkReloadState = 'none' | 'already-retried' | 'storage-unavailable';

export type ChunkReloadDecision =
  { shouldReload: true; reason: 'first-attempt'; path: string } | { shouldReload: false; reason: 'already-retried' | 'storage-unavailable'; path: string };

const CHUNK_ERROR_PATTERNS: readonly RegExp[] = [
  /ChunkLoadError/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Unable to preload CSS/i,
  /Loading (?:CSS )?chunk [\w-]+ failed/i,
];

/** 归一化 hash 路由地址，保留查询参数；空或仅 # 统一记作 #/。 */
export function normalizeHashPath(hash: string): string {
  const trimmed = hash.trim();
  if (!trimmed || trimmed === '#') return '#/';
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

/** 识别 Vite / 浏览器动态 import 与分包加载失败错误。 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  let name = '';
  let message = '';
  if (typeof error === 'string') {
    message = error;
  } else if (typeof error === 'object') {
    const rec = error as { name?: unknown; message?: unknown };
    if (typeof rec.name === 'string') name = rec.name;
    if (typeof rec.message === 'string') message = rec.message;
  }
  if (name === 'ChunkLoadError') return true;
  const combined = `${name} ${message}`.trim();
  if (!combined) return false;
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(combined));
}

function parseReloadRecord(raw: string | null): ChunkReloadRecord | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { path, ts } = parsed as { path?: unknown; ts?: unknown };
    if (typeof path !== 'string' || typeof ts !== 'number' || !Number.isFinite(ts)) return null;
    return { path: normalizeHashPath(path), ts };
  } catch {
    return null;
  }
}

function isActiveRetryRecord(record: ChunkReloadRecord | null, path: string, now: number): boolean {
  if (!record || record.path !== path) return false;
  const elapsed = now - record.ts;
  return elapsed >= 0 && elapsed < CHUNK_RELOAD_WINDOW_MS;
}

/** 只读检查当前路径在短时间窗口内是否已自动重载过，或存储不可用。 */
export function readChunkReloadState(storage: ReloadStorageLike | null | undefined, hash: string, now = Date.now()): ChunkReloadState {
  if (!storage) return 'storage-unavailable';
  const path = normalizeHashPath(hash);
  try {
    const record = parseReloadRecord(storage.getItem(CHUNK_RELOAD_STORAGE_KEY));
    return isActiveRetryRecord(record, path, now) ? 'already-retried' : 'none';
  } catch {
    return 'storage-unavailable';
  }
}

/**
 * 判定遇到分包加载失败时是否允许执行一次安全重载。
 * 同路径在 30 秒内只自动重载 1 次；存储不可用时安全降级为不重载，由错误边界兜底。
 */
export function decideChunkReload(storage: ReloadStorageLike | null | undefined, hash: string, now = Date.now()): ChunkReloadDecision {
  const path = normalizeHashPath(hash);
  if (!storage) return { shouldReload: false, reason: 'storage-unavailable', path };
  try {
    const record = parseReloadRecord(storage.getItem(CHUNK_RELOAD_STORAGE_KEY));
    if (isActiveRetryRecord(record, path, now)) {
      return { shouldReload: false, reason: 'already-retried', path };
    }
    storage.setItem(CHUNK_RELOAD_STORAGE_KEY, JSON.stringify({ path, ts: now }));
    return { shouldReload: true, reason: 'first-attempt', path };
  } catch {
    return { shouldReload: false, reason: 'storage-unavailable', path };
  }
}

/**
 * 清理自动重载标记：
 * - 不传 hash 时无条件清理（用户手动点击刷新或返回首页）；
 * - 传入当前 hash 时，仅清理已过期、损坏或属于其他路径的旧标记；
 *   当前路径处于 30 秒防循环窗口内的活跃标记必须保留，防止路由壳/元数据提交后、页内嵌套懒加载分包继续 404 时陷入死循环。
 */
export function clearChunkReloadMarker(storage: ReloadStorageLike | null | undefined, hash?: string, now = Date.now()): boolean {
  if (!storage) return false;
  try {
    if (hash === undefined) {
      storage.removeItem(CHUNK_RELOAD_STORAGE_KEY);
      return true;
    }
    const raw = storage.getItem(CHUNK_RELOAD_STORAGE_KEY);
    if (raw === null) return false;
    const record = parseReloadRecord(raw);
    const path = normalizeHashPath(hash);
    if (!record || record.path !== path || now - record.ts >= CHUNK_RELOAD_WINDOW_MS || now - record.ts < 0) {
      storage.removeItem(CHUNK_RELOAD_STORAGE_KEY);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** 生成简洁的单行排障摘要，避免向玩家暴露冗长堆栈。 */
export function formatErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name.trim() || 'Error';
    const firstLine = (error.message || '').split(/\r?\n/)[0]?.trim() ?? '';
    return firstLine ? `${name}: ${firstLine}` : `${name}: 未知渲染异常`;
  }
  if (typeof error === 'string') {
    const firstLine = error.split(/\r?\n/)[0]?.trim() ?? '';
    return firstLine || '未知渲染异常';
  }
  if (error && typeof error === 'object') {
    const rec = error as { name?: unknown; message?: unknown };
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    const msg = typeof rec.message === 'string' ? (rec.message.split(/\r?\n/)[0]?.trim() ?? '') : '';
    if (name && msg) return `${name}: ${msg}`;
    if (msg) return msg;
    if (name) return `${name}: 未知渲染异常`;
  }
  return '未知渲染异常';
}
