import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { Breadcrumbs } from './layout';
import './toolPageHeader.css';

export type ToolHeadAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: IconName;
  /** 选中后会打开对话框；菜单关闭并把焦点还给「更多」后再执行。 */
  popup?: 'dialog';
};

export type ToolRelatedLink = { to: string; label: string };

function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === 'function') ref(value);
  else (ref as { current: T | null }).current = value;
}

function ToolMoreMenu({ items, triggerRef }: { items: ToolHeadAction[]; triggerRef?: Ref<HTMLButtonElement> }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const focusFirst = () => menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();

  useEffect(() => {
    if (!open) return;
    focusFirst();
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('dialog')) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openMenu = () => {
    if (open) focusFirst();
    else setOpen(true);
  };
  const choose = (action: ToolHeadAction) => {
    setOpen(false);
    buttonRef.current?.focus();
    queueMicrotask(() => action.onClick());
  };
  const onTriggerKey = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMenu();
    }
  };
  const onMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const entries = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    if (!entries.length) return;
    const index = entries.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (event.key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % entries.length;
    else if (event.key === 'ArrowUp') next = index < 0 ? entries.length - 1 : (index - 1 + entries.length) % entries.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = entries.length - 1;
    else if (event.key === 'Tab') {
      setOpen(false);
      return;
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    } else return;
    event.preventDefault();
    entries[next]?.focus();
  };

  return (
    <div className="tool-more" ref={wrapRef}>
      <button
        ref={(node) => {
          buttonRef.current = node;
          setRef(triggerRef, node);
        }}
        type="button"
        className="btn tool-more-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onTriggerKey}
      >
        <Icon name="ellipsis" />
        更多
      </button>
      {open && (
        <div ref={menuRef} id={menuId} className="tool-more-menu" role="menu" aria-label="更多" onKeyDown={onMenuKey}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              aria-haspopup={item.popup}
              onClick={() => choose(item)}
            >
              {item.icon && <Icon name={item.icon} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 一行相关工具。链接热区由 tool-related 样式保证至少 44px。 */
export function RelatedTools({ links, label = '相关工具', flush = false }: { links: ToolRelatedLink[]; label?: string; flush?: boolean }) {
  if (!links.length) return null;
  return (
    <nav className={flush ? 'tool-related tool-related-flush' : 'tool-related'} aria-label={label}>
      <span className="tool-related-label">{label}</span>
      {links.map((link) => (
        <Link key={link.to + link.label} className="tool-related-link" to={link.to}>
          {link.label}
          <Icon name="chevron-right" />
        </Link>
      ))}
    </nav>
  );
}

/** 工具页页头：面包屑或顶栏、左对齐标题、最多两个可见操作，其余收进「更多」。 */
export function ToolPageHeader({
  title,
  titleId,
  description,
  crumb,
  top,
  actions,
  more,
  dock,
  related,
  flush = false,
  className,
  moreTriggerRef,
}: {
  title: string;
  titleId?: string;
  description?: ReactNode;
  /** 面包屑当前页。不传则只到所属栏目。 */
  crumb?: string;
  /** 替换默认面包屑，例如团队分段。 */
  top?: ReactNode;
  actions?: ToolHeadAction[];
  more?: ToolHeadAction[];
  /** 已有 CalcDock，整体放进右侧操作组。 */
  dock?: ReactNode;
  related?: { label?: string; links: ToolRelatedLink[] };
  /** 页面根是带 gap 的 grid 时不再加外边距。 */
  flush?: boolean;
  className?: string;
  moreTriggerRef?: Ref<HTMLButtonElement>;
}) {
  const visible = actions?.length ? actions : [];
  const overflow = more?.length ? more : [];
  const hasActions = Boolean(dock) || visible.length > 0 || overflow.length > 0;
  return (
    <>
      <header className={['tool-head', flush ? 'tool-head-flush' : '', className].filter(Boolean).join(' ')}>
        {top ?? <Breadcrumbs current={crumb} />}
        <div className="tool-head-main">
          <div className="tool-head-copy">
            <h1 id={titleId}>{title}</h1>
            {description != null && description !== '' && <p className="tool-head-desc">{description}</p>}
          </div>
          {hasActions && (
            <div className="tool-head-actions">
              {dock}
              {visible.map((action) => (
                <button key={action.label} type="button" className="btn" disabled={action.disabled} onClick={action.onClick}>
                  {action.icon && <Icon name={action.icon} />}
                  {action.label}
                </button>
              ))}
              {overflow.length > 0 && <ToolMoreMenu items={overflow} triggerRef={moreTriggerRef} />}
            </div>
          )}
        </div>
      </header>
      {related && related.links.length > 0 && <RelatedTools label={related.label} links={related.links} flush={flush} />}
    </>
  );
}
