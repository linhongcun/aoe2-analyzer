import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '../../shared/ui/Icon';
import { NavItem } from './NavItem';
import { TOOL_GROUPS, WIKI } from './sections';

export function ToolsMenu({ path }: { path: string }) {
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const on = !WIKI.some((s) => !s.hideNav && s.match.test(path)) && TOOL_GROUPS.some((group) => group.sections.some((s) => s.match.test(path)));
  useEffect(() => {
    if (!open) return;
    const down = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpenAt(null);
    };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, [open]);
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(panel.current?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLAnchorElement);
    let next: number;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (index + items.length - 1) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    items[next]?.focus();
  };
  return (
    <div
      className="tools"
      ref={ref}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenAt(null);
      }}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setOpenAt(null);
          trigger.current?.focus();
        }
      }}
    >
      <button
        type="button"
        ref={trigger}
        className={`nitem${on ? ' on' : ''}`}
        aria-expanded={open}
        aria-controls="tools-menu"
        onClick={() => setOpenAt(open ? null : path)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpenAt(path);
            const last = event.key === 'ArrowUp';
            requestAnimationFrame(() => {
              const items = panel.current?.querySelectorAll<HTMLAnchorElement>('a[href]');
              items?.[last ? items.length - 1 : 0]?.focus();
            });
          }
        }}
      >
        工具
        <Icon name="chevron-down" />
      </button>
      <div
        ref={panel}
        id="tools-menu"
        className="tools-panel"
        hidden={!open}
        onKeyDown={move}
        onClick={(event) => {
          if ((event.target as Element).closest('a[href]')) {
            setOpenAt(null);
            trigger.current?.focus();
          }
        }}
      >
        {TOOL_GROUPS.map((group) => (
          <section key={group.key} className="tools-group" aria-labelledby={`tools-${group.key}`}>
            <p className="tools-group-title" id={`tools-${group.key}`}>
              {group.title}
            </p>
            <p>{group.desc}</p>
            {group.sections.map((s) => (
              <NavItem key={s.key} s={s} path={path} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
