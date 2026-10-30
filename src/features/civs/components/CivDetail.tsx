import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { civByEn, civs } from '../../../data';
import { useCore } from '../../../data/hooks';
import { DLCS } from '../../../domain/dlc';
import { findUniqueTech } from '../../../domain/linker';
import { AXES, strengths, TYPE_ZH } from '../../../domain/ratings';
import type { Civ } from '../../../domain/types';
import { CivChip, CivIcon, DlcBadgeL, TechIcon, UnitLinks } from '../../../shared/ui/art';
import { collapse } from '../../../domain/family';
import { Icon } from '../../../shared/ui/Icon';
import { DetailPage, SideBlock } from '../../../shared/ui/layout';
import { DetailSection, DetailSource, StatTiles } from '../../../shared/ui/DetailBlocks';
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
import { contextPath, entityPath, readNavigation, type EntityContext } from '../../../shared/nav/context';
import { NavigationContext } from '../../../shared/ui/NavigationContext';
import '../../../shared/ui/contextLinks.css';

function UTech({ s, civ, context }: { s: string; civ: string; context?: EntityContext }) {
  const core = useCore();
  const f = core && findUniqueTech(s, civ, core.techs);
  if (!f) return <Linked text={civDisplayText(s, civ, core)} />;
  return (
    <>
      <Link className="ulink tlink" to={entityPath('tech', f.tech.id, civ, context?.search ?? '', context?.source)}>
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
  const location = useLocation();
  const c = civByEn(en);
  const core = useCore();
  useEffect(() => {
    if (c) {
      session.lastCiv = c.en;
      scrollTo(0, 0);
    }
  }, [c]);
  if (!c) return <CivNotFound en={en} />;
  const context: EntityContext = { civ: c.en, search: location.search, source: location.pathname + location.search };
  const toolPath = (path: string) => contextPath(path, location.search, location.pathname + location.search);
  const origin = readNavigation(location.search);
  const completePair = origin.me && origin.opp;
  const matchupSource = new URLSearchParams(location.search);
  if (!completePair) {
    matchupSource.delete('me');
    matchupSource.delete('opp');
  }
  const matchupTarget = completePair ? new URLSearchParams({ me: origin.me!, opp: origin.opp! }) : new URLSearchParams({ me: c.en });
  const matchupPath = contextPath('/matchup?' + matchupTarget, matchupSource, location.pathname + location.search);
  const proParams = new URLSearchParams(location.search);
  proParams.set('tab', 'pro');
  const [s, w] = strengths(c);
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
      tabsTop={
        <>
          <NavigationContext currentCiv={c.en}>
            <Link className="community-tool-entry" to={contextPath('/match-review', location.search, location.pathname + location.search)}>
              记录一个练习问题
            </Link>
          </NavigationContext>
          <nav className="ctx-bar" aria-label="本页相关工具">
            <Link className="community-tool-entry" to={toolPath(`/builds?civ=${c.en}`)}>
              <Icon name="book-open" /> 开局流程
            </Link>
            <Link className="community-tool-entry" to={toolPath(`/production?civ=${c.en}`)}>
              <Icon name="factory" /> 生产对照
            </Link>
            <Link className="community-tool-entry" to={matchupPath}>
              <Icon name="crosshair" /> 对局助手
            </Link>
            <Link className="community-tool-entry" to={toolPath(`/compare?a=${c.en}`)}>
              <Icon name="scale" /> 文明对比
            </Link>
            <Link className="community-tool-entry" to={`/civ/${c.en}?${proParams}`}>
              <Icon name="users" /> 职业选手视角
            </Link>
          </nav>
        </>
      }
      tabs={[
        {
          key: 'ov',
          label: '概览',
          content: (
            <>
              {c.op.trim() && (
                <DetailSection title="开局建议">
                  <CivOpening c={c} context={context} />
                </DetailSection>
              )}
              <section className="detail-ratings-heading">
                <h2>能力评分</h2>
                <RatingLabel />
              </section>
              {ratingTiles}
              <p>
                <b>官方定位：</b>
                {c.desc}
              </p>
              <p>
                <b>特色兵种：</b>
                <Linked text={civDisplayText(c.uu, c.en, core)} />
              </p>
              <p>
                <b>文明加成：</b>
                <Link className="ulink" to="/bonuses">
                  查看完整加成表
                </Link>
              </p>
              <BonusRows c={c} />
              <p className="g">
                <b>优势：</b>
                {s.join('、')}
              </p>
              <p className="r">
                <b>劣势：</b>
                {w.join('、')}
              </p>
              <p>
                <b>推荐团战位置：</b>
                {c.fl >= c.pk ? '边位 Flank' : '口袋 Pocket'}（边位 {c.fl}/10，口袋 {c.pk}/10）
              </p>
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
                <UTech s={c.ct} civ={c.en} context={context} />
              </p>
              <p>
                <b>帝王时代独特科技：</b>
                <UTech s={c.it} civ={c.en} context={context} />
              </p>
              <p>
                <Link className="ulink tlink" to={toolPath(`/tree/${c.en}`)}>
                  <Icon name="tree-deciduous" /> 查看完整科技树 <Icon name="arrow-right" />
                </Link>
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
              <div className="uchips">{core && <UnitLinks list={collapse(myU, core.fam)} context={context} />}</div>
            </SideBlock>
          )}
          <CivRegionalUnits civ={c.en} units={core?.units ?? null} context={context} />
          <CivUniqueBuildings civ={c.en} buildings={core?.buildings ?? null} context={context} />
          <CivRegionalBuildings civ={c.en} buildings={core?.buildings ?? null} context={context} />
          <SideBlock title="快速入口">
            <Link className="ulink tlink" to={toolPath(`/tree/${c.en}`)}>
              <Icon name="git-branch" /> 科技树
            </Link>
            <Link className="ulink" to={toolPath(`/compare?a=${c.en}`)}>
              <Icon name="scale" /> 文明对比
            </Link>
            <Link className="ulink" to={matchupPath}>
              <Icon name="crosshair" /> 对局助手
            </Link>
          </SideBlock>
          {sameDlc.length > 0 && <SameDlcCivs key={c.en} list={sameDlc} />}
          <p className="note">共 {civs.length} 个文明</p>
        </>
      }
    />
  );
}
