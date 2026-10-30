import { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { civByEn, civs } from '../../../data';
import { useCore } from '../../../data/hooks';
import { AGE_ZH } from '../../../domain/ratings';
import { CivChip, CivIcon, CostView, TechReleaseBadge, StatIcon, TechIcon, TechLink, UnitLink } from '../../../shared/ui/art';
import { BLink } from '../../../shared/ui/BLink';
import { DetailPage, SideBlock } from '../../../shared/ui/layout';
import { DetailSection, DetailSource, StatTiles } from '../../../shared/ui/DetailBlocks';
import { Join, Linked, Loading } from '../../../shared/ui/widgets';
import TechAffects from './TechAffects';
import { techAffects } from '../../../domain/affects';
import { affectedUnits } from '../../../domain/family';
import { TECH_AKA } from '../../../data/aliases';
import { PatchHistory, HistoricalEntityDetail } from '../../../shared/ui/PatchHistory';
import { Icon } from '../../../shared/ui/Icon';
import '../../../shared/ui/contextLinks.css';
import './tech-civ-links.css';

const TT: Record<string, string> = { UniqueTech: '独特科技', Research: '通用科技', RegionalTech: '区域科技' };

export default function TechDetail() {
  const { id = '' } = useParams();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const contextCiv = civByEn(params.get('civ') ?? '');
  const me = civByEn(params.get('me') ?? ''),
    opp = civByEn(params.get('opp') ?? '');
  const allCivsParams = new URLSearchParams(params);
  allCivsParams.set('tab', 'civs');
  const core = useCore();
  useEffect(() => {
    scrollTo(0, 0);
  }, [id]);
  if (!core)
    return (
      <section className="pane">
        <Loading />
      </section>
    );
  const t = core.techById[+id];
  if (!t) return <HistoricalEntityDetail target={{ targetType: 'tech', targetId: id }} />;
  const pre = t.pre != null ? core.techById[t.pre] : undefined;
  const aliases = TECH_AKA[t.id]?.filter((name) => name.toLowerCase() !== t.en.toLowerCase() && name !== t.zh);
  const nxt = core.techs.filter((x) => x.pre === t.id);
  // 涉及单位用结构化效果（与「作用对象」同源），不再按说明文字匹配单位名（#13）
  const affected = techAffects(t, core.units, core.buildings);
  const rel = affectedUnits(affected, core.fam);
  // 条件与对象是效果的一部分；相同的“攻击 +1”不能跨建筑或组合科技去重。
  const effectCards = affected.flatMap((group, groupIndex) => {
    const conditional = group.group.startsWith('组合触发');
    const label = conditional ? core.techs.reduce((text, tech) => text.replaceAll(tech.en, tech.zh), group.group) : `${group.group}（基础效果）`;
    return group.rows.map((row, rowIndex) => {
      const targets = [...new Set([...row.units.map((unit) => unit.zh), ...row.buildings.map((building) => building.zh)])];
      return {
        key: `effect-${groupIndex}-${rowIndex}`,
        label,
        value: row.effect,
        note: `作用对象：${targets.slice(0, 4).join('、')}${targets.length > 4 ? ` 等 ${targets.length} 类单位或建筑` : ''}`,
      };
    });
  });
  const civList = (
    <>
      <h4>
        {t.type === 'UniqueTech' ? '所属文明' : '可研究的文明'}（{t.civs.length}/{civs.length}）
      </h4>
      <div>
        <Join
          sep=" "
          items={t.civs.map((n) => {
            const c = civByEn(n);
            return c ? <CivChip c={c} /> : n;
          })}
        />
      </div>
      {t.type !== 'UniqueTech' && t.civs.length < civs.length && (
        <p className="note">
          无法研究：
          {civs
            .filter((c) => !t.civs.includes(c.en))
            .map((c) => c.zh)
            .join('、')}
        </p>
      )}
    </>
  );
  return (
    <DetailPage
      key={t.id}
      id="tech"
      crumb={t.zh}
      icon={<TechIcon t={t} big />}
      title={t.zh}
      en={t.en}
      badges={<TechReleaseBadge t={t} large />}
      tags={
        <>
          <span className="tag">{TT[t.type] ?? t.type}</span>
          <BLink id={t.b} zh={t.bz} />
          <span className="tag">{AGE_ZH[t.age] ?? t.age}</span>
          {!!aliases?.length && <span className="note">又名：{aliases.join('、')}</span>}
        </>
      }
      tabsTop={
        (contextCiv || (me && opp)) && (
          <nav className="ctx-bar" aria-label="文明相关入口">
            {contextCiv && (
              <Link className="ctx-civ-link ulink" to={`/civ/${contextCiv.en}`}>
                <CivIcon c={contextCiv} /> {contextCiv.zh}
              </Link>
            )}
            {me && opp && (
              <Link className="community-tool-entry" to={`/matchup?${new URLSearchParams({ me: me.en, opp: opp.en })}`}>
                <Icon name="arrow-left" /> 回对局助手
              </Link>
            )}
          </nav>
        )
      }
      tabs={[
        {
          key: 'ov',
          label: '概览',
          content: (
            <>
              <DetailSection title="研究">
                <dl className="detail-cost-grid">
                  <div>
                    <dt>费用</dt>
                    <dd>
                      <CostView c={t.cost} />
                    </dd>
                  </div>
                  <div>
                    <dt>研究时间</dt>
                    <dd className="detail-number">
                      <StatIcon k="time" t="研究时间" />
                      {t.rt}s
                    </dd>
                  </div>
                  <div>
                    <dt>研究建筑</dt>
                    <dd>
                      <BLink id={t.b} zh={t.bz} />
                    </dd>
                  </div>
                </dl>
              </DetailSection>
              {[202, 203, 221, 55, 182, 278, 279].includes(t.id) && (
                <p>
                  <Link className="ulink tech-payoff-entry" to={`/eco-payoff?civ=Byzantines&target=${t.id}&age=${t.age}`}>
                    查看经济科技收益与研究投入
                  </Link>
                </p>
              )}
              {effectCards.length > 0 && (
                <div className="detail-effect-tiles">
                  <p className="note">基础效果与需要额外科技的组合效果分别列出；请结合生效条件与作用对象阅读，完整说明见「作用对象」。</p>
                  <StatTiles label="科技效果" stats={effectCards.map((card, index) => ({ ...card, accent: index < 2 }))} />
                </div>
              )}
              {t.desc.trim() && (
                <DetailSection title="效果说明">
                  <p className="desc">
                    <Linked text={t.desc} nl />
                    <br />
                    <small className="note">{t.descEn.replace(/\n/g, ' ')}</small>
                  </p>
                </DetailSection>
              )}
              {rel.length > 0 && (
                <>
                  <h4>涉及单位</h4>
                  <div className="uchips">
                    {rel.map((u) => (
                      <UnitLink key={u.id} u={u} />
                    ))}
                  </div>
                </>
              )}
              <DetailSource note="结构化效果与科技模拟器同源；未编码效果以游戏说明为准" />
            </>
          ),
        },
        { key: 'affects', label: '作用对象', content: <TechAffects t={t} /> },
        { key: 'civs', label: '文明', content: civList },
        { key: 'history', label: '更新历史', content: <PatchHistory target={{ targetType: 'tech', targetId: t.id, targetNameZh: t.zh }} /> },
      ]}
      sidebar={
        <>
          <SideBlock title={`可用文明 ${t.civs.length}/${civs.length}`}>
            <div className="tech-civ-links">
              <Join
                sep=" "
                items={t.civs.slice(0, 8).map((n) => {
                  const c = civByEn(n);
                  return c ? <CivChip c={c} /> : n;
                })}
              />
              {t.civs.length > 8 ? ' 等' : ''}
            </div>
            {t.civs.length > 8 && (
              <Link className="ctx-civ-link ulink" to={location.pathname + '?' + allCivsParams}>
                查看全部可用文明
              </Link>
            )}
          </SideBlock>
          {(pre || nxt.length > 0) && (
            <SideBlock title="科技链">
              <div className="uline">
                {pre && (
                  <>
                    前置：
                    <TechLink t={pre} />
                    <br />
                  </>
                )}
                {nxt.length > 0 && (
                  <>
                    后续：
                    <Join
                      sep=" "
                      items={nxt.map((x) => (
                        <TechLink t={x} />
                      ))}
                    />
                  </>
                )}
              </div>
            </SideBlock>
          )}
        </>
      }
    />
  );
}
