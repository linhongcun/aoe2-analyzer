import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';

export interface JumpTarget {
  bid: number;
  name: string;
  kind?: string;
}

const OPEN_EVENT = 'aoe2-tree-jump-open';

/** 单按钮列表：方向键只移动活动项；Enter、空格或点选才交给调用方滚动。 */
export function JumpToBuilding({ targets, status, onConfirm }: { targets: readonly JumpTarget[]; status: string; onConfirm: (bid: number) => void }) {
  const listId = useId();
  const fieldRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onOther = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== listId) setOpen(false);
    };
    document.addEventListener(OPEN_EVENT, onOther);
    return () => document.removeEventListener(OPEN_EVENT, onOther);
  }, [listId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!fieldRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const option = list?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
    if (!list || !option) return;
    // 只改列表自身的 scrollTop，避免 scrollIntoView 带动页面或 iframe 祖先。
    const listRect = list.getBoundingClientRect();
    const optRect = option.getBoundingClientRect();
    if (optRect.bottom > listRect.bottom) list.scrollTop += optRect.bottom - listRect.bottom;
    else if (optRect.top < listRect.top) list.scrollTop -= listRect.top - optRect.top;
  }, [open, active]);

  const optionId = (bid: number) => `${listId}-opt-${bid}`;
  const openMenu = (index: number) => {
    document.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: listId }));
    setActive(targets.length ? Math.min(Math.max(index, 0), targets.length - 1) : 0);
    setOpen(true);
  };
  const closeMenu = (focus: boolean) => {
    setOpen(false);
    if (focus) buttonRef.current?.focus();
  };
  const confirmAt = (index: number) => {
    const target = targets[index];
    if (!target) return;
    closeMenu(true);
    onConfirm(target.bid);
  };
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        openMenu(event.key === 'ArrowUp' ? targets.length - 1 : 0);
      }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      if (!targets.length) return;
      if (event.key === 'ArrowDown') setActive((index) => (index + 1) % targets.length);
      else if (event.key === 'ArrowUp') setActive((index) => (index - 1 + targets.length) % targets.length);
      else if (event.key === 'Home') setActive(0);
      else setActive(targets.length - 1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      confirmAt(active);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    }
  };
  const onButtonClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0) return;
    if (open) closeMenu(false);
    else openMenu(active);
  };

  return (
    <div className="tjump-field" ref={fieldRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className="tjump-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && targets[active] ? optionId(targets[active].bid) : undefined}
        aria-label="跳到建筑。定位当前这棵科技树已有的建筑列，不是筛选。方向键只移动列表中的项；Enter、空格或点选确认后才滚动这棵树。Escape 取消，不滚动。"
        onClick={onButtonClick}
      >
        跳到建筑
      </button>
      <ul ref={listRef} id={listId} className="tjump-list" role="listbox" aria-label="当前这棵树已有的建筑列" hidden={!open}>
        {targets.map((target, index) => (
          <li
            key={target.bid}
            id={optionId(target.bid)}
            role="option"
            aria-selected={open && index === active}
            data-bid={target.bid}
            className={open && index === active ? 'is-active' : undefined}
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => confirmAt(index)}
          >
            <span className="tjump-opt-name">{target.name}</span>
            {target.kind ? <span className="tjump-opt-kind">{target.kind}</span> : null}
          </li>
        ))}
      </ul>
      <span className="tjump-status" aria-live="polite">
        {status}
      </span>
    </div>
  );
}
