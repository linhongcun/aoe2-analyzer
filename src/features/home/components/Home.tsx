import { type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { civs } from '../../../data';
import { preloadGlobalSearch, requestGlobalSearch } from '../../../shared/search/globalSearch';
import { HOME_GROUPS, WIKI, type Section } from '../../../shared/nav/sections';
import { img } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { HOME_AGE_PICS, HOME_BUILDING_PICS, HOME_EMBLEM_CIVS, HOME_REFERENCE_COPY, HOME_UNIT_PICS } from '../homeReference';
import { hasLegacyStartQuery } from '../legacyStartQuery';
import '../home.css';

function wikiEntry(key: keyof typeof HOME_REFERENCE_COPY): Section {
  const section = WIKI.find((item) => item.key === key);
  if (!section) throw new Error(`缺少资料入口 ${key}`);
  return section;
}

function withNums(text: string): ReactNode[] {
  return text.split(/(\d+(?:\.\d+)?)/g).map((part, index) =>
    /^\d/.test(part) ? (
      <span className="num nw" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function ExampleIcons({ paths, size }: { paths: readonly string[]; size: number }) {
  return (
    <span className="home-examples" aria-hidden="true">
      {paths.map((path) => (
        <img key={path} src={img(path)} alt="" width={size} height={size} />
      ))}
    </span>
  );
}

export default function Home() {
  const { search } = useLocation();
  if (hasLegacyStartQuery(search)) return <Navigate to={{ pathname: '/start', search }} replace />;
  // 顶栏百科里已有首页专用卡的五项不再进下方目录。地图和更新历史没有首页专用卡，仍留在资料目录。
  const featured = new Set(WIKI.filter((section) => !section.hideNav && section.key !== 'maps' && section.key !== 'patches').map((section) => section.key));
  const catalog = HOME_GROUPS.map((group) => ({
    ...group,
    sections: group.sections.filter((section) => !featured.has(section.key)),
  })).filter((group) => group.sections.length > 0);
  const emblems = HOME_EMBLEM_CIVS.flatMap((en) => {
    const found = civs.find((item) => item.en === en);
    return found ? [found.en.toLowerCase()] : [];
  });
  // 四张资料卡同级排列，右上角的数量都从当前数据算出。
  const reference = [
    { key: 'civs', count: civs.length, art: emblems.map((en) => `civs/${en}.webp`), size: 40 },
    { key: 'units', count: __CATALOG_COUNTS__.units, art: HOME_UNIT_PICS.map((pic) => `units/${pic}.webp`), size: 32 },
    { key: 'buildings', count: __CATALOG_COUNTS__.buildings, art: HOME_BUILDING_PICS.map((pic) => `buildings/${pic}.webp`), size: 32 },
    { key: 'techs', count: __CATALOG_COUNTS__.techs, art: HOME_AGE_PICS.map((pic) => `techs/${pic}.webp`), size: 32 },
  ] as const;

  return (
    <section id="home" className="pane home-page">
      <section className="home-mast" aria-labelledby="site-title">
        <p className="home-kicker">资料与计算</p>
        <h1 id="site-title">帝国时代 II 分析器</h1>
        <p className="home-lede">查阅文明、单位与科技，并使用计算工具。</p>
        <button
          type="button"
          className="home-search"
          data-testid="home-search"
          aria-label="全局搜索"
          aria-keyshortcuts="Control+K Meta+K"
          onClick={() => requestGlobalSearch()}
          onPointerEnter={() => preloadGlobalSearch()}
          onFocus={() => preloadGlobalSearch()}
        >
          <Icon name="search" />
          <span>搜索文明、单位、科技、开局…</span>
          <kbd>Ctrl K</kbd>
        </button>
      </section>

      <section className="home-ref" aria-labelledby="home-ref-title">
        <h2 id="home-ref-title">资料</h2>
        <div className="home-ref-grid">
          {reference.map((item) => {
            const entry = wikiEntry(item.key);
            return (
              <Link className="home-ref-card" data-k={item.key} to={entry.path} key={item.key}>
                <span className="home-ref-top">
                  <ExampleIcons paths={item.art} size={item.size} />
                  <span className="home-ref-count num nw">{item.count}</span>
                </span>
                <span className="home-ref-name">{entry.label}</span>
                <span className="home-ref-desc">{HOME_REFERENCE_COPY[item.key]}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="home-catalog" data-testid="home-catalog" aria-labelledby="home-catalog-title">
        <h2 id="home-catalog-title">工具与资料</h2>
        <div className="home-catalog-grid">
          {catalog.map((group) => (
            <section key={group.key} className="home-group" aria-labelledby={`home-${group.key}`}>
              <div className="home-group-head">
                <h3 className="home-group-title" id={`home-${group.key}`}>
                  {group.title}
                </h3>
                <p className="home-group-count">
                  <span className="num nw">{group.sections.length}</span> 项
                </p>
              </div>
              <ul>
                {group.sections.map((section) => (
                  <li key={section.key}>
                    <Link to={section.path}>
                      <span className="home-tool-name">{section.label}</span>
                      <span className="home-tool-about">{withNums(section.desc)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </section>
  );
}
