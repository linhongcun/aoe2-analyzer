import { Link } from 'react-router-dom';
import { civs } from '../../../data';
import { SECONDARY_TOOLS, TOOLS, WIKI, type Section } from '../../../app/nav/sections';
import { CivIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { DLCS } from '../../../domain/dlc';

const COUNTS: Record<string, number> = {
  ...__CATALOG_COUNTS__,
  civs: civs.length,
  tree: civs.length,
  bonuses: civs.reduce((n, c) => n + c.bon.length + 1, 0),
  dlc: DLCS.length,
};
const Card = ({ s, tool = false }: { s: Section; tool?: boolean }) => (
  <Link className="hcard" to={s.path} data-k={s.key}>
    <Icon name={s.icon} className="ic hc-ic" />
    {COUNTS[s.key] != null && (
      <span className="hc-count" aria-hidden="true">
        {COUNTS[s.key]}
      </span>
    )}
    <div className="hc-body">
      <h3>{s.label}</h3>
      <small className="hc-en">{s.en}</small>
      <p className="note">{s.desc}</p>
    </div>
    {tool && (
      <span className="hc-open">
        打开 <Icon name="arrow-right" />
      </span>
    )}
  </Link>
);
const POPULAR = ['Franks', 'Britons', 'Mongols', 'Persians', 'Hindustanis', 'Armenians', 'Romans', 'Shu'];

export default function Home() {
  return (
    <section id="home" className="pane">
      <div className="hero">
        <h1>
          帝国时代 II 决定版 <span>分析器</span>
        </h1>
        <p className="note">查资料、选文明、练开局，让每次决策都有依据。</p>
        <button className="herosearch" onClick={() => dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}>
          <Icon name="search" />
          <span>搜索文明、单位、科技、开局…</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="quickciv">
          {POPULAR.map((en) => civs.find((c) => c.en === en)!)
            .filter(Boolean)
            .map((c) => (
              <Link key={c.en} className="civchip" to={`/civ/${c.en}`}>
                <CivIcon c={c} />
                {c.zh}
              </Link>
            ))}
          <Link className="ulink" to="/civs">
            全部 {civs.length} 个文明 <Icon name="arrow-right" />
          </Link>
        </div>
      </div>
      <h2 className="hsec">百科</h2>
      <div className="hgrid">
        {WIKI.map((s) => (
          <Card key={s.key} s={s} />
        ))}
      </div>
      <h2 className="hsec">工具</h2>
      <div className="hgrid home-tools-grid">
        {TOOLS.map((s) => (
          <Card key={s.key} s={s} tool />
        ))}
        <nav className="bar home-planning-links" aria-label="更多规划工具">
          {SECONDARY_TOOLS.filter((s) => ['trade-income', 'construction', 'team-bonuses', 'garrison-healing'].includes(s.key)).map((s) => (
            <Link key={s.key} className="btn community-tool-entry" to={s.path}>
              {s.label}
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}
