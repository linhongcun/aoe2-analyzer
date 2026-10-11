import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Icon } from '../shared/ui/Icon';
import { Loading } from '../shared/ui/widgets';
import CommandPalette from '../features/search/components/CommandPalette';
import { TOOLS, WIKI, type Section } from './nav/sections';
import FeedbackLink from '../features/feedback/FeedbackLink';

function NavGroup({ title, items, path }: { title: string; items: Section[]; path: string }) {
  return (
    <div className="ngroup">
      <span className="nlabel">{title}</span>
      {items.map((s) => (
        <NavLink key={s.key} to={s.path} className={() => `nitem${s.match.test(path) ? ' on' : ''}${s.status ? ' planned' : ''}`} data-t={s.key}>
          <Icon name={s.icon} />
          {s.label}
          {s.status && <small className="soon">规划中</small>}
        </NavLink>
      ))}
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
          <NavGroup title="百科" items={WIKI.filter((s) => !s.hideNav)} path={pathname} />
          <NavGroup title="工具" items={TOOLS.filter((s) => !s.hideNav)} path={pathname} />
        </nav>
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
      </main>
      {cmdk && <CommandPalette open onClose={() => setCmdk(false)} />}
      <footer>
        <p className="fbfoot">
          <FeedbackLink /> 发现数值或内容错误？欢迎在 GitHub 提交（自动附带页面地址与数据版本）。
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
