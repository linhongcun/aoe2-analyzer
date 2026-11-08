import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '../../shared/ui/Icon';
import { NavItem } from './NavItem';
import { TOOL_GROUPS, WIKI } from '../../shared/nav/sections';

function isMobileDrawer() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
}
function toolsPath(path: string) {
  return !WIKI.some((s) => !s.hideNav && s.match.test(path)) && TOOL_GROUPS.some((group) => group.sections.some((s) => s.match.test(path)));
}
/** 抽屉上方「百科」已经列出 5 个 wiki 一级入口；抽屉里的工具面板不再重复它们（issue 774）。 */
const WIKI_NAV_KEYS = new Set(WIKI.filter((s) => !s.hideNav).map((s) => s.key));
/** 当前页所在工具组：抽屉里默认只展开这一组。 */
function currentGroupKey(path: string) {
  return TOOL_GROUPS.find((group) => group.sections.some((s) => s.match.test(path)))?.key ?? null;
}
export function ToolsMenu({ path, drawerOpen = false }: { path: string; drawerOpen?: boolean }) {
  // 手机抽屉打开时由 Layout 用 key 重挂载；初始展开当前工具页（issue 316）。桌面 drawerOpen 恒为 false，仍靠点击。
  const [openAt, setOpenAt] = useState<string | null>(() => (drawerOpen && isMobileDrawer() && toolsPath(path) ? path : null));
  const open = openAt === path;
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const on = toolsPath(path);
  const groupKey = currentGroupKey(path);
  useEffect(() => {
    if (!open) return;
    const down = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpenAt(null);
    };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, [open]);
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(panel.current?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? [])].filter((item) => item.getClientRects().length > 0);
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
              const items = [...(panel.current?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? [])].filter((item) => item.getClientRects().length > 0);
              items[last ? items.length - 1 : 0]?.focus();
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
        {TOOL_GROUPS.map((group) => {
          const sections = drawerOpen ? group.sections.filter((s) => !WIKI_NAV_KEYS.has(s.key)) : group.sections;
          if (drawerOpen)
            return (
              // issue 774 抽屉：只默认展开当前页所在组，其余组作为可折叠标题（键盘可用），并跳过与上方「百科」重复的 5 项。
              <details key={group.key} className="tools-group" open={group.key === groupKey}>
                <summary className="tools-group-title" id={`tools-${group.key}`}>
                  {group.title}
                  <Icon name="chevron-down" />
                </summary>
                {sections.map((s) => (
                  <NavItem key={s.key} s={s} path={path} />
                ))}
              </details>
            );
          return (
            <section key={group.key} className="tools-group" aria-labelledby={`tools-${group.key}`}>
              <p className="tools-group-title" id={`tools-${group.key}`}>
                {group.title}
              </p>
              <p>{group.desc}</p>
              {sections.map((s) => (
                <NavItem key={s.key} s={s} path={path} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
