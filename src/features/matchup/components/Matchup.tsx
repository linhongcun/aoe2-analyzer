import { useEffect } from 'react';
import RushDefense, { RushReference } from './RushDefense';
import './matchup-pair.css';
import { ListHead } from '../../../shared/ui/layout';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { civs } from '../../../data';
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
const PK_NOTE = '不自动带入当前双方';
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
  const a = civs.find((c) => c.en === pair.me),
    e = civs.find((c) => c.en === pair.opp);
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
  const both = Boolean(a && e);
  const counters = core && a && e ? filterCounterUnits(a.en, e.ty, core.units) : [];
  const lineCivs = core?.unitById[2550]?.civs;
  const champiPair = Array.isArray(lineCivs) && [a?.en, e?.en].some((civ) => civ && lineCivs.includes(civ));
  const typeNames = e ? e.ty.map((t) => TYPE_ZH[t]).join('、') || '（无登记类型）' : '';
  return (
    <section id="matchup" className={params.has('pair') || champiPair ? 'pane matchup-explicit' : 'pane'}>
      <ListHead level={1} title="对局助手" desc={LEDE} />
      <section className="mu-region mu-region-pair" aria-labelledby="mu-pair-title">
        <p className="mu-kicker">跟选择走</p>
        <h2 id="mu-pair-title">当前对局</h2>
        <div className="mu-picks">
          <div className="mu-pick">
            <label htmlFor="ma">我的文明</label>
            <CivPicker id="ma" label="我的文明" value={a?.en ?? ''} none="未选择" onChange={(en) => pick('me', en)} />
          </div>
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
        <p className="mu-pk">
          <Link className="community-tool-entry mu-chip" to="/duel" aria-label="单位 PK，不自动带入当前双方">
            <Icon name="swords" />
            单位 PK
          </Link>
          <span className="mu-pk-note">{PK_NOTE}</span>
        </p>
        {both && a && e && (
          <>
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
          </>
        )}
      </section>
      <section className="mu-region mu-region-ref" aria-labelledby="mu-ref-title">
        <p className="mu-kicker">通用参考</p>
        <h2 id="mu-ref-title">通用参考</h2>
        <RushReference own={a} data={data} />
        {both && a && e && core && data ? (
          <div id="mres" className="mu-ref-block">
            <h3>通用类型反制</h3>
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
              <summary>模拟默认与 PK 限制</summary>
              <p>{SIM_LIMIT}</p>
              <p>
                <Link to="/duel">查看 PK 模型能力与限制</Link>
              </p>
            </details>
          </div>
        ) : (
          <div className="mu-ref-block">
            <h3>通用类型反制</h3>
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
        <div className="mu-ref-block">
          <h3>有限指南与记录</h3>
          <p className="mu-scope">三份指南仍在原路由，内容不并进本页，也不新增情境。</p>
          <nav className="mu-tools" aria-label="对局助手有限指南">
            <Link className="community-tool-entry mu-chip" to="/matchup/scouting">
              <Icon name="book-open" />
              先辨析侦察线索与缺失信息
            </Link>
            <Link className="community-tool-entry mu-chip" to="/matchup/mixed-army">
              <Icon name="book-open" />
              按敌军组合查看混兵情境
            </Link>
            <Link className="community-tool-entry mu-chip" to="/matchup/castle-defense">
              <Icon name="book-open" />
              城堡前置：按当前局面查看应对
            </Link>
          </nav>
          <nav className="mu-tools" aria-label="情境与队伍规划">
            <Link className="community-tool-entry mu-chip" to="/match-review">
              <Icon name="scroll" />
              记录本局疑问与下次练习重点
            </Link>
            <Link className="community-tool-entry mu-chip" to="/team-plan">
              <Icon name="users" />
              记录队友分工与支援约定
            </Link>
          </nav>
        </div>
      </section>
    </section>
  );
}
