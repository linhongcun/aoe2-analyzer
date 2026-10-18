import { useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

/** 搜索与结果数常驻；手机收起次要条件，桌面使用同一份表单。 */
export default function CatalogFilters({
  search,
  children,
  count,
  active,
  dirty,
  onReset,
}: {
  search: ReactNode;
  children: ReactNode;
  count: ReactNode;
  active: number;
  dirty: boolean;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <div
      className="bar fbar catalog-filters"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open && matchMedia('(max-width: 600px)').matches) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      {search}
      <button ref={toggle} type="button" className="catalog-filter-toggle" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>
        <Icon name="filter" /> 筛选{active > 0 ? `（${active}）` : ''}
      </button>
      <div id={panel} className="catalog-filter-panel" data-open={open ? 'true' : 'false'}>
        {children}
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
    </div>
  );
}
