import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { buildOrders } from '../../../data/buildOrders';
import type { Civ } from '../../../domain/types';
import { rushDrill, unavailableBuildUnits, unitAvailable, techAvailable, type MatchupData } from '../availability';
import './rushDefense.css';
import { matchupBuildPath } from '../../../domain/matchupRoute';
import { guides, rushGuide } from '../rushGuides';

const DRILL_LIMIT =
  '演练使用当前双方文明、封建时代、无团队加成；塔爆仅研究织布机（双方均须可用），其余无主动科技。仍计入 PK 已建模文明加成，可在 PK 页修改文明和科技。群战模拟不含射程拉扯、围墙、塔和城镇中心火力，不能把胜负直接当作防守保证。';
const BUILD_NOTE = '参考开局取其升时代和建造顺序，遇到快攻优先调整防守，不必照抄全部出兵步骤。文明经济加成的计入范围以开局页提示为准。';
const COUNT_NOTE = '数量是本站的起步练习建议，需要按侦察结果增减。';
const TOWER_NOTE = '此预设只比较村民近战，不模拟打塔。敌塔已完工时不适用。';

function CountText({ text }: { text: string }) {
  return text.split(/(\d+\s*(?:个|人口|步弓手|民兵|长矛兵|斥候骑兵|掷矛手|村民))/g).map((part, i) =>
    i % 2 ? (
      <span className="rush-count num nw" key={i}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function RushReference({ own, data }: { own?: Civ; data: MatchupData | null }) {
  const [params] = useSearchParams();
  const guide = rushGuide(params.get('rush'));
  const ownAvailable = Boolean(data && own && unitAvailable(data, own.en, guide.a, 2) && (guide.id !== 'towers' || techAvailable(data, own.en, 22, 2)));
  const army = !own
    ? guide.army
    : ownAvailable
      ? guide.army
      : data
        ? '本方防守单位或所需科技不可用，暂不提供出兵建议。'
        : '资料未确认本方单位可用，暂不提供出兵建议。';
  return (
    <section className="mu-ref-block" aria-labelledby="mu-early-title">
      <h3 id="mu-early-title">通用早期应对</h3>
      <p className="mu-scope">
        <span className="mu-tag">通用示意</span>
        下列四段是固定的通用稿，只随「对手打法」切换（当前：「{guide.name}
        」），不按对手文明改写。请按侦察结果调整。若本方封建缺少对应防守单位或科技，不出那条出兵建议。
      </p>
      <div className="mu-guide">
        <h4>何时开始应对</h4>
        <p>{guide.cue}</p>
        <h4>先出什么、出几个</h4>
        <p>{ownAvailable || !own ? <CountText text={army} /> : army}</p>
        <h4>补墙、箭塔与驻扎</h4>
        <p>{guide.wall}</p>
      </div>
      <details className="mu-fold">
        <summary>来源与适用范围</summary>
        <ul>
          <li>
            <a href="https://www.ageofempires.com/learn-to-play/defending-your-empires-aoe2/" target="_blank" rel="noopener noreferrer">
              官方：侦察、防御建筑与村民驻扎
            </a>
          </li>
          <li>
            <a href="https://sitaux.com/skirms-and-spear-defence/" target="_blank" rel="noopener noreferrer">
              Sitaux：掷矛手与长矛兵防守
            </a>
          </li>
          <li>
            <a href="https://sitaux.com/tower-rush/" target="_blank" rel="noopener noreferrer">
              Sitaux：塔爆的前置村民与建塔节奏
            </a>
          </li>
        </ul>
        <p className="note">2026-10-18 已核对；Sitaux 网站为 2026 年。中文应对建议由本站整理，具体人数为可调整演练场景，未引用来源的胜率或胜负保证。</p>
      </details>
    </section>
  );
}

export default function RushDefense({
  own,
  enemy,
  data,
  loadError,
  children,
}: {
  own: Civ;
  enemy: Civ;
  data: MatchupData | null;
  loadError: boolean;
  children?: ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const guide = rushGuide(params.get('rush'));
  const drill = data ? rushDrill(data, own.en, enemy.en, guide) : null;
  const order = buildOrders.find((b) => b.id === guide.build)!;
  const blockedBuild = data ? unavailableBuildUnits(data, own.en, order) : [];
  return (
    <section className="rush-defense" aria-labelledby="mu-practice-title">
      <h3 id="mu-practice-title">可按当前文明核对的练习</h3>
      <p className="mu-scope">先选一种早期打法，再看这对文明能不能打开封建演练或参考开局。说明正文在下方通用参考里，四套稿只随对手打法切换。</p>
      <div className="mu-rush">
        <label htmlFor="mu-rush">对手打法</label>
        <select
          id="mu-rush"
          value={guide.id}
          onChange={(e) =>
            setParams(
              (p) => {
                const n = new URLSearchParams(p);
                n.set('rush', e.target.value);
                return n;
              },
              { replace: true },
            )
          }
        >
          {guides.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      {!data && (
        <p className="note" role={loadError ? undefined : 'status'}>
          {loadError ? '单位和科技资料加载失败，演练和开局入口暂不可用。' : '正在核对双方文明的单位和科技…'}
        </p>
      )}
      <div className="mu-practice-links">
        {drill?.url && (
          <Link className="ulink" to={drill.url}>
            打开 PK 演练：
            <CountText text={guide.label} />
          </Link>
        )}
        {data && blockedBuild.length === 0 && (
          <Link className="ulink" to={matchupBuildPath(own.en, enemy.en, 'me', guide.build)}>
            参考开局：
            <CountText text={order.name.zh} />
          </Link>
        )}
      </div>
      {drill?.unavailable.map(({ side, id, kind }) => (
        <p className="note mu-warn" key={side + kind + id}>
          {side === 'own' ? `本方${own.zh}` : `对手${enemy.zh}`}在封建时代不可用{(kind === 'u' ? data?.core.unitById[id] : data?.core.techById[id])?.zh ?? id}
          ，当前演练不适用。
        </p>
      ))}
      {data && blockedBuild.length > 0 && (
        <p className="note">
          {own.zh}在该流程目标时代不可用{blockedBuild.map((id) => data.core.unitById[id]?.zh ?? id).join('、')}，暂不提供此开局入口。
        </p>
      )}
      {guide.id === 'towers' && <p className="note">{TOWER_NOTE}</p>}
      <p className="note">{BUILD_NOTE}</p>
      <p className="note">{COUNT_NOTE}</p>
      <details className="mu-fold">
        <summary>演练限制</summary>
        <p>{DRILL_LIMIT}</p>
      </details>
      {children}
    </section>
  );
}
