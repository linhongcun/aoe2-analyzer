import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Icon } from '../shared/ui/Icon';
import { Loading } from '../shared/ui/widgets';
import CommandPalette from '../features/search/components/CommandPalette';
import { TOOLS, WIKI, type Section } from './nav/sections';
import FeedbackLink from '../features/feedback/FeedbackLink';
import { appVersion } from '../features/feedback/feedback';
import { DATA_SOURCES, versionLabel } from '../features/about/dataInfo';

const PageMeta = lazy(() => import('../features/share/PageMeta'));

function NavItem({ s, path }: { s: Section; path: string }) {
  return (
    <NavLink to={s.path} className={() => `nitem${s.match.test(path) ? ' on' : ''}`} data-t={s.key}>
      <Icon name={s.icon} />
      {s.label}
    </NavLink>
  );
}

function ToolsMenu({ path }: { path: string }) {
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const ref = useRef<HTMLDivElement>(null);
  const on = TOOLS.some((s) => s.match.test(path));
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpenAt(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenAt(null);
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className="tools" ref={ref}>
      <button type="button" className={`nitem${on ? ' on' : ''}`} aria-expanded={open} aria-controls="tools-menu" onClick={() => setOpenAt(open ? null : path)}>
        工具
        <Icon name="chevron-down" />
      </button>
      <div id="tools-menu" className="tools-panel" hidden={!open}>
        {TOOLS.filter((s) => !s.hideNav).map((s) => (
          <NavItem key={s.key} s={s} path={path} />
        ))}
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [menuAt, setMenuAt] = useState<string | null>(null);
  const menu = menuAt === pathname; // 路由变化后自动收起
  const [cmdk, setCmdk] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdk((v) => !v);
      }
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, []);
  return (
    <>
      <header className="topbar">
        <button className="iconbtn burger" aria-label="菜单" onClick={() => setMenuAt(menu ? null : pathname)}>
          <Icon name={menu ? 'x' : 'menu'} />
        </button>
        <Link to="/" className="brand">
          <Icon name="swords" className="ic hic" /> 帝国时代 II 分析器
        </Link>
        <nav className={menu ? 'mainnav open' : 'mainnav'}>
          <div className="ngroup">
            <NavLink to="/" end className={() => `nitem${pathname === '/' ? ' on' : ''}`} data-t="home">
              <Icon name="home" />
              首页
            </NavLink>
            {WIKI.filter((s) => !s.hideNav).map((s) => (
              <NavItem key={s.key} s={s} path={pathname} />
            ))}
            <ToolsMenu path={pathname} />
          </div>
        </nav>
        <Link to="/about-data" className="verbadge" data-t="version-badge" title="关于数据：来源、固定版本与补丁说明">
          <Icon name="database" />
          <span>数据版本：{versionLabel(DATA_SOURCES)}</span>
        </Link>
        <button className="searchbtn" onClick={() => setCmdk(true)} aria-label="全局搜索">
          <Icon name="search" />
          <span>搜索</span>
          <kbd>Ctrl K</kbd>
        </button>
      </header>
      <main>
        {pathname !== '/' && (
          <div className="fbbar">
            <FeedbackLink compact />
          </div>
        )}
        <Suspense fallback={<Loading />}>{children}</Suspense>
        <Suspense fallback={null}>
          <PageMeta />
        </Suspense>
      </main>
      {cmdk && <CommandPalette open onClose={() => setCmdk(false)} />}
      <footer>
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
        单位/科技/建筑图标与科技树数据来自 <a href="https://github.com/SiegeEngineers/aoe2techtree">SiegeEngineers/aoe2techtree</a>（MIT 代码；图像 ©
        Microsoft）；高清单位/科技/建筑图标来自 <a href="https://github.com/denniske/aoe2companion">denniske/aoe2companion</a>。界面图标：
        <a href="https://lucide.dev">Lucide</a>（ISC 许可，本地打包）。属性/资源图标来自{' '}
        <a href="https://ageofempires.fandom.com/">Age of Empires Fandom Wiki</a>（CC BY-SA；游戏图像 © Microsoft）。DLC 列表与资料片图标来自{' '}
        <a href="https://seicing.com/html/aoe2/index-aoe2.html">seicing.com</a>。文明图标来自{' '}
        <a href="https://github.com/denniske/aoe2companion">denniske/aoe2companion</a>，原始素材 © Microsoft / Age of Empires II。本站为非商业粉丝项目，依据{' '}
        <a href="https://www.xbox.com/en-us/developers/rules">Microsoft 游戏内容使用规则</a> 使用，未获 Microsoft 认可或赞助。
      </footer>
    </>
  );
}
