import { ArmorClasses, BonusTable } from '../../../shared/ui/sim/SimPanel';
import { useEffect } from 'react';
import { RangeB } from '../../../shared/ui/RangeB';
import { RangeHelp } from '../../../shared/ui/RangeHelp';
import { Link, useLocation } from 'react-router-dom';
import { baseUnit } from '../../../domain/family';
import type { Unit } from '../../../domain/types';
import { civByEn, civs } from '../../../data';
import { useCore, useTrees } from '../../../data/hooks';
import { civStatus, makeSimContext, parseUnitPath } from '../../../domain/simulator';
import { unitRelatedTechs, type UnitRelatedTech } from '../../../domain/relatedTechs';
import { AGE_ZH } from '../../../domain/ratings';
import { uniqueCivs, upgradeLine } from '../../../domain/units';
import { civNote, dupPeers } from '../../../domain/dupNames';
import { confusablesOf } from '../../../data/confusables';
import { Icon } from '../../../shared/ui/Icon';
import { DPS_UNAVAILABLE_REASON } from '../../../domain/duel';
import { CivChip, CivIcon, CostView, DlcBadgeL, StatIcon, TechLink, UnitIcon, UnitLink } from '../../../shared/ui/art';
import { BLink } from '../../../shared/ui/BLink';
import { DetailPage, SideBlock } from '../../../shared/ui/layout';
import { DetailSection, DetailSource, StatTiles, type DetailStat } from '../../../shared/ui/DetailBlocks';
import { Join, Linked, Loading, Sep } from '../../../shared/ui/widgets';
import Simulator from '../../../shared/ui/sim/Simulator';
import UnitList from './UnitList';
import { discountedCost, priceAge } from '../../../domain/costDiscount';
import { DEFAULT_AGE, fmtClock, gatherModel, realCost } from '../../../domain/realCost';
import { Basis } from '../../../shared/ui/RealCost';

/** #88 S8：费用下面一行「采集时间 ≈ 1 个村民 m:ss」；时代跟页面所选，未选默认城堡；未选文明按通用速度 */
function GatherLine({ u, civ, age }: { u: Unit; civ?: string; age?: number }) {
  const a = Math.max(u.age, age ?? DEFAULT_AGE);
  const cost = civ && u.civs.includes(civ) ? discountedCost(u, civ, priceAge(u.age, a)).cost : u.cost;
  const rc = realCost(cost, gatherModel(a, civ && u.civs.includes(civ) ? civ : ''));
  if (!(rc.total > 0)) return null;
  return (
    <div className="rc-uline" data-t="rc-uline">
      <Icon name="clock" className="ic" />
      <span className="k">采集时间</span>
      <b className="tl-num" data-t="rc-uline-time">
        ≈ 1 个村民 {fmtClock(rc.total)}
      </b>
      {rc.hasFood && (
        <small className="rc-ns" data-t="rc-noseed">
          不含播种
        </small>
      )}
      <small className="rc-res">
        {AGE_ZH[a]}
        {rc.hasFood ? ' · 按农田计' : ''}
      </small>
      <Basis age={a} food={rc.hasFood} compact />
    </div>
  );
}

const UT: Record<string, string> = { UniqueUnit: '独特单位', Unit: '通用单位', UnitUpgrade: '升级单位', RegionalUnit: '区域单位' };

/** 升级路线中的一项；独特单位带灰色小标签「{单位} · {文明}」+ 文明图标（#10） */
function UnitLineItem({ x }: { x: Unit }) {
  const trees = useTrees();
  const c = trees ? civByEn(uniqueCivs(x, trees)[0] ?? '') : undefined;
  if (!c) return <UnitLink u={x} />;
  return (
    <span className="uline-uu">
      <UnitLink u={x} />
      <span className="uu-tag" data-t="uu-tag">
        <CivIcon c={c} />
        {x.zh} · {c.zh}
      </span>
    </span>
  );
}

function RelatedTechs({ items, compact = false, civ }: { items: UnitRelatedTech[]; compact?: boolean; civ?: string }) {
  const chips = (list: UnitRelatedTech[]) => (
    <div className="uchips">
      {list.map(({ t, civs }) => (
        <span key={t.id} className="unit-related-tech">
          <TechLink t={t} />
          {!!civs.length && <small className="note">{civs.map((c) => civByEn(c)?.zh ?? c).join('、')}限定</small>}
        </span>
      ))}
    </div>
  );
  return (
    <div data-t="unit-related-techs">
      <p className="note">已建模的数值科技；{civ ? `按${civByEn(civ)?.zh ?? civ}科技树筛选` : '通用科技仍以各文明科技树为准'}。未建模的说明效果未列入。</p>
      {items.length ? (
        <>
          {chips(compact ? items.slice(0, 6) : items)}
          {compact && items.length > 6 && (
            <details className="unit-related-more">
              <summary>展开其余 {items.length - 6} 项科技</summary>
              {chips(items.slice(6))}
            </details>
          )}
        </>
      ) : (
        <p className="note">当前单位暂无已建模的数值科技</p>
      )}
    </div>
  );
}

export default function UnitDetail() {
  const loc = useLocation();
  const core = useCore();
  const trees = useTrees();
  const rt = parseUnitPath(loc.pathname);
  const u = core && rt ? core.unitById[rt.id] : undefined;
  const hasCiv = !!rt?.civ;
  useEffect(() => {
    if (!hasCiv) scrollTo(0, 0);
  }, [rt?.id, hasCiv]);
  if (!core)
    return (
      <section className="pane">
        <Loading />
      </section>
    );
  if (!u || !rt) return <UnitList />;
  const base = baseUnit(u, core.fam);
  const elite = core.fam.eliteOf[base.id];
  const isE = u.id !== base.id;
  // 切换普通/精锐时保留路径中的模拟器状态（文明/时代/科技）
  const swap = (id: number) => loc.pathname.replace(/^\/unit\/\d+/, '/unit/' + id) + loc.search;
  // 有文明上下文时按该文明科技树选分叉（#10）
  const st = rt.civ && trees ? civStatus(trees, rt.civ) : null;
  const ln = upgradeLine(u, core.units, core.unitById, st ? (id) => st['u' + id] === 1 : undefined).filter((x) => !core.fam.baseOf[x.id] || x.id === u.id);
  const stats: DetailStat[] = [
    { key: 'hp', icon: 'hp', label: '生命值 HP', value: u.hp, accent: true, change: isE ? u.hp - base.hp : undefined },
    { key: 'atk', icon: u.rng > 1 ? 'patk' : 'atk', label: '攻击力', value: u.atk, accent: true, change: isE ? u.atk - base.atk : undefined },
    { key: 'ma', icon: 'marm', label: '近战护甲', value: u.ma, change: isE ? u.ma - base.ma : undefined },
    { key: 'pa', icon: 'parm', label: '穿刺护甲', value: u.pa, change: isE ? u.pa - base.pa : undefined },
    {
      key: 'rng',
      icon: 'range',
      label: '射程',
      value: u.rng,
      change: isE ? u.rng - base.rng : undefined,
      note: (
        <>
          <RangeB u={u} />
          <RangeHelp u={u} />
          {u.minr ? `最小射程 ${u.minr}` : null}
        </>
      ),
    },
    { key: 'spd', icon: 'speed', label: '移动速度', value: u.spd, change: isE ? u.spd - base.spd : undefined },
    { key: 'los', label: '视野', value: u.los, change: isE ? u.los - base.los : undefined },
    {
      key: 'rof',
      icon: 'rof',
      label: '攻击间隔',
      value: u.rof > 0 ? `${u.rof}s` : '—',
      change: isE && u.rof > 0 && base.rof > 0 ? u.rof - base.rof : undefined,
      lowerIsBetter: true,
      note:
        u.rof > 0 ? undefined : (
          <span className="rof-reason" data-t="rof-reason">
            {DPS_UNAVAILABLE_REASON}
          </span>
        ),
    },
  ];
  const rel = trees ? unitRelatedTechs(makeSimContext(core.techs, trees), u, rt.civ) : null;
  const cz = (en: string) => civByEn(en)?.zh;
  // #44「相关」第一项：完全重名（自动识别）与易混淆（对照表）互斥，一个单位只出现其中一种
  const peers = dupPeers(base, core.units);
  const conf = peers.length
    ? []
    : confusablesOf(base.id)
        .map((c) => ({ u: core.unitById[c.other], reason: c.reason }))
        .filter((c) => c.u);
  const showNote = peers.length > 0 || conf.length > 0;
  const wantSim = hasCiv || new URLSearchParams(loc.search).get('tab') === 'sim';
  return (
    <DetailPage
      key={base.id}
      id="unit"
      crumb={u.zh}
      icon={<UnitIcon u={u} big />}
      title={u.zh}
      titleNote={showNote ? civNote(u, cz) : undefined}
      en={u.en}
      badges={<DlcBadgeL i={u.dlc} />}
      tags={
        <>
          <span className="tag">{UT[u.type] ?? u.type}</span>
          <BLink id={u.b} zh={u.bz} />
          <span className="tag">{AGE_ZH[u.age] ?? u.age}</span>
        </>
      }
      tabsTop={
        elite ? (
          <div className="eseg" role="radiogroup" aria-label="普通/精锐">
            <Link role="radio" aria-checked={!isE} className={isE ? undefined : 'on'} to={swap(base.id)} replace>
              普通
            </Link>
            <Link role="radio" aria-checked={isE} className={isE ? 'on' : undefined} to={swap(elite.id)} replace>
              精锐
            </Link>
          </div>
        ) : undefined
      }
      initialTab={wantSim && u.civs.length ? 'sim' : 'ov'}
      tabs={[
        {
          key: 'ov',
          label: '概览',
          content: (
            <>
              <DetailSection title="造价与生产">
                <dl className="detail-cost-grid">
                  <div>
                    <dt>造价</dt>
                    <dd>
                      <CostView c={u.cost} />
                    </dd>
                  </div>
                  <div>
                    <dt>生产时间</dt>
                    <dd className="detail-number">
                      <StatIcon k="time" t="生产时间" />
                      {u.tt}s
                    </dd>
                  </div>
                  <div>
                    <dt>生产建筑</dt>
                    <dd>
                      <BLink id={u.b} zh={u.bz} />
                    </dd>
                  </div>
                </dl>
                <GatherLine u={u} civ={rt.civ} age={rt.age} />
              </DetailSection>
              <StatTiles stats={stats} label="基础属性" />
              <div className="two">
                <div>
                  <DetailSection title="其他属性">
                    <table className="stat">
                      <tbody>
                        <tr>
                          <td>准确度</td>
                          <td className="detail-number">{u.acc}%</td>
                        </tr>
                        {!!u.blast && (
                          <tr>
                            <td>
                              <StatIcon k="blast" t="溅射范围" />
                              溅射范围
                            </td>
                            <td>{u.blast}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </DetailSection>
                  {u.up && (!elite || u.id !== elite.id) && (
                    <DetailSection title="升级研究">
                      <p>
                        从上一级升级为 {u.zh}：<CostView c={u.up[0]} />{' '}
                        <span className="detail-number">
                          <StatIcon k="time" t="研究时间" />
                          {u.up[1]}s
                        </span>
                      </p>
                    </DetailSection>
                  )}
                </div>
                <div>
                  {u.atks.some(([n]) => n !== '近战' && n !== '穿刺') && (
                    <BonusTable B={Object.fromEntries(u.atks.filter(([n]) => n !== '近战' && n !== '穿刺'))} />
                  )}
                  {u.armc.length > 0 && <ArmorClasses list={u.armc} />}
                </div>
              </div>
              {elite && <EliteDiff base={base} elite={elite} />}
              <h4>说明</h4>
              <p className="desc">
                <Linked text={u.desc} nl />
              </p>
              <DetailSource />
            </>
          ),
        },
        ...(u.civs.length ? [{ key: 'sim', label: '科技模拟器', content: <Simulator key={u.id} u={u} route={rt} /> }] : []),
        {
          key: 'rel',
          label: '相关',
          content: (
            <>
              <h4>相关科技</h4>
              {rel ? <RelatedTechs items={rel} civ={rt.civ} /> : <Loading />}
              <h4>
                拥有该单位的文明（{u.civs.length}/{civs.length}）
              </h4>
              <div>
                <Join
                  sep=" "
                  items={u.civs.map((n) => {
                    const c = civByEn(n);
                    return c ? <CivChip c={c} /> : n;
                  })}
                />
              </div>
            </>
          ),
        },
      ]}
      sidebar={
        <>
          {(peers.length > 0 || conf.length > 0) && (
            <SideBlock title="相关">
              <div className="rel-first" data-t="rel-first">
                {peers.map((p) => (
                  <Link key={p.id} className="rel-row" to={`/unit/${p.id}`} data-t="dup-link">
                    <Icon name="copy" />
                    <span className="rel-tx">
                      同名单位：{p.zh}
                      <span className="civnote">{civNote(p, cz)}</span>
                    </span>
                    <Icon name="chevron-right" className="ic rel-chev" />
                  </Link>
                ))}
                {conf.map(({ u: o, reason }) => (
                  <Link key={o!.id} className="rel-row" to={`/unit/${o!.id}`} data-t="conf-link">
                    <Icon name="info" />
                    <span className="rel-tx">
                      别和 {o!.zh} 混淆
                      {reason && <span className="rel-reason">{reason}</span>}
                    </span>
                    <Icon name="chevron-right" className="ic rel-chev" />
                  </Link>
                ))}
              </div>
            </SideBlock>
          )}
          <SideBlock title="升级路线">
            <div className="uline vline">
              <Join
                sep={<Sep />}
                items={ln.map((x) =>
                  x.id === u.id ? (
                    <b className="cur">
                      <UnitIcon u={x} />
                      {x.zh}
                    </b>
                  ) : (
                    <UnitLineItem x={x} />
                  ),
                )}
              />
            </div>
          </SideBlock>
          <SideBlock title="相关科技">{rel ? <RelatedTechs items={rel} compact civ={rt.civ} /> : <Loading />}</SideBlock>
          <SideBlock title={`可用文明 ${u.civs.length}/${civs.length}`}>
            <p className="note">
              {u.civs
                .slice(0, 8)
                .map((n) => civByEn(n)?.zh ?? n)
                .join('、')}
              {u.civs.length > 8 ? ' 等' : ''}
            </p>
          </SideBlock>
        </>
      }
    />
  );
}

const fmt = (x: number) => String(Math.round(x * 100) / 100);
/** 属性变化已放入统计卡；这里只保留升级费用、生产时间及克制加成差异。 */
function EliteDiff({ base, elite }: { base: Unit; elite: Unit }) {
  const ab = (u: Unit) => Object.fromEntries(u.atks.filter(([n]) => n !== '近战' && n !== '穿刺'));
  const A = ab(base),
    B = ab(elite);
  const bon = [...new Set([...Object.keys(A), ...Object.keys(B)])].filter((k) => (A[k] ?? 0) !== (B[k] ?? 0));
  if (!elite.up && !bon.length && base.acc === elite.acc && base.tt === elite.tt) return null;
  return (
    <section className="detail-section" id="ediff" aria-label="精锐升级">
      <h2>精锐升级</h2>
      {elite.up && (
        <p>
          精锐升级研究：
          <CostView c={elite.up[0]} />{' '}
          <span className="detail-number">
            <StatIcon k="time" t="研究时间" />
            {elite.up[1]}s
          </span>
        </p>
      )}
      {(bon.length > 0 || base.acc !== elite.acc || base.tt !== elite.tt) && (
        <ul className="detail-upgrade-notes">
          {base.acc !== elite.acc && (
            <li>
              准确度：<span className="detail-number">{base.acc}%</span> 至 <span className="detail-number">{elite.acc}%</span>
            </li>
          )}
          {base.tt !== elite.tt && (
            <li>
              生产时间：<span className="detail-number">{base.tt}s</span> 至 <span className="detail-number">{elite.tt}s</span>
            </li>
          )}
          {bon.map((k) => (
            <li key={k}>
              对 {k} 加成：<span className="detail-number">{A[k] ?? 0}</span> 至 <span className="detail-number">{B[k] ?? 0}</span>（
              <span className={(B[k] ?? 0) > (A[k] ?? 0) ? 'g detail-number' : 'r detail-number'}>
                {(B[k] ?? 0) - (A[k] ?? 0) > 0 ? '+' : ''}
                {fmt((B[k] ?? 0) - (A[k] ?? 0))}
              </span>
              ）
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
