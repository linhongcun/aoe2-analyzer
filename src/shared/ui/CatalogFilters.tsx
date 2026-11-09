import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import './catalog-filters.css';

/** 搜索与结果数常驻；手机收起次要条件，桌面使用同一份表单。 */
export default function CatalogFilters({
  search,
  children,
  count,
  active,
  dirty,
  onReset,
  secondary,
  activeSummary,
}: {
  search: ReactNode;
  children: ReactNode;
  count: ReactNode;
  active: number;
  dirty: boolean;
  onReset: () => void;
  secondary?: ReactNode;
  activeSummary?: string;
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const focusedInPanel = useRef(false);
  useEffect(() => {
    const media = matchMedia('(max-width: 600px)');
    const trackFocus = (event: FocusEvent) => {
      focusedInPanel.current = content.current?.contains(event.target as Node) ?? false;
    };
    const change = () => {
      if (media.matches && !open && (focusedInPanel.current || content.current?.contains(document.activeElement))) toggle.current?.focus();
    };
    document.addEventListener('focusin', trackFocus);
    media.addEventListener('change', change);
    window.addEventListener('resize', change);
    return () => {
      document.removeEventListener('focusin', trackFocus);
      media.removeEventListener('change', change);
      window.removeEventListener('resize', change);
    };
  }, [open]);
  return (
    <div
      className={`bar fbar catalog-filters${secondary ? ' has-secondary' : ''}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented && open && matchMedia('(max-width: 600px)').matches) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      {search}
      <button ref={toggle} type="button" className="catalog-filter-toggle" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>
        <Icon name="filter" /> 筛选{active > 0 ? `（${active}）` : ''}
      </button>
      <div ref={content} id={panel} className="catalog-filter-panel" data-open={open ? 'true' : 'false'}>
        {children}
        {secondary && <div className="catalog-filter-secondary">{secondary}</div>}
      </div>
      <span className="catalog-count note" role="status" aria-live="polite">
        {count}
      </span>
      {dirty && (
        <button
          type="button"
          className="catalog-filter-reset"
          onClick={(event) => {
            onReset();
            event.currentTarget.closest('.catalog-filters')?.querySelector('input')?.focus();
          }}
        >
          清空筛选
        </button>
      )}
      {activeSummary && <p className="catalog-filter-active">已选：{activeSummary}</p>}
    </div>
  );
}
