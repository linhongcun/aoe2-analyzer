import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Icon } from '../shared/ui/Icon';
import { Loading } from '../shared/ui/widgets';
import { WIKI } from './nav/sections';
import { NavItem } from './nav/NavItem';
import { ToolsMenu } from './nav/ToolsMenu';
import FeedbackLink from '../features/feedback/FeedbackLink';
import { appVersion } from '../features/feedback/feedback';
import { DATA_SOURCES, versionLabel } from '../features/about/dataInfo';
import { useTheme } from './theme/useTheme';
import type { ThemePreference } from './theme/theme';
import '../shared/styles/editorial-shell.css';
import '../shared/styles/community-tools.css';

// 全局搜索带着拼音索引、术语表和加成数据，改为第一次打开时才加载，不进首页入口包（issue 280）。
const loadCommandPalette = () => import('../features/search/components/CommandPalette');
const CommandPalette = lazy(loadCommandPalette);

/**
 * 搜索分包加载期间（通常不到一眨眼）先放一个不可见的输入框接住焦点和输入（含输入法），
 * 弹窗出现后把已输入的文字作为初始查询带进去，避免按 Ctrl+K 后立刻输入时丢字（issue 280）。
 */
const HIDDEN: CSSProperties = { position: 'fixed', top: 0, left: 0, width: 1, height: 1, opacity: 0, border: 0, padding: 0 };
function PalettePending({ onType, onClose }: { onType: (value: string) => void; onClose: () => void }) {
  return (
    <input
      autoFocus
      aria-label="全局搜索"
      style={HIDDEN}
      onChange={(e) => onType(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    />
  );
}

/** 外点的默认焦点行为结束后归还触发按钮；新弹窗接管焦点时不抢回。 */
function returnFocusAfterClose(target: HTMLElement | null) {
  requestAnimationFrame(() => {
    const dialogOpen = [...document.querySelectorAll<HTMLElement>('[role="dialog"], dialog[open]')].some((dialog) => dialog.getClientRects().length > 0);
    if (!dialogOpen) target?.focus();
  });
}

const THEME_OPTIONS = [
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'dark', label: '深色', icon: 'moon' },
  { value: 'system', label: '跟随系统', icon: 'monitor' },
] as const;

function ThemeMenu({ preference, onSelect }: { preference: ThemePreference; onSelect: (value: ThemePreference) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const current = THEME_OPTIONS.find((option) => option.value === preference)!;
  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      trigger.current?.focus();
    };
    const pointer = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) {
        setOpen(false);
        const target = event.target instanceof Element ? event.target : null;
        const interactive = target?.closest(
          'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [tabindex], [contenteditable="true"]',
        );
        // 外部按钮/链接保留自身交互与焦点；空白区域关闭才归还触发按钮。
        if (!interactive) returnFocusAfterClose(trigger.current);
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    panel.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    document.addEventListener('pointerdown', pointer);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', pointer);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  const move = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [...(panel.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
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
      className="theme-control"
      ref={wrap}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="iconbtn theme-trigger"
        aria-label={`主题：${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="theme-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={current.icon} />
      </button>
      <div ref={panel} id="theme-menu" className="theme-menu" role="menu" aria-label="外观" hidden={!open} onKeyDown={move}>
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="menuitemradio"
            aria-checked={preference === option.value}
            onClick={() => {
              onSelect(option.value);
              setOpen(false);
              trigger.current?.focus();
            }}
          >
            <Icon name={option.icon} />
            <span>{option.label}</span>
            {preference === option.value && <Icon name="check" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function MobileTheme({ preference, onSelect }: { preference: ThemePreference; onSelect: (value: ThemePreference) => void }) {
  const move = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % options.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + options.length - 1) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else return;
    event.preventDefault();
    const option = THEME_OPTIONS[next];
    if (option) onSelect(option.value);
    options[next]?.focus();
  };
  return (
    <section className="drawer-appearance">
      <h2 id="appearance-label">外观</h2>
      <div className="theme-segments" role="radiogroup" aria-labelledby="appearance-label" onKeyDown={move}>
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            tabIndex={preference === option.value ? 0 : -1}
            aria-checked={preference === option.value}
            onClick={() => onSelect(option.value)}
          >
            <Icon name={option.icon} />
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { preference, select } = useTheme();
  const nav = useRef<HTMLElement>(null);
  const burger = useRef<HTMLButtonElement>(null);
  const [menuAt, setMenuAt] = useState<string | null>(null);
  const menu = menuAt === pathname; // 路由变化后自动收起
  const [cmdk, setCmdk] = useState(false);
  const searchTrigger = useRef<HTMLElement | null>(null);
  const main = useRef<HTMLElement>(null);
  const closeSearch = useCallback(() => setCmdk(false), []);
  // 每次输入都触发重渲染：正在进行的懒加载渲染会以最新文字重来，提交时不丢字。
  const [pendingQuery, setPendingQuery] = useState('');
  const openSearch = useCallback(() => {
    searchTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPendingQuery('');
    setMenuAt(null);
    setCmdk(true);
  }, []);
  useEffect(() => {
    if (cmdk) return;
    const target = searchTrigger.current;
    if (!target) return;
    // 等关闭和路由更新提交后再恢复；页面内的触发元素可能已随导航卸载。
    const frame = requestAnimationFrame(() => {
      if (target.isConnected) target.focus();
      if (target.isConnected && document.activeElement === target && target !== document.body) return;
      // 只在需要兜底时临时让 main 可聚焦，避免平时点击正文把焦点吸到 main 上。
      const fallback = main.current;
      if (!fallback) return;
      fallback.setAttribute('tabindex', '-1');
      fallback.addEventListener('blur', () => fallback.removeAttribute('tabindex'), { once: true });
      fallback.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [cmdk]);
  useEffect(() => {
    if (!menu) return;
    const mobile = window.matchMedia('(max-width: 900px)');
    if (!mobile.matches) return;
    const menuTrigger = burger.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => nav.current?.querySelector<HTMLButtonElement>('.drawer-close')?.focus());
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuAt(null);
      } else if (event.key === 'Tab') {
        const items = [...(nav.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]):not([tabindex="-1"])') ?? [])].filter(
          (item) => item.getClientRects().length > 0,
        );
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const pointer = (event: PointerEvent) => {
      if (!nav.current?.contains(event.target as Node) && !burger.current?.contains(event.target as Node)) setMenuAt(null);
    };
    const resize = () => {
      if (!mobile.matches) setMenuAt(null);
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', pointer);
    mobile.addEventListener('change', resize);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', pointer);
      mobile.removeEventListener('change', resize);
      returnFocusAfterClose(menuTrigger);
    };
  }, [menu]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (cmdk) setCmdk(false);
        else openSearch();
      }
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, [cmdk, openSearch]);
  return (
    <>
      <header className="topbar editorial-topbar">
        <button
          ref={burger}
          type="button"
          className="iconbtn burger"
          aria-label="菜单"
          aria-expanded={menu}
          aria-controls="main-navigation"
          onClick={() => setMenuAt(menu ? null : pathname)}
        >
          <Icon name={menu ? 'x' : 'menu'} />
        </button>
        <Link to="/" className="brand">
          <Icon name="swords" className="ic hic" /> 帝国时代 II 分析器
        </Link>
        {menu && <div className="nav-backdrop" aria-hidden="true" />}
        <nav
          ref={nav}
          id="main-navigation"
          className={menu ? 'mainnav open' : 'mainnav'}
          aria-label="主导航"
          role={menu ? 'dialog' : undefined}
          aria-modal={menu || undefined}
          onClick={(event) => {
            if ((event.target as Element).closest('a[href]')) setMenuAt(null);
          }}
        >
          <div className="drawer-head">
            <span>导航</span>
            <button type="button" className="iconbtn drawer-close" aria-label="关闭菜单" onClick={() => setMenuAt(null)}>
              <Icon name="x" />
            </button>
          </div>
          <div className="ngroup">
            <NavLink to="/" end className={() => `nitem${pathname === '/' ? ' on' : ''}`} data-t="home">
              <Icon name="home" />
              首页
            </NavLink>
            <span className="nav-group-label">百科</span>
            {WIKI.filter((s) => !s.hideNav).map((s) => (
              <NavItem key={s.key} s={s} path={pathname} />
            ))}
            <ToolsMenu path={pathname} />
          </div>
          {menu && <MobileTheme preference={preference} onSelect={select} />}
        </nav>
        <Link to="/about-data" className="verbadge" data-t="version-badge" title="关于数据：来源、固定版本与补丁说明">
          <Icon name="database" />
          <span>数据版本：{versionLabel(DATA_SOURCES)}</span>
        </Link>
        <button
          className="searchbtn"
          onClick={openSearch}
          onPointerEnter={() => void loadCommandPalette()}
          onFocus={() => void loadCommandPalette()}
          aria-label="全局搜索"
        >
          <Icon name="search" />
          <span>搜索</span>
          <kbd>Ctrl K</kbd>
        </button>
        <ThemeMenu preference={preference} onSelect={select} />
      </header>
      <main ref={main}>
        {pathname !== '/' && (
          <div className="fbbar">
            <FeedbackLink compact />
          </div>
        )}
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </main>
      {cmdk && (
        <Suspense fallback={<PalettePending onType={setPendingQuery} onClose={closeSearch} />}>
          <CommandPalette open onClose={closeSearch} initialQuery={pendingQuery} />
        </Suspense>
      )}
      <footer className="editorial-footer">
        <p className="fbfoot">
          <FeedbackLink /> <FeedbackLink kind="feature" /> 发现错误或有功能建议？欢迎在 GitHub 提交（自动附带页面地址与数据版本）。{' '}
          <span className="fmeta" data-t="footer-meta">
            <span className="build-id fitem" data-t="footer-app-version">
              {appVersion()}
            </span>
            {' · '}
            <Link className="fitem" to="/about-data" data-t="footer-version">
              数据版本：{versionLabel(DATA_SOURCES)}
            </Link>
            {' · '}
            <span className="build-id fitem" data-t="footer-build">
              构建 {__BUILD__}
            </span>
          </span>
        </p>
        <p className="note">面向团战排位 · 所有评分（1-10）均为主观近似评分，仅供参考；数据可能随版本补丁变化。</p>
        <details className="footer-sources">
          <summary>资料来源与使用声明</summary>
          <div>
            单位/科技/建筑图标与科技树数据来自 <a href="https://github.com/SiegeEngineers/aoe2techtree">SiegeEngineers/aoe2techtree</a>（MIT 代码；图像 ©
            Microsoft）；高清单位/科技/建筑图标来自 <a href="https://github.com/denniske/aoe2companion">denniske/aoe2companion</a>。界面图标：
            <a href="https://lucide.dev">Lucide</a>（ISC 许可，本地打包）。属性/资源图标来自{' '}
            <a href="https://ageofempires.fandom.com/">Age of Empires Fandom Wiki</a>（CC BY-SA；游戏图像 © Microsoft）。DLC 列表与资料片图标来自{' '}
            <a href="https://seicing.com/html/aoe2/index-aoe2.html">seicing.com</a>。文明图标来自{' '}
            <a href="https://github.com/denniske/aoe2companion">denniske/aoe2companion</a>，原始素材 © Microsoft / Age of Empires II。本站为非商业粉丝项目，依据{' '}
            <a href="https://www.xbox.com/en-us/developers/rules">Microsoft 游戏内容使用规则</a> 使用，未获 Microsoft 认可或赞助。
          </div>
        </details>
      </footer>
    </>
  );
}
