export interface FieldErrorTarget {
  key: string;
  fieldId: string;
  errorId: string;
}

function viewportBounds() {
  const topbar = document.querySelector<HTMLElement>('header.topbar');
  const topLimit = (topbar?.getBoundingClientRect().bottom ?? 0) + 4;
  const dock = document.querySelector<HTMLElement>('header.tool-head .tool-head-actions');
  const dockFixed = dock && getComputedStyle(dock).position === 'fixed';
  const visibleBottom = dockFixed ? Math.min(window.innerHeight, dock.getBoundingClientRect().top) : window.innerHeight;
  return { topLimit, visibleBottom };
}

/** 在用户编辑提交 DOM 前记录当前处于顶栏与固定底栏之间可视区的字段 id，避免新错因下推或底栏撑高后误判为离屏。 */
export function captureVisibleFieldIds(fieldIds: readonly string[]): Set<string> {
  const { topLimit, visibleBottom } = viewportBounds();
  const visible = new Set<string>();
  for (const id of fieldIds) {
    const el = document.getElementById(id);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > topLimit && rect.top < visibleBottom) visible.add(id);
  }
  return visible;
}

/** 仅对编辑前已处于可视区、且新渲染错因底边落入底栏或视口底边以下的目标做最小滚动露出。 */
export function revealVisibleFieldErrors(targets: readonly FieldErrorTarget[], visibleBefore: ReadonlySet<string>) {
  if (!targets.length || !visibleBefore.size) return;
  const { topLimit, visibleBottom } = viewportBounds();
  const bottomLimit = visibleBottom - 8;

  let needed = 0;
  let maxScroll = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    if (!visibleBefore.has(target.fieldId)) continue;
    const fieldEl = document.getElementById(target.fieldId);
    const errorEl = document.getElementById(target.errorId);
    if (!fieldEl || !errorEl) continue;
    const fieldRect = fieldEl.getBoundingClientRect();
    const errRect = errorEl.getBoundingClientRect();
    if (errRect.bottom > bottomLimit) {
      maxScroll = Math.min(maxScroll, Math.max(0, Math.floor(fieldRect.top - topLimit)));
      needed = Math.max(needed, Math.ceil(errRect.bottom - bottomLimit));
    }
  }
  const delta = Math.min(needed, maxScroll);
  if (delta > 0 && Number.isFinite(delta)) window.scrollBy(0, delta);
}
