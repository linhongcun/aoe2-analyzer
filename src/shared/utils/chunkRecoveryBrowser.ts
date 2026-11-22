import { decideChunkReload, normalizeHashPath, type ReloadStorageLike } from '../../domain/chunkRecovery';

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
 * 首次命中时阻止默认抛错并安全刷新以拉取新版本资源；已重试或存储不可用时放行给 ErrorBoundary 渲染中文恢复页。
 */
export function installPreloadErrorRecovery(win: Window = window, reload: () => void = () => win.location.reload()): () => void {
  const onPreloadError = (event: Event) => {
    const decision = decideChunkReload(getSafeSessionStorage(win), getCurrentHashPath(win));
    if (decision.shouldReload) {
      event.preventDefault();
      reload();
    }
  };
  win.addEventListener('vite:preloadError', onPreloadError);
  return () => win.removeEventListener('vite:preloadError', onPreloadError);
}
