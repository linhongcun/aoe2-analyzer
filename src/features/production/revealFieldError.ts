export interface FieldErrorTarget {
  key: string;
  fieldId: string;
  errorId: string;
}

/** 仅当出错控件自身处于顶栏与固定底栏之间的可视区、且新渲染的错因底边被底栏或视口底边遮挡时做最小滚动露出。 */
export function revealVisibleFieldErrors(targets: readonly FieldErrorTarget[]) {
  if (!targets.length) return;
  const topbar = document.querySelector<HTMLElement>('header.topbar');
  const topLimit = (topbar?.getBoundingClientRect().bottom ?? 0) + 4;
  const dock = document.querySelector<HTMLElement>('header.tool-head .tool-head-actions');
  const dockFixed = dock && getComputedStyle(dock).position === 'fixed';
  const visibleBottom = dockFixed ? Math.min(window.innerHeight, dock.getBoundingClientRect().top) : window.innerHeight;
  const bottomLimit = visibleBottom - 8;

  let needed = 0;
  let maxScroll = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const fieldEl = document.getElementById(target.fieldId);
    const errorEl = document.getElementById(target.errorId);
    if (!fieldEl || !errorEl) continue;
    const fieldRect = fieldEl.getBoundingClientRect();
    const errRect = errorEl.getBoundingClientRect();
    if (fieldRect.bottom <= topLimit || fieldRect.top >= visibleBottom) continue;
    if (errRect.bottom > bottomLimit) {
      needed = Math.max(needed, Math.ceil(errRect.bottom - bottomLimit));
      maxScroll = Math.min(maxScroll, Math.max(0, Math.floor(fieldRect.top - topLimit)));
    }
  }
  const delta = Math.min(needed, maxScroll);
  if (delta > 0 && Number.isFinite(delta)) window.scrollBy(0, delta);
}
