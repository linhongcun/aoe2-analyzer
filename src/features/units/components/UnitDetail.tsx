import { ArmorClasses, BonusTable } from '../../simulator/components/SimPanel';
import { useEffect, type ReactNode } from 'react';
import { RangeB } from '../../../shared/ui/RangeB';
import { Link, useLocation } from 'react-router-dom';
import { baseUnit } from '../../../domain/family';
import type { Unit } from '../../../domain/types';
import { civByEn, civs } from '../../../data';
import { useCore, useTrees } from '../../../data/hooks';
import { civStatus, parseUnitPath } from '../../../domain/simulator';
import { AGE_ZH } from '../../../domain/ratings';
import { uniqueCivs, upgradeLine } from '../../../domain/units';
import { civNote, dupPeers } from '../../../domain/dupNames';
import { confusablesOf } from '../../../data/confusables';
import { Icon } from '../../../shared/ui/Icon';
import { DPS_UNAVAILABLE_REASON } from '../../../domain/duel';
import { CivChip, CivIcon, CostView, DlcBadgeL, StatIcon, TechLink, UnitIcon, UnitLink } from '../../../shared/ui/art';
import { BLink } from '../../buildings/components/BLink';
import { DetailPage, SideBlock } from '../../../shared/ui/layout';
import { Join, Linked, Loading, Sep } from '../../../shared/ui/widgets';
import Simulator from '../../simulator/components/Simulator';
import UnitList from './UnitList';
import { discountedCost, priceAge } from '../../../domain/costDiscount';
import { DEFAULT_AGE, fmtClock, gatherModel, realCost } from '../../../domain/realCost';
import { Basis } from '../../duel/components/RealCost';

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
      <b data-t="rc-uline-time">≈ 1 个村民 {fmtClock(rc.total)}</b>
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
  const stats: [string, string, ReactNode][] = [
    ['hp', '生命值 HP', u.hp],
    [u.rng > 1 ? 'patk' : 'atk', '攻击力', u.atk],
    ['marm', '近战护甲', u.ma],
    ['parm', '穿刺护甲', u.pa],
    [
      'range',
      '射程',
      <>
        {u.rng + (u.minr ? `（最小 ${u.minr}）` : '')}
        <RangeB u={u} />
      </>,
    ],
    ['speed', '移动速度', u.spd],
    ['', '视野', u.los],
    [
      'rof',
      '攻击间隔',
      u.rof > 0 ? (
        u.rof + 's'
      ) : (
        <>
          —
          <small className="note rof-reason" data-t="rof-reason">
            {DPS_UNAVAILABLE_REASON}
          </small>
        </>
      ),
    ],
    ['', '准确度', u.acc + '%'],
    ...(u.blast ? [['blast', '溅射范围', u.blast] as [string, string, number]] : []),
  ];
  const rel = core.techs.filter((t) => t.desc.includes(u.zh)).slice(0, 16);
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
              {elite && <EliteDiff base={base} elite={elite} />}
              <p>
                <b>造价：</b>
                <CostView c={u.cost} />　<b>生产时间：</b>
                <StatIcon k="time" t="生产时间" />
                {u.tt}s　<b>建筑：</b>
                <BLink id={u.b} zh={u.bz} />（{u.ben}）
              </p>
              <GatherLine u={u} civ={rt.civ} age={rt.age} />
              <div className="two">
                <div>
                  <table className="stat">
                    <tbody>
                      {stats.map((r) => (
                        <tr key={r[1]}>
                          <td>
                            <StatIcon k={r[0]} t={r[1]} />
                            {r[1]}
                          </td>
                          <td>{r[2]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <BonusTable B={Object.fromEntries(u.atks.filter(([n]) => n !== '近战' && n !== '穿刺'))} />
                  <ArmorClasses list={u.armc} />
                  {u.up && (
                    <>
                      <h4>升级研究</h4>
                      <p>
                        从上一级升级为 {u.zh}：<CostView c={u.up[0]} /> <StatIcon k="time" t="研究时间" />
                        {u.up[1]}s
                      </p>
                    </>
                  )}
                </div>
              </div>
              <h4>说明</h4>
              <p className="desc">
                <Linked text={u.desc} nl />
              </p>
              <p className="note">数据来自 aoe2techtree（基础数值，未含文明加成与科技）</p>
            </>
          ),
        },
        ...(u.civs.length ? [{ key: 'sim', label: '科技模拟器', content: <Simulator key={u.id} u={u} route={rt} /> }] : []),
        {
          key: 'rel',
          label: '相关',
          content: (
            <>
              {rel.length > 0 && (
                <>
                  <h4>相关科技</h4>
                  <div className="uchips">
                    {rel.map((t) => (
                      <TechLink key={t.id} t={t} />
                    ))}
                  </div>
                </>
              )}
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
          {rel.length > 0 && (
            <SideBlock title="相关科技">
              <div className="uchips">
                {rel.slice(0, 6).map((t) => (
                  <TechLink key={t.id} t={t} />
                ))}
              </div>
            </SideBlock>
          )}
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

const DIFF: [keyof Unit, string, string][] = [
  ['hp', 'hp', '生命值'],
  ['atk', 'atk', '攻击力'],
  ['ma', 'marm', '近战护甲'],
  ['pa', 'parm', '穿刺护甲'],
  ['rng', 'range', '射程'],
  ['spd', 'speed', '移动速度'],
  ['los', '', '视野'],
  ['rof', 'rof', '攻击间隔'],
  ['acc', '', '准确度'],
  ['tt', 'time', '生产时间'],
];
const fmt = (x: number) => String(Math.round(x * 100) / 100);
/** 普通 vs 精锐：只列出有差异的属性，以及精锐升级的研究费用 */
function EliteDiff({ base, elite }: { base: Unit; elite: Unit }) {
  const rows = DIFF.filter(([k]) => base[k] !== elite[k]);
  const ab = (u: Unit) => Object.fromEntries(u.atks.filter(([n]) => n !== '近战' && n !== '穿刺'));
  const A = ab(base),
    B = ab(elite);
  const bon = [...new Set([...Object.keys(A), ...Object.keys(B)])].filter((k) => (A[k] ?? 0) !== (B[k] ?? 0));
  // 攻击间隔、生产时间越小越好
  const good = (k: string, d: number) => (k === 'rof' || k === 'tt' ? d < 0 : d > 0);
  const sign = (d: number) => (d > 0 ? '+' : '') + fmt(d);
  return (
    <div className="ediffbox" id="ediff">
      <h4>普通与精锐对比（仅列出有变化的项）</h4>
      <table className="stat ediff">
        <thead>
          <tr>
            <td></td>
            <td>普通</td>
            <td>精锐</td>
            <td>变化</td>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, ic, zh]) => {
            const a = base[k] as number,
              b = elite[k] as number;
            return (
              <tr key={k}>
                <td>
                  <StatIcon k={ic} t={zh} />
                  {zh}
                </td>
                <td>{fmt(a)}</td>
                <td>
                  <b>{fmt(b)}</b>
                </td>
                <td className={good(k, b - a) ? 'up' : 'dn'}>{sign(b - a)}</td>
              </tr>
            );
          })}
          {bon.map((k) => {
            const d = (B[k] ?? 0) - (A[k] ?? 0);
            return (
              <tr key={'b' + k}>
                <td>对 {k} 加成</td>
                <td>{A[k] ?? 0}</td>
                <td>
                  <b>{B[k] ?? 0}</b>
                </td>
                <td className={d > 0 ? 'up' : 'dn'}>{sign(d)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {elite.up && (
        <p className="note">
          精锐升级研究：
          <CostView c={elite.up[0]} /> <StatIcon k="time" t="研究时间" />
          {elite.up[1]}s
        </p>
      )}
    </div>
  );
}
