import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { civByEn, civs } from '../../../data';
import { useCore } from '../../../data/hooks';
import { DLCS } from '../../../domain/dlc';
import { civInsights } from '../../../domain/insights';
import { findUniqueTech } from '../../../domain/linker';
import { AXES, strengths, TYPE_ZH } from '../../../domain/ratings';
import type { Civ } from '../../../domain/types';
import { CivChip, CivIcon, DlcBadgeL, TechIcon, UnitLinks } from '../../../shared/ui/art';
import { collapse } from '../../../domain/family';
import { Icon } from '../../../shared/ui/Icon';
import { InsightSlot } from '../../../shared/ui/InsightSlot';
import { DetailPage, SideBlock } from '../../../shared/ui/layout';
import { DetailSource, StatTiles } from '../../../shared/ui/DetailBlocks';
import { RatingHeading, RatingLabel } from '../../../shared/ui/RatingHelp';
import { Linked, PosBox, Radar } from '../../../shared/ui/widgets';
import { session } from '../../../shared/utils/sticky';
import CivNotFound from './CivNotFound';
import { BonusRows } from './BonusRows';
import { CivOpening } from './CivOpening';
import { CivRegionalUnits } from './CivRegionalUnits';
import { CivRegionalBuildings } from './CivRegionalBuildings';
import { CivUniqueBuildings } from './CivUniqueBuildings';
import { PatchHistory } from '../../../shared/ui/PatchHistory';
import { civDisplayText } from '../displayNames';
import CivProfessionalView from './CivProfessionalView';
import './civOverview.css';
import './civRelatedTools.css';

function OverviewCard({
  title,
  testId,
  extra,
  className = '',
  headingClassName = '',
  children,
}: {
  title: string;
  testId: string;
  extra?: ReactNode;
  className?: string;
  headingClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={`detail-section${className ? ` ${className}` : ''}`} aria-label={title} data-testid={testId}>
      <div className={`civ-ov-hd${headingClassName ? ` ${headingClassName}` : ''}`}>
        <h2>{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function UTech({ s, civ }: { s: string; civ: string }) {
  const core = useCore();
  const f = core && findUniqueTech(s, civ, core.techs);
  if (!f) return <Linked text={civDisplayText(s, civ, core)} />;
  return (
    <>
      <Link className="ulink tlink" to={`/tech/${f.tech.id}`}>
        <TechIcon t={f.tech} />
        {f.zh}
      </Link>
      <Linked text={civDisplayText(f.rest, civ, core)} />｜{f.en}
    </>
  );
}

function SameDlcCivs({ list }: { list: Civ[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <SideBlock title="同资料片文明">
      <ul id="same-dlc-civs" className="same-dlc-civs">
        {(expanded ? list : list.slice(0, 5)).map((c) => (
          <li key={c.en}>
            <CivChip c={c} />
          </li>
        ))}
      </ul>
      {list.length > 5 && (
        <button type="button" className="same-dlc-toggle" aria-expanded={expanded} aria-controls="same-dlc-civs" onClick={() => setExpanded(!expanded)}>
          {expanded ? '收起' : `查看全部（${list.length}）`}
        </button>
      )}
    </SideBlock>
  );
}

export default function CivDetail() {
  const { en = '' } = useParams();
  const c = civByEn(en);
  const core = useCore();
  useEffect(() => {
    if (c) {
      session.lastCiv = c.en;
      scrollTo(0, 0);
    }
  }, [c]);
  if (!c) return <CivNotFound en={en} />;
  const [s, w] = strengths(c);
  const insights = civInsights(c.en);
  const myU = core ? core.units.filter((u) => u.type === 'UniqueUnit' && u.civs.includes(c.en)) : [];
  const highlights = new Set(
    c.s
      .map((score, index) => ({ score, index }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((x) => x.index),
  );
  const ratingTiles = (
    <StatTiles
      label="文明能力评分"
      stats={AXES.map((label, index) => ({
        key: `rating-${index}`,
        label,
        value: (
          <>
            {c.s[index]}
            <small className="detail-score-max">/10</small>
          </>
        ),
        score: c.s[index],
        accent: highlights.has(index),
      }))}
    />
  );
  const sameDlc = c.dlc != null ? DLCS[c.dlc]!.civs.filter((n) => n !== c.en).map((n) => civByEn(n)!) : [];
  const relatedTools = [
    ['civ-tool-builds', `/builds?civ=${c.en}`, 'book-open', '开局流程'],
    ['civ-tool-production', `/production?civ=${c.en}`, 'factory', '生产对照'],
    ['civ-tool-matchup', `/matchup?me=${c.en}`, 'crosshair', '对局助手'],
    ['civ-tool-compare', `/compare?a=${c.en}`, 'scale', '文明对比'],
    ['civ-tool-tree', `/tree/${c.en}`, 'git-branch', '科技树'],
  ] as const;
  return (
    <DetailPage
      key={c.en}
      id="detail"
      crumb={c.zh}
      icon={<CivIcon c={c} />}
      title={c.zh}
      en={c.en}
      badges={<DlcBadgeL i={c.dlc} />}
      tags={c.ty.map((t) => (
        <span key={t} className="tag">
          {TYPE_ZH[t]}
        </span>
      ))}
      tablistTestId="civ-tabs"
      afterTabs={
        <nav className="civ-related-tools" aria-label="相关工具" data-testid="civ-related-tools">
          <span className="lbl">相关工具</span>
          {relatedTools.map(([id, to, icon, label]) => (
            <Link key={id} data-testid={id} to={to}>
              <Icon name={icon} className="ic civ-tool-ic" />
              {label}
            </Link>
          ))}
        </nav>
      }
      tabs={[
        {
          key: 'ov',
          label: '概览',
          content: (
            <>
              {c.op.trim() && (
                <OverviewCard title="开局建议" testId="civ-opening" className="civ-opening-card">
                  <CivOpening c={c} />
                </OverviewCard>
              )}
              <OverviewCard title="能力评分" testId="civ-ratings" className="civ-ratings" headingClassName="detail-ratings-heading" extra={<RatingLabel />}>
                {ratingTiles}
                <dl className="civ-rating-footnote" data-testid="civ-rating-footnote">
                  <div>
                    <dt>官方定位</dt>
                    <dd>{c.desc}</dd>
                  </div>
                  <div>
                    <dt>特色兵种</dt>
                    <dd>
                      <Linked text={civDisplayText(c.uu, c.en, core)} />
                    </dd>
                  </div>
                </dl>
              </OverviewCard>
              {insights.length > 0 && <InsightSlot items={insights} />}
              <OverviewCard
                title="文明加成"
                testId="civ-bonuses"
                className="civ-bonuses"
                extra={
                  <Link className="civ-ov-link" to="/bonuses">
                    查看完整加成表
                  </Link>
                }
              >
                <BonusRows c={c} />
              </OverviewCard>
              <OverviewCard title="优劣与位置" testId="civ-stance" className="civ-stance">
                <div className="civ-stance-cols">
                  <div data-testid="civ-stance-pros">
                    <h3>优势</h3>
                    <div className="civ-chips">
                      {s.map((name) => (
                        <span key={name} className="civ-chip is-pro">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div data-testid="civ-stance-cons">
                    <h3>劣势</h3>
                    <div className="civ-chips">
                      {w.map((name) => (
                        <span key={name} className="civ-chip is-con">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="civ-position" data-testid="civ-position">
                  <span className="k">推荐团战位置</span>
                  {c.fl >= c.pk ? '边位 Flank' : '口袋 Pocket'}（边位{' '}
                  <span className="nw">
                    <span className="num">{c.fl}</span>/10
                  </span>
                  ，口袋{' '}
                  <span className="nw">
                    <span className="num">{c.pk}</span>/10
                  </span>
                  ）
                </p>
              </OverviewCard>
              <DetailSource note="能力评分为主观近似评分；开局建议请结合文明加成调整" />
            </>
          ),
        },
        {
          key: 'data',
          label: '数据',
          content: (
            <>
              {ratingTiles}
              <div className="two">
                <div>
                  <RatingHeading />
                  <Radar id="rd" list={[c]} />
                </div>
                <div>
                  <PosBox list={[c]} />
                </div>
              </div>
            </>
          ),
        },
        {
          key: 'tech',
          label: '科技',
          content: (
            <>
              <p>
                <b>城堡时代独特科技：</b>
                <UTech s={c.ct} civ={c.en} />
              </p>
              <p>
                <b>帝王时代独特科技：</b>
                <UTech s={c.it} civ={c.en} />
              </p>
            </>
          ),
        },
        { key: 'history', label: '更新历史', content: <PatchHistory target={{ targetType: 'civ', targetId: c.en, targetNameZh: c.zh }} /> },
        { key: 'pro', label: '职业选手视角', content: <CivProfessionalView /> },
      ]}
      sidebar={
        <>
          {myU.length > 0 && (
            <SideBlock title="独特单位">
              <div className="uchips">{core && <UnitLinks list={collapse(myU, core.fam)} />}</div>
            </SideBlock>
          )}
          <CivRegionalUnits civ={c.en} units={core?.units ?? null} />
          <CivUniqueBuildings civ={c.en} buildings={core?.buildings ?? null} />
          <CivRegionalBuildings civ={c.en} buildings={core?.buildings ?? null} />
          {sameDlc.length > 0 && <SameDlcCivs key={c.en} list={sameDlc} />}
          <p className="note">
            共{' '}
            <span className="nw">
              <span className="num">{civs.length}</span> 个文明
            </span>
          </p>
        </>
      }
    />
  );
}
