import { useId, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { buildOrders } from '../../../data/buildOrders';
import type { Civ } from '../../../domain/types';
import { Icon } from '../../../shared/ui/Icon';
import { radioKeyboard } from '../../../shared/ui/radioKeyboard';
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

export function RushSegmentedPicker() {
  const [params, setParams] = useSearchParams();
  const guide = rushGuide(params.get('rush'));
  const labelId = useId();
  const select = (id: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set('rush', id);
        return n;
      },
      { replace: true },
    );
  return (
    <div className="mu-rush">
      <span id={labelId} className="mu-rush-label">
        对手打法
      </span>
      <div className="mu-rush-seg" role="radiogroup" aria-labelledby={labelId} onKeyDown={radioKeyboard}>
        {guides.map((g) => {
          const active = g.id === guide.id;
          return (
            <button key={g.id} type="button" role="radio" aria-checked={active} tabIndex={active ? 0 : -1} data-rush={g.id} onClick={() => select(g.id)}>
              {g.shortLabel}
            </button>
          );
        })}
      </div>
    </div>
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
    <section className="mu-ref-block mu-early-ref" aria-labelledby="mu-early-title">
      <h3 id="mu-early-title">通用早期应对</h3>
      <p className="mu-scope">
        <span className="mu-tag">通用示意 · {guide.name}</span>
        固定通用应对稿，只随上方对手打法切换，不按对手文明改写；请按侦察结果调整。若本方封建缺少对应防守单位或科技，不出那条出兵建议。
      </p>
      <div className="mu-guide">
        <div className="mu-guide-col">
          <h4>何时开始应对</h4>
          <p>{guide.cue}</p>
        </div>
        <div className="mu-guide-col">
          <h4>先出什么、出几个</h4>
          <p>{ownAvailable || !own ? <CountText text={army} /> : army}</p>
        </div>
        <div className="mu-guide-col">
          <h4>补墙、箭塔与驻扎</h4>
          <p>{guide.wall}</p>
        </div>
      </div>
      <details className="mu-fold">
        <summary>
          <span>来源与适用范围</span>
          <Icon name="chevron-down" className="ic mu-fold-chevron" />
        </summary>
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
  const [params] = useSearchParams();
  const guide = rushGuide(params.get('rush'));
  const drill = data ? rushDrill(data, own.en, enemy.en, guide) : null;
  const order = buildOrders.find((b) => b.id === guide.build)!;
  const blockedBuild = data ? unavailableBuildUnits(data, own.en, order) : [];
  return (
    <section className="rush-defense" aria-labelledby="mu-practice-title">
      <h3 id="mu-practice-title">可按当前文明核对的练习</h3>
      <p className="mu-scope">先选一种早期打法，可即时查看下方通用应对要点，并核对当前双方是否适用封建演练或参考开局。</p>
      <RushSegmentedPicker />
      {!data && (
        <p className="note" role={loadError ? undefined : 'status'}>
          {loadError ? '单位和科技资料加载失败，演练和开局入口暂不可用。' : '正在核对双方文明的单位和科技…'}
        </p>
      )}
      <div className="mu-practice-links">
        {drill?.url && (
          <Link className="ulink" to={drill.url}>
            <Icon name="swords" />
            <span>
              PK 演练：
              <CountText text={guide.label} />
            </span>
          </Link>
        )}
        {data && blockedBuild.length === 0 && (
          <Link className="ulink" to={matchupBuildPath(own.en, enemy.en, 'me', guide.build)}>
            <Icon name="list-ordered" />
            <span>
              参考开局：
              <CountText text={order.name.zh} />
            </span>
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
      <RushReference own={own} data={data} />
      <p className="note">{BUILD_NOTE}</p>
      <p className="note">{COUNT_NOTE}</p>
      <details className="mu-fold">
        <summary>
          <span>演练限制</span>
          <Icon name="chevron-down" className="ic mu-fold-chevron" />
        </summary>
        <p>{DRILL_LIMIT}</p>
      </details>
      {children}
    </section>
  );
}
