import { type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { civs } from '../../../data';
import { preloadGlobalSearch, requestGlobalSearch } from '../../../shared/search/globalSearch';
import { HOME_GROUPS, WIKI, type Section } from '../../../shared/nav/sections';
import { img } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { HOME_AGE_PICS, HOME_BUILDING_PIC, HOME_EMBLEM_CIVS, HOME_REFERENCE_COPY, HOME_TECH_PIC, HOME_UNIT_PICS } from '../homeReference';
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
  // 顶栏百科里已有首页专用卡的五项不再进下方目录。地图回到顶栏后仍留在目录，首页没有地图专用卡。
  const featured = new Set(WIKI.filter((section) => !section.hideNav && section.key !== 'maps').map((section) => section.key));
  const catalog = HOME_GROUPS.map((group) => ({
    ...group,
    sections: group.sections.filter((section) => !featured.has(section.key)),
  })).filter((group) => group.sections.length > 0);
  const civ = wikiEntry('civs');
  const units = wikiEntry('units');
  const tree = wikiEntry('tree');
  const buildings = wikiEntry('buildings');
  const techs = wikiEntry('techs');
  const emblems = HOME_EMBLEM_CIVS.flatMap((en) => {
    const found = civs.find((item) => item.en === en);
    return found ? [found.en.toLowerCase()] : [];
  });

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
        <div className="home-ref-compose">
          <Link className="home-civ" to={civ.path}>
            <span className="home-civ-copy">
              <span className="home-ref-title">{civ.label}</span>
              <span className="home-ref-desc">{HOME_REFERENCE_COPY.civs}</span>
              <span className="home-go">
                浏览全部文明 <Icon name="arrow-right" />
              </span>
            </span>
            <ExampleIcons paths={emblems.map((en) => `civs/${en}.webp`)} size={52} />
          </Link>
          <div className="home-ref-side">
            <Link className="home-ref-row" to={units.path}>
              <span className="home-ref-copy">
                <span className="home-ref-name">{units.label}</span>
                <span className="home-ref-desc">{HOME_REFERENCE_COPY.units}</span>
              </span>
              <ExampleIcons paths={HOME_UNIT_PICS.map((pic) => `units/${pic}.webp`)} size={32} />
            </Link>
            <Link className="home-ref-row" to={tree.path}>
              <span className="home-ref-copy">
                <span className="home-ref-name">{tree.label}</span>
                <span className="home-ref-desc">{HOME_REFERENCE_COPY.tree}</span>
              </span>
              <ExampleIcons paths={HOME_AGE_PICS.map((pic) => `techs/${pic}.webp`)} size={32} />
            </Link>
            <div className="home-ref-pair">
              <Link className="home-ref-mini" to={buildings.path}>
                <ExampleIcons paths={[`buildings/${HOME_BUILDING_PIC}.webp`]} size={32} />
                <span className="home-ref-copy">
                  <span className="home-ref-name">{buildings.label}</span>
                  <span className="home-ref-desc">{HOME_REFERENCE_COPY.buildings}</span>
                </span>
              </Link>
              <Link className="home-ref-mini" to={techs.path}>
                <ExampleIcons paths={[`techs/${HOME_TECH_PIC}.webp`]} size={32} />
                <span className="home-ref-copy">
                  <span className="home-ref-name">{techs.label}</span>
                  <span className="home-ref-desc">{HOME_REFERENCE_COPY.techs}</span>
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="home-catalog" data-testid="home-catalog" aria-labelledby="home-catalog-title">
        <h2 id="home-catalog-title">工具与资料</h2>
        <div className="home-catalog-grid">
          {catalog.map((group) => (
            <section key={group.key} className="home-group" aria-labelledby={`home-${group.key}`}>
              <h3 className="home-group-title" id={`home-${group.key}`}>
                {group.title}
              </h3>
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
