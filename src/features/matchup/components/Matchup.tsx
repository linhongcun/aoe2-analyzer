import { useEffect } from 'react';
import RushDefense, { RushReference, RushSegmentedPicker } from './RushDefense';
import './matchup-pair.css';
import { ListHead } from '../../../shared/ui/layout';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { civs, civByEn } from '../../../data';
import { matchupComparePath, matchupDuelPath } from '../../../domain/matchupDuelSeed';
import { TYPE_ZH, filterCounterUnits } from '../../../domain/ratings';
import { unitPath } from '../../../domain/simRoute';
import { UnitIcon } from '../../../shared/ui/art';
import { useSticky } from '../../../shared/utils/sticky';
import { Loading } from '../../../shared/ui/widgets';
import { Link, useSearchParams } from 'react-router-dom';
import { matchupBuildPath, matchupUnitPath, readMatchupPair, writeMatchupPair, writeExplicitMatchupPair } from '../../../domain/matchupRoute';
import { Icon } from '../../../shared/ui/Icon';
import { counterExtra } from '../availability';
import { useMatchupData } from '../useMatchupData';
import ChampiAges from './ChampiAges';

const LEDE = '选定双方文明，打开跟这对阵走的开局和练习。早期应对和类型反制是通用参考，不会改写成针对对手的专属打法。';
const PAIR_SCOPE = '下面的开局、文明页和练习入口会带上这对文明。';
const SHARE_HINT = '可复制地址栏链接分享这对阵';
const LAUNCH_READY_NOTE = '自动带入双方文明（进入单位 PK 时按各自可用起始单位预填，如无骑士文明自动避开不可用兵种；非系统推荐，请按本局实际兵种切换）。';
const LAUNCH_MIRROR_NOTE = '自动带入双方文明（进入单位 PK 时按可用起始单位预填；非系统推荐，请按本局实际兵种切换）。双方文明相同时暂不进入文明对比。';
const LAUNCH_INCOMPLETE_NOTE = '选定双方文明后可自动带入单位 PK 与文明对比；当前点击单位 PK 将打开通用入口。';
const EMPTY_COUNTERS = '当前我方暂无可用的类型对照单位';
const COUNTER_PENDING = '选定双方文明后，会按对手登记类型取出通用对照表，再只列出我方能造的单位。这里不生成针对某个对手的专属分析。';
const SIM_LIMIT =
  '以下单位链到模拟器时，默认帝王时代，未勾选科技与团队加成；仍计入已建模文明加成，可在模拟器调整，不代表本局进度。当前 PK 采用近似计算，忽略射程、走位/风筝、地形高低差、冲锋攻击和溅射；击杀时间不能证明能否贴脸或绕后。';

export default function Matchup() {
  const { data, error, retry } = useMatchupData();
  const core = data?.core;
  const [ia, setA] = useSticky('mu.a', 16),
    [ie, setE] = useSticky('mu.e', 5);
  const [params, setParams] = useSearchParams();
  const pair = readMatchupPair(params, { me: (civs[ia] ?? civs[16]!).en, opp: (civs[ie] ?? civs[5]!).en });
  const a = pair.me === null ? undefined : civByEn(pair.me),
    e = pair.opp === null ? undefined : civByEn(pair.opp);
  // Query 先于 sticky；同步后，从其它页面回到无 query 的助手仍保留这对阵。
  useEffect(() => {
    if (!a || !e) return;
    const nextA = civs.indexOf(a),
      nextE = civs.indexOf(e);
    if (ia !== nextA) setA(nextA);
    if (ie !== nextE) setE(nextE);
  }, [a, e, ia, ie, setA, setE]);
  const pick = (side: 'me' | 'opp', en: string) => {
    const me = side === 'me' ? en || null : (a?.en ?? null),
      opp = side === 'opp' ? en || null : (e?.en ?? null);
    setParams(params.has('pair') || !me || !opp ? writeExplicitMatchupPair(params, me, opp) : writeMatchupPair(params, me, opp));
  };
  const swapDisabled = a?.en === e?.en;
  const swap = () => {
    if (a?.en === e?.en) return;
    const nextMe = e?.en ?? null;
    const nextOpp = a?.en ?? null;
    setParams(params.has('pair') || !nextMe || !nextOpp ? writeExplicitMatchupPair(params, nextMe, nextOpp) : writeMatchupPair(params, nextMe, nextOpp));
  };
  const both = Boolean(a && e);
  const mirror = Boolean(both && a && e && a.en === e.en);
  const duelHref = both && a && e ? matchupDuelPath(data, a.en, e.en) : null;
  const compareHref = both && a && e ? matchupComparePath(a.en, e.en) : null;
  const counters = core && a && e ? filterCounterUnits(a.en, e.ty, core.units) : [];
  const lineCivs = core?.unitById[2550]?.civs;
  const champiPair = Array.isArray(lineCivs) && [a?.en, e?.en].some((civ) => civ && lineCivs.includes(civ));
  const typeNames = e ? e.ty.map((t) => TYPE_ZH[t]).join('、') || '（无登记类型）' : '';
  const launchNote = !both
    ? LAUNCH_INCOMPLETE_NOTE
    : !data
      ? `${error ? '资料加载失败，暂以通用入口打开单位 PK；' : '正在核对双方可用起始单位，就绪后自动带入单位 PK；'}${mirror ? '双方文明相同时暂不进入文明对比。' : '文明对比已可直接带入当前双方。'}`
      : mirror
        ? LAUNCH_MIRROR_NOTE
        : LAUNCH_READY_NOTE;
  return (
    <section id="matchup" className={params.has('pair') || champiPair ? 'pane matchup-explicit' : 'pane'}>
      <ListHead level={1} title="对局助手" desc={LEDE} />
      <section className="mu-region mu-region-pair" aria-labelledby="mu-pair-title">
        <p className="mu-kicker">跟选择走</p>
        <h2 id="mu-pair-title">当前对局</h2>
        <div className={`mu-pair-layout${both ? ' mu-pair-ready' : ''}`}>
          <div className="mu-setup">
            <div className="mu-picks">
              <div className="mu-pick">
                <label htmlFor="ma">我的文明</label>
                <CivPicker id="ma" label="我的文明" value={a?.en ?? ''} none="未选择" onChange={(en) => pick('me', en)} />
              </div>
              <button type="button" className="mu-swap" aria-label="互换我方与对手文明" disabled={swapDisabled} onClick={swap}>
                <Icon name="arrow-left-right" />
                <span>互换</span>
              </button>
              <div className="mu-pick">
                <label htmlFor="me">对手文明</label>
                <CivPicker id="me" label="对手文明" value={e?.en ?? ''} none="未选择" onChange={(en) => pick('opp', en)} />
              </div>
            </div>
            {pair.invalid && (
              <p className="note" role={params.has('pair') ? 'alert' : undefined}>
                {params.has('pair') ? '链接中的对阵信息无效，请重新选择文明' : '链接中的文明无效，已用上次选择'}
              </p>
            )}
            {!both && (
              <p role="status">
                {!a && !e ? '请补选双方文明后查看跟对阵走的入口。' : !a ? '请补选我方文明后查看跟对阵走的入口。' : '请补选对手文明后查看跟对阵走的入口。'}
              </p>
            )}
            {both && a && e && (
              <>
                <p className="mu-scope">{PAIR_SCOPE}</p>
                {!pair.invalid && params.has('me') && params.has('opp') && <p className="note">{SHARE_HINT}</p>}
                <nav className="mu-tools" aria-label="跟这对文明走的开局与文明页">
                  <Link className="community-tool-entry mu-chip" to={matchupBuildPath(a.en, e.en, 'me')}>
                    <Icon name="list-ordered" />
                    我方开局
                  </Link>
                  <Link className="community-tool-entry mu-chip" to={matchupBuildPath(a.en, e.en, 'opp')}>
                    <Icon name="list-ordered" />
                    对手开局
                  </Link>
                  <Link className="community-tool-entry mu-chip" to={`/civ/${a.en}`}>
                    <Icon name="shield" />
                    我方文明
                  </Link>
                  <Link className="community-tool-entry mu-chip" to={`/civ/${e.en}`}>
                    <Icon name="shield" />
                    对手文明
                  </Link>
                </nav>
              </>
            )}
            <div className="mu-launch">
              <p className="mu-launch-title">{both && a && e ? `带入当前双方继续计算（${a.zh} 对 ${e.zh}）` : '带入双方继续计算'}</p>
              <div className="mu-launch-actions">
                {duelHref ? (
                  <Link className="mu-launch-btn mu-launch-primary" to={duelHref}>
                    <Icon name="swords" />
                    <span>单位 PK</span>
                  </Link>
                ) : (
                  <Link className="mu-launch-btn mu-launch-primary" to="/duel" aria-label="单位 PK（通用入口）">
                    <Icon name="swords" />
                    <span>单位 PK</span>
                  </Link>
                )}
                {compareHref ? (
                  <Link className="mu-launch-btn mu-launch-secondary" to={compareHref}>
                    <Icon name="scale" />
                    <span>文明对比</span>
                  </Link>
                ) : (
                  <button type="button" className="mu-launch-btn mu-launch-secondary" disabled aria-disabled="true">
                    <Icon name="scale" />
                    <span>{mirror ? '文明对比（双方相同）' : '文明对比'}</span>
                  </button>
                )}
              </div>
              <p className="mu-launch-note">{launchNote}</p>
            </div>
          </div>
          {both && a && e ? (
            <div className="mu-practice">
              <RushDefense own={a} enemy={e} data={data} loadError={error}>
                {champiPair && core && data ? <ChampiAges core={core} trees={data.trees} me={a.en} opp={e.en} /> : null}
              </RushDefense>
              {error && (
                <div data-testid="matchup-data-error">
                  <p role="alert">对局资料加载失败，暂时无法核对演练和开局。请刷新页面重试。</p>
                  <p>
                    已选文明保留。
                    <button type="button" style={{ minHeight: 44, minWidth: 44 }} onClick={retry}>
                      重试资料
                    </button>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="mu-generic-rush">
              <RushSegmentedPicker />
              <RushReference own={a} data={data} />
            </div>
          )}
        </div>
      </section>
      <section className="mu-toolbox" aria-labelledby="mu-toolbox-title">
        <h2 id="mu-toolbox-title">战术工具：按观察继续判断</h2>
        <p className="mu-scope">三个独立战术工具；不会自动带入上方文明，请在工具内填写本局观察。</p>
        <nav className="mu-tactic-grid" aria-label="对局助手有限指南">
          <Link className="mu-tactic-card" to="/matchup/scouting">
            <span className="mu-tactic-icons">
              <Icon name="search" />
              <Icon name="arrow-right" />
            </span>
            <strong>先辨析侦察线索与缺失信息</strong>
            <span className="mu-tactic-description">记录实际观察，区分已有证据与待确认线索。</span>
          </Link>
          <Link className="mu-tactic-card" to="/matchup/mixed-army">
            <span className="mu-tactic-icons">
              <Icon name="swords" />
              <Icon name="arrow-right" />
            </span>
            <strong>按敌军组合查看混兵情境</strong>
            <span className="mu-tactic-description">按敌军组合和已确认条件，核对兵种分工。</span>
          </Link>
          <Link className="mu-tactic-card" to="/matchup/castle-defense">
            <span className="mu-tactic-icons">
              <Icon name="tower-control" />
              <Icon name="arrow-right" />
            </span>
            <strong>城堡前置：按当前局面查看应对</strong>
            <span className="mu-tactic-description">按观察阶段，梳理当前行动与后续准备。</span>
          </Link>
        </nav>
        <nav className="mu-related-tools" aria-label="情境与队伍规划">
          <Link to="/match-review">
            <Icon name="scroll" />
            记录本局疑问与下次练习重点
          </Link>
          <Link to="/team-plan">
            <Icon name="users" />
            记录队友分工与支援约定
          </Link>
        </nav>
      </section>
      <section className="mu-region mu-region-ref" aria-labelledby="mu-ref-title">
        {both && a && e && core && data ? (
          <div id="mres" className="mu-ref-block">
            <h2 id="mu-ref-title">通用类型反制参考</h2>
            <p className="mu-scope">
              <span className="mu-tag">通用示意</span>
              按对手登记类型（当前：{typeNames}）取出通用对照表，再只列出我方能造的单位。不是对{e.zh}的专属分析，也不是模型结论。
            </p>
            {e.ty.map((t) => (
              <p key={t} className="note">
                <b>{TYPE_ZH[t]}：</b>
                {counterExtra(data, a.en, t)}
              </p>
            ))}
            {counters.length === 0 ? (
              <p className="note">{EMPTY_COUNTERS}</p>
            ) : (
              <ul className="matchup-counter-list">
                {counters.map((u) => {
                  const unit = core.units.find((x) => x.id === u.id);
                  return (
                    <li key={u.id}>
                      <Link className="ulink matchup-counter-link" to={matchupUnitPath(u.id, a.en, e.en)}>
                        {unit && <UnitIcon u={unit} />}
                        <span>{u.nameZh}</span>
                      </Link>
                      {unit?.civs.includes(a.en) && (
                        <Link
                          className="community-tool-entry matchup-sim-link"
                          to={unitPath(u.id, a.en, 4, [], []) + '?tab=sim'}
                          aria-label={`${u.nameZh}：用${a.zh}模拟`}
                        >
                          用{a.zh}模拟
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <details className="mu-fold">
              <summary>
                <span>模拟默认与 PK 限制</span>
                <Icon name="chevron-down" className="ic mu-fold-chevron" />
              </summary>
              <p>{SIM_LIMIT}</p>
              <p>
                <Link to="/duel">查看 PK 模型能力与限制</Link>
              </p>
            </details>
          </div>
        ) : (
          <div className="mu-ref-block">
            <h2 id="mu-ref-title">通用类型反制参考</h2>
            {both ? (
              error ? null : (
                <Loading />
              )
            ) : (
              <p className="mu-scope">
                <span className="mu-tag">通用示意</span>
                {COUNTER_PENDING}
              </p>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
