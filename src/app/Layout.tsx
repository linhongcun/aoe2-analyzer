import { Suspense, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../shared/ui/Icon';
import { Loading } from '../shared/ui/widgets';

const TABS: [string, string, RegExp][] = [
  ['list', '文明分析', /^\/(list|civ\/.*)?$/],
  ['units', '单位', /^\/units?(\/.*)?$/],
  ['techs', '科技', /^\/techs?(\/.*)?$/],
  ['tree', '科技树', /^\/tree(\/.*)?$/],
  ['dlc', 'DLC/版本', /^\/dlc$/],
  ['compare', '文明对比', /^\/compare$/],
  ['matchup', '对局助手', /^\/matchup$/],
];

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const known = TABS.some(([, , re]) => re.test(pathname));
  return (
    <>
      <header>
        <h1>
          <Icon name="swords" className="ic hic" /> 帝国时代 II 决定版 · 分析器 <Icon name="swords" className="ic hic flip" />
        </h1>
        <div className="note">
          面向团战排位 · 所有评分（1-10）均为主观近似评分，仅供参考；文明数据来源：SiegeEngineers/aoe2techtree（2026-10 抓取）；数据可能随版本补丁变化
        </div>
      </header>
      <nav>
        {TABS.map(([t, n, re]) => (
          <button
            key={t}
            data-t={t === 'dlc' ? 'dlcs' : t}
            className={re.test(pathname) || (!known && t === 'list') ? 'on' : undefined}
            onClick={() => nav('/' + t)}
          >
            {n}
          </button>
        ))}
      </nav>
      <main>
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </main>
      <footer>
        单位/科技/建筑图标与科技树数据来自 <a href="https://github.com/SiegeEngineers/aoe2techtree">SiegeEngineers/aoe2techtree</a>（MIT 代码；图像 ©
        Microsoft）。界面图标：<a href="https://lucide.dev">Lucide</a>（ISC 许可，本地打包）。属性/资源图标来自{' '}
        <a href="https://ageofempires.fandom.com/">Age of Empires Fandom Wiki</a>（CC BY-SA；游戏图像 © Microsoft）。DLC 列表与资料片图标来自{' '}
        <a href="https://seicing.com/html/aoe2/index-aoe2.html">seicing.com</a>。文明图标来自{' '}
        <a href="https://github.com/denniske/aoe2companion">denniske/aoe2companion</a>，原始素材 © Microsoft / Age of Empires II。本站为非商业粉丝项目，依据{' '}
        <a href="https://www.xbox.com/en-us/developers/rules">Microsoft 游戏内容使用规则</a> 使用，未获 Microsoft 认可或赞助。文明数据：
        <a href="https://github.com/SiegeEngineers/aoe2techtree">SiegeEngineers/aoe2techtree</a>。
      </footer>
    </>
  );
}
