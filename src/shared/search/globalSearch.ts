/** 页头与顶栏共用 Layout 里的那一套全局搜索，避免各页再做一套结果。 */
type GlobalSearchBinding = {
  open: () => void;
  preload?: () => void;
};

let binding: GlobalSearchBinding | null = null;

export function bindGlobalSearch(next: GlobalSearchBinding) {
  binding = next;
  return () => {
    if (binding === next) binding = null;
  };
}

export function requestGlobalSearch() {
  binding?.open();
}

export function preloadGlobalSearch() {
  binding?.preload?.();
}
