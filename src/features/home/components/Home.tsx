import { Link } from 'react-router-dom';
import { civs } from '../../../data';
import { TOOLS, WIKI, type Section } from '../../../app/nav/sections';
import { CivIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';

const Card = ({ s }: { s: Section }) => (
  <Link className="hcard" to={s.path} data-k={s.key}>
    <Icon name={s.icon} className="ic hc-ic" />
    <div>
      <h3>
        {s.label} <small>{s.en}</small>
      </h3>
      <p className="note">{s.desc}</p>
    </div>
  </Link>
);
const POPULAR = ['Franks', 'Britons', 'Mongols', 'Persians', 'Hindustanis', 'Armenians', 'Romans', 'Shu'];

export default function Home() {
  return (
    <section id="home" className="pane">
      <div className="hero">
        <h1>
          <Icon name="swords" className="ic hic" /> 帝国时代 II 决定版 · 分析器
        </h1>
        <p className="note">文明、单位、科技百科 + 团战排位工具。数据来源 aoe2techtree（2026-10）。</p>
        <button className="herosearch" onClick={() => dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}>
          <Icon name="search" />
          <span>搜索文明、单位、科技、开局…</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="quickciv">
          {civs
            .filter((c) => POPULAR.includes(c.en))
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
      <div className="hgrid">
        {TOOLS.map((s) => (
          <Card key={s.key} s={s} />
        ))}
      </div>
    </section>
  );
}
