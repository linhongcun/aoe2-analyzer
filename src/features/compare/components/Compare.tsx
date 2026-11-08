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
import { compareLocationIsCurrent } from '../compareLocation';
import './compare.css';
import '../../../shared/ui/contextLinks.css';

const ROWS: [string, 'uu' | 'ct' | 'it' | 'tb' | 'op'][] = [
  ['特色兵种', 'uu'],
  ['城堡科技', 'ct'],
  ['帝王科技', 'it'],
  ['团队加成', 'tb'],
  ['开局', 'op'],
];
const cell = (c: Civ, k: (typeof ROWS)[number][1]) => (k === 'op' ? <Steps s={c.op} /> : c[k]);

/** issue 772：坏参数/缺参的说明；地址栏被 replace 成完整参数后靠 location.state 保留一次。 */
type CompareLinkNote = { kind: 'invalid' } | { kind: 'picked'; side: 'a' | 'b'; civ: string };
function resolveLinkNote(input: string): CompareLinkNote | null {
  const resolved = resolveCompareQuery(input);
  if (resolved.invalid) return { kind: 'invalid' };
  if (!resolved.autoPicked) return null;
  const side = resolved.missingB ? 'b' : 'a';
  return { kind: 'picked', side, civ: side === 'b' ? resolved.b : resolved.a };
}

export default function Compare() {
  const location = useLocation();
  const { pathname, search: query } = location;
  const navigate = useNavigate();
  const { a: aName, b: bName, search, needsReplace } = resolveCompareQuery(query);
  const linkNote = resolveLinkNote(query) ?? (location.state as { compareLinkNote?: CompareLinkNote } | null)?.compareLinkNote ?? null;
  const a = civByEn(aName)!,
    b = civByEn(bName)!;
  useEffect(() => {
    if (!compareLocationIsCurrent(location, window.location.hash)) return;
    const note = resolveLinkNote(query);
    if (!needsReplace && !note && pathname === '/compare') return;
    navigate({ pathname: '/compare', search }, { replace: true, state: note ? { compareLinkNote: note } : undefined });
  }, [location, pathname, query, search, needsReplace, navigate]);
  const selectCivilization = (side: 'a' | 'b', civ: string) => {
    const next = selectCompareCivilization(query, side, civ);
    if (next !== null) navigate({ pathname: '/compare', search: next });
  };
  return (
    <section id="compare" className="pane">
      <ListHead title="文明对比" desc="两个文明的能力雷达与关键差异" />
      <p>
        <Link className="btn community-tool-entry" to={'/team-bonuses?' + encodeTeamBonuses(updateTeamRoster(defaultTeamBonusConfig(), [a.en, b.en]))}>
          查看这两个文明的团队加成来源
        </Link>
      </p>
      <div className="bar fbar">
        <CivPicker id="ca" label="文明 A" value={a.en} onChange={(en) => selectCivilization('a', en)} /> VS{' '}
        <CivPicker id="cb" label="文明 B" value={b.en} onChange={(en) => selectCivilization('b', en)} />
      </div>
      {linkNote?.kind === 'invalid' && (
        <p className="note" role="status">
          链接中的文明无效，已整组回退为默认对比。
        </p>
      )}
      {linkNote?.kind === 'picked' && (
        <p className="note" role="status">
          链接缺少{linkNote.side === 'b' ? '对手' : '我方'}文明，已自动选择「{civByEn(linkNote.civ)?.zh ?? linkNote.civ}」，请按实际补选。
        </p>
      )}
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
