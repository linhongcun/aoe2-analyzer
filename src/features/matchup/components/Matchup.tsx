import { useEffect } from 'react';
import RushDefense from './RushDefense';
import './matchup-pair.css';
import { ListHead } from '../../../shared/ui/layout';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { civs } from '../../../data';
import { EMPTY_COUNTERS_COPY, TYPE_ZH, filterCounterUnits } from '../../../domain/ratings';
import { unitPath } from '../../../domain/simRoute';
import { CivIcon, UnitIcon } from '../../../shared/ui/art';
import { useSticky } from '../../../shared/utils/sticky';
import { Loading } from '../../../shared/ui/widgets';
import { Link, useSearchParams } from 'react-router-dom';
import { matchupBuildPath, matchupUnitPath, readMatchupPair, writeMatchupPair, writeExplicitMatchupPair } from '../../../domain/matchupRoute';
import { Icon } from '../../../shared/ui/Icon';
import '../../../shared/ui/contextLinks.css';
import { rushGuide } from '../rushGuides';
import { counterExtra, rushDrill } from '../availability';
import { useMatchupData } from '../useMatchupData';
import ChampiAges from './ChampiAges';

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
  const drill = data && a && e ? rushDrill(data, a.en, e.en, rushGuide(params.get('rush'))) : null;
  const counters = core && a && e ? filterCounterUnits(a.en, e.ty, core.units) : [];
  const lineCivs = core?.unitById[2550]?.civs;
  const champiPair = Array.isArray(lineCivs) && [a?.en, e?.en].some((civ) => civ && lineCivs.includes(civ));
  return (
    <section id="matchup" className={params.has('pair') || champiPair ? 'pane matchup-explicit' : 'pane'}>
      <ListHead title="对局助手" desc="快攻指南、类型反制，以及侦察、混兵和城堡前置" />
      <div className="bar fbar">
        我的文明 <CivPicker id="ma" label="我的文明" value={a?.en ?? ''} none="未选择" onChange={(en) => pick('me', en)} /> 对手文明{' '}
        <CivPicker id="me" label="对手文明" value={e?.en ?? ''} none="未选择" onChange={(en) => pick('opp', en)} />
      </div>
      {pair.invalid && (
        <p className="note" role={params.has('pair') ? 'alert' : undefined}>
          {params.has('pair') ? '链接中的对阵信息无效，请重新选择文明' : '链接中的文明无效，已用上次选择'}
        </p>
      )}
      {(!a || !e) && (
        <>
          <p role="status">{!a && !e ? '请补选双方文明后查看对阵分析。' : !a ? '请补选我方文明后查看对阵分析。' : '请补选对手文明后查看对阵分析。'}</p>
          <p>
            {a ? (
              <Link className="community-tool-entry" to={'/civ/' + a.en}>
                我方文明：{a.zh}
              </Link>
            ) : null}{' '}
            {e ? (
              <Link className="community-tool-entry" to={'/civ/' + e.en}>
                对手文明：{e.zh}
              </Link>
            ) : null}
          </p>
        </>
      )}
      {a && e && (
        <>
          <h3 className="matchup-title">
            <Link className="ulink ctx-civ-link" to={`/civ/${a.en}`}>
              <CivIcon c={a} />
              {a.zh}
            </Link>
            <span className="note">vs</span>
            <Link className="ulink ctx-civ-link" to={`/civ/${e.en}`}>
              <CivIcon c={e} />
              {e.zh}
            </Link>
          </h3>
          <nav className="ctx-chips" aria-label="对阵相关入口">
            {drill?.url ? (
              <Link className="community-tool-entry" to={drill.url}>
                <Icon name="swords" />
                单位 PK
              </Link>
            ) : (
              <span className="community-tool-entry" aria-disabled="true">
                <Icon name="swords" />
                单位 PK
              </span>
            )}
            <Link className="community-tool-entry" to={matchupBuildPath(a.en, e.en, 'me')}>
              <Icon name="list-ordered" />
              我方开局
            </Link>
            <Link className="community-tool-entry" to={matchupBuildPath(a.en, e.en, 'opp')}>
              <Icon name="list-ordered" />
              对手开局
            </Link>
            <Link className="community-tool-entry" to={`/civ/${a.en}`}>
              我方文明
            </Link>
            <Link className="community-tool-entry" to={`/civ/${e.en}`}>
              对手文明
            </Link>
          </nav>
          {!pair.invalid && params.has('me') && params.has('opp') && <p className="note">可复制地址栏链接分享这对阵</p>}
          <RushDefense own={a} enemy={e} data={data} loadError={error} />
        </>
      )}
      <nav className="bar" aria-label="对局助手有限指南">
        <Link className="community-tool-entry" to="/matchup/scouting">
          先辨析侦察线索与缺失信息
        </Link>
        <Link className="community-tool-entry" to="/matchup/mixed-army">
          按敌军组合查看混兵情境
        </Link>
        <Link className="community-tool-entry" to="/matchup/castle-defense">
          城堡前置：按当前局面查看应对
        </Link>
      </nav>
      <nav className="bar" aria-label="情境与队伍规划">
        <Link className="community-tool-entry" to="/match-review">
          记录本局疑问与下次练习重点
        </Link>
        <Link className="community-tool-entry" to="/team-plan">
          记录队友分工与支援约定
        </Link>
      </nav>
      {a &&
        e &&
        (error ? (
          <div data-testid="matchup-data-error">
            <p role="alert">对局资料加载失败，暂时无法核对演练和开局。请刷新页面重试。</p>
            <p>
              已选文明保留。
              <button type="button" style={{ minHeight: 44, minWidth: 44 }} onClick={retry}>
                重试资料
              </button>
            </p>
          </div>
        ) : !core || !data ? (
          <Loading />
        ) : (
          <div id="mres">
            <ChampiAges core={core} trees={data.trees} me={a.en} opp={e.en} />
            <p>
              <b>推荐反制</b>
            </p>
            <p className="note matchup-counter-note">
              以下反制建议为通用示意，非模型结论。当前 PK 采用近似计算，忽略射程、走位/风筝、地形高低差、冲锋攻击和溅射；击杀时间不能证明能否贴脸或绕后。
              <Link className="community-tool-entry" to="/duel">
                查看 PK 模型能力与限制
              </Link>
            </p>
            {e.ty.map((t) => (
              <p key={t} className="note">
                <b>{TYPE_ZH[t]}：</b>
                {counterExtra(data, a.en, t)}
              </p>
            ))}
            {counters.length === 0 ? (
              <p className="note">{EMPTY_COUNTERS_COPY}</p>
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
            {counters.length > 0 && <p className="note">默认帝王时代，未勾选科技与团队加成；仍计入已建模文明加成，可在模拟器调整，不代表本局进度。</p>}
          </div>
        ))}
    </section>
  );
}
