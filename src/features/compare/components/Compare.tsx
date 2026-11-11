import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ListHead } from '../../../shared/ui/layout';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { CopyPageLink } from '../../../shared/ui/DetailBlocks';
import { civByEn } from '../../../data';
import { RATING_BASIS, RATING_FILE_VERIFIED_AT } from '../../../data/ratingBasis';
import { resolveCompareQuery, selectCompareCivilization } from '../../../domain/compare';
import { AXES } from '../../../domain/ratings';
import type { Civ } from '../../../domain/types';
import { PAGES } from '../../../shared/nav/pageRegistry';
import { CivIcon } from '../../../shared/ui/art';
import { RatingHeading } from '../../../shared/ui/RatingHelp';
import { PosBox, Radar, Steps } from '../../../shared/ui/widgets';
import { defaultTeamBonusConfig, encodeTeamBonuses, updateTeamRoster } from '../../../domain/teamBonuses';
import { compareLocationIsCurrent } from '../compareLocation';
import './compare.css';
import '../../../shared/ui/contextLinks.css';

/** 页头导语。首页卡片仍用登记表里的短说明。 */
export const COMPARE_LEDE = '选定两个文明，并排查看主观参考分和资料对照。分数不是胜率或精确战力，资料行也不由这些分数推导。';

/**
 * 已裁定的短摘要。句子逐字保留；复核日取评分文件。
 * 地图/时代/打法未拆开，以及旧团战排位社区说法不能当已证实来源，都写在这里。
 */
export function compareRatingSummary(verifiedAt: string): string {
  return [
    '八维分数是维护者整理的 1–10 整数，用来对照和画雷达，不是胜率或精确战力。',
    '各轴没有单独的量化规则，规则待核。',
    '分数适用的游戏补丁未知。',
    '同一分数没有按地图、时代或打法拆开，这些边界未知。',
    '可复查的记录是维护者主观判断，没有逐条出处，缺出处的部分待核。',
    '旧说明写过团战排位社区的普遍看法。',
    '这份文件没有可复查的社区出处，该依据待核，不能当成已证实来源。',
    `文件复核日 ${verifiedAt} 只表示本文件结构和口径查过，不是逐文明重打分，也不表示已经对齐当前资料版本。`,
  ].join('');
}

/** 八轴原来各写一遍的 axisGap，合并后仍列出全部轴名。 */
export const COMPARE_AXIS_NAMES_NOTE = '下列八个轴只按既定顺序命名，现有记录只有轴名。分数是该项相对强弱的主观整数，单独的量化规则待核。可在此核对各轴名称：';

export const COMPARE_FACT_NOTE = '下方特色兵种、城堡科技、帝王科技、团队加成和开局是资料对照，不由这些分数推导。';

const DATA_NOTE = '以下条目来自文明资料字段，不由上表分数推导。';

const ROWS: [string, 'uu' | 'ct' | 'it' | 'tb' | 'op'][] = [
  ['特色兵种', 'uu'],
  ['城堡科技', 'ct'],
  ['帝王科技', 'it'],
  ['团队加成', 'tb'],
  ['参考开局', 'op'],
];
const cell = (c: Civ, k: (typeof ROWS)[number][1]) => (k === 'op' ? <Steps s={c.op} /> : c[k]);
const comparePage = PAGES.find((item) => item.key === 'compare');

/** issue 772：坏参数/缺参的说明；地址栏被 replace 成完整参数后靠 location.state 保留一次。 */
type CompareLinkNote = { kind: 'invalid' } | { kind: 'picked'; side: 'a' | 'b'; civ: string };
function resolveLinkNote(input: string): CompareLinkNote | null {
  const resolved = resolveCompareQuery(input);
  if (resolved.invalid) return { kind: 'invalid' };
  if (!resolved.autoPicked) return null;
  const side = resolved.missingB ? 'b' : 'a';
  return { kind: 'picked', side, civ: side === 'b' ? resolved.b : resolved.a };
}

function MarkedNumbers({ text }: { text: string }) {
  const date = RATING_FILE_VERIFIED_AT;
  const scale = '1–10';
  const scaleAt = text.indexOf(scale);
  const dateAt = text.indexOf(date);
  if (scaleAt < 0 || dateAt < scaleAt) return text;
  return (
    <>
      {text.slice(0, scaleAt)}
      <span className="num nw">{scale}</span>
      {text.slice(scaleAt + scale.length, dateAt)}
      <time dateTime={date} className="num nw">
        {date}
      </time>
      {text.slice(dateAt + date.length)}
    </>
  );
}

function CivHead({ civ, side }: { civ: Civ; side: 'a' | 'b' }) {
  return (
    <th className={side === 'a' ? 'compare-side-a' : 'compare-side-b'}>
      <Link className="ctx-civ-link compare-civ-link" to={`/civ/${civ.en}`}>
        <CivIcon c={civ} />
        <span>{civ.zh}</span>
      </Link>
    </th>
  );
}

export function CompareRatingDetail() {
  const scale = `刻度是 1–10 的整数。文件复核日 ${RATING_FILE_VERIFIED_AT}。${RATING_BASIS.verifiedAtMeans}`;
  return (
    <div id="compare-basis-full" data-testid="compare-rating-full">
      <h4>完整评分口径</h4>
      <p>{RATING_BASIS.axisRule}</p>
      <p>
        <MarkedNumbers text={scale} />
      </p>
      <p>{COMPARE_AXIS_NAMES_NOTE}</p>
      <ul className="compare-axis-names">
        {RATING_BASIS.axes.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p>{RATING_BASIS.reviewableEvidence}</p>
      <p>{RATING_BASIS.communityClaimNote}</p>
      <p>{RATING_BASIS.uncertainty}</p>
      <p>{RATING_BASIS.highlight}</p>
      <p className="note">{COMPARE_FACT_NOTE}</p>
    </div>
  );
}

function scoreClass(own: number, other: number) {
  return `compare-score num nw${own > other ? ' compare-higher' : ''}`;
}

export default function Compare() {
  const location = useLocation();
  const { pathname, search: query } = location;
  const navigate = useNavigate();
  const { a: aName, b: bName, search, needsReplace } = resolveCompareQuery(query);
  const linkNote = resolveLinkNote(query) ?? (location.state as { compareLinkNote?: CompareLinkNote } | null)?.compareLinkNote ?? null;
  const a = civByEn(aName)!,
    b = civByEn(bName)!;
  const [basisOpen, setBasisOpen] = useState(false);
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
  const teamSearch = encodeTeamBonuses(updateTeamRoster(defaultTeamBonusConfig(), [a.en, b.en]));
  return (
    <section id="compare" className="pane">
      <ListHead title={comparePage?.label ?? '文明对比'} desc={COMPARE_LEDE} />
      <div className="compare-toolbar">
        <div className="compare-pickers">
          <div className="compare-field">
            <span className="compare-field-label" aria-hidden="true">
              文明 A
            </span>
            <CivPicker id="ca" label="文明 A" value={a.en} onChange={(en) => selectCivilization('a', en)} />
          </div>
          <span className="compare-vs">VS</span>
          <div className="compare-field">
            <span className="compare-field-label" aria-hidden="true">
              文明 B
            </span>
            <CivPicker id="cb" label="文明 B" value={b.en} onChange={(en) => selectCivilization('b', en)} />
          </div>
        </div>
        <div className="compare-share">
          <CopyPageLink key={search} />
          <Link className="compare-team-link" to={'/team-bonuses?' + teamSearch}>
            查看这两个文明的团队加成来源
          </Link>
        </div>
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
      <section className="compare-basis" aria-labelledby="compare-basis-title" data-testid="compare-rating-basis">
        <h3 id="compare-basis-title">评分性质</h3>
        <p className="compare-summary" data-testid="compare-rating-summary">
          <MarkedNumbers text={compareRatingSummary(RATING_FILE_VERIFIED_AT)} />
        </p>
        <button
          type="button"
          className="compare-basis-toggle"
          aria-expanded={basisOpen}
          aria-controls="compare-basis-full"
          onClick={() => setBasisOpen((open) => !open)}
        >
          {basisOpen ? '收起完整评分口径' : '查看完整评分口径'}
        </button>
        {basisOpen && <CompareRatingDetail />}
      </section>
      <div className="compare-board">
        <section className="compare-scores" aria-labelledby="compare-scores-title">
          <h3 id="compare-scores-title">主观参考分</h3>
          <p className="note" id="compare-score-note">
            {RATING_BASIS.highlight}
          </p>
          <table id="ctab" aria-describedby="compare-score-note">
            <tbody>
              <tr>
                <th />
                <CivHead civ={a} side="a" />
                <CivHead civ={b} side="b" />
              </tr>
              {AXES.map((label, index) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className={scoreClass(a.s[index]!, b.s[index]!)}>{a.s[index]}</td>
                  <td className={scoreClass(b.s[index]!, a.s[index]!)}>{b.s[index]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <div className="compare-radar">
          <RatingHeading />
          <Radar id="crd" list={[a, b]} label="八维主观参考分雷达，不是胜率或精确战力" />
          <p className="compare-legend" data-testid="compare-legend">
            <span>
              <span className="compare-swatch compare-swatch-a" aria-hidden="true" />
              金色 = 左侧「{a.zh}」
            </span>
            <span>
              <span className="compare-swatch compare-swatch-b" aria-hidden="true" />
              蓝色 = 右侧「{b.zh}」
            </span>
          </p>
        </div>
      </div>
      <section className="compare-facts" id="compare-facts" aria-labelledby="compare-facts-title">
        <h3 id="compare-facts-title">资料对照</h3>
        <p className="note">{DATA_NOTE}</p>
        <table>
          <tbody>
            <tr>
              <th />
              <CivHead civ={a} side="a" />
              <CivHead civ={b} side="b" />
            </tr>
            {ROWS.map(([label, key]) => (
              <tr key={key}>
                <td>{label}</td>
                <td className="compare-side-a">{cell(a, key)}</td>
                <td className="compare-side-b">{cell(b, key)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div id="cpos">
        <PosBox list={[a, b]} />
        <p className="note" data-testid="compare-position-basis">
          {RATING_BASIS.positions.source}
        </p>
      </div>
    </section>
  );
}
