import { useState } from 'react';
import { Link } from 'react-router-dom';
import { civs } from '../../../data';
import { DLCS } from '../../../domain/dlc';
import { resetStart } from '../../../domain/startGame';
import { HOME_GROUPS, type Section } from '../../../shared/nav/sections';
import { CivIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import StartGame from './StartGame';
import '../home.css';

const COUNTS: Record<string, number> = {
  ...__CATALOG_COUNTS__,
  civs: civs.length,
  tree: civs.length,
  bonuses: civs.reduce((n, c) => n + c.bon.length + 1, 0),
  dlc: DLCS.length,
};
const Card = ({ s }: { s: Section }) => (
  <Link className="hcard" to={s.path} data-k={s.key}>
    <Icon name={s.icon} className="ic hc-ic" />
    {COUNTS[s.key] != null && (
      <span className="hc-count num" aria-hidden="true">
        {COUNTS[s.key]}
      </span>
    )}
    <div className="hc-body">
      <h3>{s.label}</h3>
      <small className="hc-en">{s.en}</small>
      <p className="note">
        {s.desc.split(/(\d+(?:\s*(?:个(?:文明|单位|历史首发时期)?|种建筑|项科技))?)/g).map((part, i) =>
          /^\d/.test(part) ? (
            <span className="num" key={i}>
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </p>
    </div>
    <span className="hc-open" aria-hidden="true">
      打开 <Icon name="arrow-right" />
    </span>
  </Link>
);
const POPULAR = ['Franks', 'Britons', 'Mongols', 'Persians', 'Hindustanis', 'Armenians', 'Romans', 'Shu'];

export default function Home() {
  const [flow, setFlow] = useState(resetStart);
  const foldTools = flow.current !== 'mode';
  return (
    <section id="home" className="pane">
      <StartGame state={flow} onChange={setFlow} />
      <section
        className={foldTools ? 'start-more is-folded' : 'start-more'}
        data-testid="start-more-tools"
        aria-labelledby={foldTools ? 'more-folded' : 'more-h'}
      >
        <p className="start-more-title" id="more-h">
          更多工具
        </p>
        <div className="start-more-body">
          <p className="start-why">查资料和计算器还在这里，不再是首页第一件事。</p>
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
              全部 <span className="num">{civs.length} 个文明</span> <Icon name="arrow-right" />
            </Link>
          </div>
          {HOME_GROUPS.map((group) => (
            <section key={group.key} className="home-group" aria-labelledby={`home-${group.key}`}>
              <h2 className="hsec" id={`home-${group.key}`}>
                {group.title}
              </h2>
              <p className="note home-group-desc">{group.desc}</p>
              <div className="hgrid">
                {group.sections.map((s) => (
                  <Card key={s.key} s={s} />
                ))}
              </div>
            </section>
          ))}
        </div>
        <p className="start-folded" id="more-folded">
          更多工具收在下面，这一步不展开。
        </p>
      </section>
    </section>
  );
}
