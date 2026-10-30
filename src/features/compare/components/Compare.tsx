import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ListHead } from '../../../shared/ui/layout';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { CopyPageLink } from '../../../shared/ui/DetailBlocks';
import { civByEn } from '../../../data';
import { resolveCompareQuery, selectCompareCivilization } from '../../../domain/compare';
import { AXES } from '../../../domain/ratings';
import type { Civ } from '../../../domain/types';
import { CivIcon } from '../../../shared/ui/art';
import { RatingHeading } from '../../../shared/ui/RatingHelp';
import { PosBox, Radar, Steps } from '../../../shared/ui/widgets';
import { defaultTeamBonusConfig, encodeTeamBonuses, updateTeamRoster } from '../../../domain/teamBonuses';
import './compare.css';
import '../../../shared/ui/contextLinks.css';
import { contextPath } from '../../../shared/nav/context';
import { NavigationContext } from '../../../shared/ui/NavigationContext';

const ROWS: [string, 'uu' | 'ct' | 'it' | 'tb' | 'op'][] = [
  ['特色兵种', 'uu'],
  ['城堡科技', 'ct'],
  ['帝王科技', 'it'],
  ['团队加成', 'tb'],
  ['开局', 'op'],
];
const cell = (c: Civ, k: (typeof ROWS)[number][1]) => (k === 'op' ? <Steps s={c.op} /> : c[k]);

export default function Compare() {
  const { pathname, search: query } = useLocation();
  const navigate = useNavigate();
  const { a: aName, b: bName, search, needsReplace } = resolveCompareQuery(query);
  const a = civByEn(aName)!,
    b = civByEn(bName)!;
  useEffect(() => {
    if (needsReplace || pathname !== '/compare') navigate({ pathname: '/compare', search }, { replace: true });
  }, [pathname, search, needsReplace, navigate]);
  const selectCivilization = (side: 'a' | 'b', civ: string) => {
    const next = selectCompareCivilization(query, side, civ);
    if (next !== null) navigate({ pathname: '/compare', search: next });
  };
  return (
    <section id="compare" className="pane">
      <ListHead title="文明对比" desc="两个文明的能力雷达与关键差异" />
      <NavigationContext />
      <nav className="ctx-chips" aria-label="继续分析这组文明">
        <Link className="community-tool-entry" to={contextPath(`/matchup?${new URLSearchParams({ me: a.en, opp: b.en })}`, query, '/compare' + search)}>
          以左侧为我方分析
        </Link>
        <Link className="community-tool-entry" to={contextPath(`/matchup?${new URLSearchParams({ me: b.en, opp: a.en })}`, query, '/compare' + search)}>
          以右侧为我方分析
        </Link>
        <Link
          className="community-tool-entry"
          to={contextPath(`/tree/${a.en}?${new URLSearchParams({ mode: '2', compare: b.en })}`, query, '/compare' + search)}
        >
          比较科技树差异
        </Link>
      </nav>
      <p>
        <Link className="btn community-tool-entry" to={'/team-bonuses?' + encodeTeamBonuses(updateTeamRoster(defaultTeamBonusConfig(), [a.en, b.en]))}>
          查看这两个文明的队伍加成来源
        </Link>
      </p>
      <div className="bar fbar">
        <CivPicker id="ca" label="文明 A" value={a.en} onChange={(en) => selectCivilization('a', en)} /> VS{' '}
        <CivPicker id="cb" label="文明 B" value={b.en} onChange={(en) => selectCivilization('b', en)} />
      </div>
      <div className="compare-share">
        <CopyPageLink key={search} />
      </div>
      <div className="two">
        <table id="ctab">
          <tbody>
            <tr>
              <th />
              <th style={{ color: 'var(--c-gold)' }}>
                <CivIcon c={a} />
                <br />
                <Link className="ctx-civ-link" to={`/civ/${a.en}`}>
                  {a.zh}
                </Link>
              </th>
              <th style={{ color: 'var(--c-blue)' }}>
                <CivIcon c={b} />
                <br />
                <Link className="ctx-civ-link" to={`/civ/${b.en}`}>
                  {b.zh}
                </Link>
              </th>
            </tr>
            {AXES.map((l, i) => (
              <tr key={l}>
                <td>{l}</td>
                <td className={`compare-score${a.s[i]! > b.s[i]! ? ' win' : ''}`}>{a.s[i]}</td>
                <td className={`compare-score${b.s[i]! > a.s[i]! ? ' win' : ''}`}>{b.s[i]}</td>
              </tr>
            ))}
            {ROWS.map(([l, k]) => (
              <tr key={k}>
                <td>{l}</td>
                <td>{cell(a, k)}</td>
                <td>{cell(b, k)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          <RatingHeading />
          <Radar id="crd" list={[a, b]} />
          <p className="note">金色=左侧文明，蓝色=右侧文明</p>
        </div>
      </div>
      <div id="cpos">
        <PosBox list={[a, b]} />
      </div>
    </section>
  );
}
