import { decideChunkReload, normalizeHashPath, type ReloadStorageLike } from '../../domain/chunkRecovery';

const markedPreloadErrors = new WeakSet<object>();

/** 记录经 Vite vite:preloadError 上报的原始错误对象，便于错误边界与未捕获拒绝识别。 */
export function markPreloadError(error: unknown): void {
  if (typeof error === 'object' && error !== null) {
    markedPreloadErrors.add(error);
  }
}

/** 判断错误是否曾由 Vite vite:preloadError 上报（不受浏览器本地化文案限制）。 */
export function isMarkedPreloadError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && markedPreloadErrors.has(error);
}

/** 安全读取 sessionStorage，在隐私模式或禁用存储时绝不二次抛错。 */
export function getSafeSessionStorage(win: Window | undefined = typeof window !== 'undefined' ? window : undefined): ReloadStorageLike | null {
  if (!win) return null;
  try {
    return win.sessionStorage;
  } catch {
    return null;
  }
}

/** 获取当前浏览器 hash 路径（保留查询参数）。 */
export function getCurrentHashPath(win: Window | undefined = typeof window !== 'undefined' ? window : undefined): string {
  if (!win) return '#/';
  try {
    return normalizeHashPath(win.location.hash);
  } catch {
    return '#/';
  }
}

/**
 * 监听 Vite 分包预加载失败事件（Issue 1278）：
 * - 当事件携带 payload 时，仅标记该错误并放行由调用方接管：
 *   1) 业务页面自带 `.catch()` 的数据分包加载（如 useCoreTrees、圣物收益、阵容搭配、时间线等）按既有职责在页内提示与局部重试，不强行刷新整页；
 *   2) 未由业务捕获的 `React.lazy()` 路由/组件分包错误直达 ErrorBoundary，执行同路径 30s 单次自动重载或降级到中文恢复界面；
 *   3) React 树外的未捕获动态 import 拒绝由 `unhandledrejection` 兜底触发单次重载。
 * - 当事件不带 payload（直接派发的 `vite:preloadError` 信号）时，立即按单次防循环规则安全重载。
 */
export function installPreloadErrorRecovery(
  win: Window = window,
  reload: () => void = () => win.location.reload(),
  getStorage: () => ReloadStorageLike | null = () => getSafeSessionStorage(win),
): () => void {
  const tryReload = (event: Event) => {
    const decision = decideChunkReload(getStorage(), getCurrentHashPath(win));
    if (decision.shouldReload) {
      event.preventDefault();
      reload();
    }
  };
  const onPreloadError = (event: Event) => {
    const payload = (event as Event & { payload?: unknown }).payload;
    if (payload !== undefined) {
      markPreloadError(payload);
      return;
    }
    tryReload(event);
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (isMarkedPreloadError(event.reason)) {
      tryReload(event);
    }
  };
  win.addEventListener('vite:preloadError', onPreloadError);
  win.addEventListener('unhandledrejection', onUnhandledRejection);
  return () => {
    win.removeEventListener('vite:preloadError', onPreloadError);
    win.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
