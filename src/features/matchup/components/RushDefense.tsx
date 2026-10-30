import { Link, useSearchParams } from 'react-router-dom';
import { buildOrders } from '../../../data/buildOrders';
import type { Civ } from '../../../domain/types';
import { rushDrill, unavailableBuildUnits, unitAvailable, techAvailable, type MatchupData } from '../availability';
import './rushDefense.css';
import { matchupBuildPath } from '../../../domain/matchupRoute';
import { guides, rushGuide } from '../rushGuides';

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

export default function RushDefense({ own, enemy, data, loadError }: { own: Civ; enemy: Civ; data: MatchupData | null; loadError: boolean }) {
  const [params, setParams] = useSearchParams();
  const guide = rushGuide(params.get('rush'));
  const drill = data ? rushDrill(data, own.en, enemy.en, guide) : null;
  const order = buildOrders.find((b) => b.id === guide.build)!;
  const blockedBuild = data ? unavailableBuildUnits(data, own.en, order) : [];
  const ownAvailable = data && unitAvailable(data, own.en, guide.a, 2) && (guide.id !== 'towers' || techAvailable(data, own.en, 22, 2));
  return (
    <section className="rush-defense" aria-label="应对早期进攻">
      <h3>应对早期进攻</h3>
      <label>
        对手打法{' '}
        <select
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
      </label>
      <p className="note">
        当前对局：{own.zh} 对 {enemy.zh}。演练按封建时代核对单位与科技资格。
      </p>
      <p className="note">以下应对为通用示意，非针对当前对手文明；请按侦察结果调整。</p>
      {!data && (
        <p className="note" role={loadError ? undefined : 'status'}>
          {loadError ? '单位和科技资料加载失败，演练和开局入口暂不可用。' : '正在核对双方文明的单位和科技…'}
        </p>
      )}
      <h4>何时开始应对</h4>
      <p>{guide.cue}</p>
      <h4>先出什么、出几个</h4>
      <p>
        {ownAvailable ? (
          <CountText text={guide.army} />
        ) : data ? (
          '本方防守单位或所需科技不可用，暂不提供出兵建议。'
        ) : (
          '资料未确认本方单位可用，暂不提供出兵建议。'
        )}
      </p>
      <h4>补墙、箭塔与驻扎</h4>
      <p>{guide.wall}</p>
      {drill?.url && (
        <p>
          <Link className="ulink" to={drill.url}>
            打开 PK 演练：
            <CountText text={guide.label} />
          </Link>
        </p>
      )}
      {drill?.unavailable.map(({ side, id, kind }) => (
        <p className="note" key={side + kind + id}>
          {side === 'own' ? `本方${own.zh}` : `对手${enemy.zh}`}在封建时代不可用{(kind === 'u' ? data?.core.unitById[id] : data?.core.techById[id])?.zh ?? id}
          ，当前演练不适用。
        </p>
      ))}
      <p className="note">
        数量是本站的起步练习建议，需要按侦察结果增减。演练使用当前双方文明、封建时代、无团队加成，
        {guide.id === 'towers' ? '仅研究织布机（双方均须可用）' : '无主动科技'}；仍计入 PK 已建模文明加成，可在 PK
        页修改文明和科技。群战模拟不含射程拉扯、围墙、塔和城镇中心火力，不能把胜负直接当作防守保证。
      </p>
      {guide.id === 'towers' && <p className="note">此预设只比较村民近战，不模拟打塔。敌塔已完工时不适用。</p>}
      {data &&
        (blockedBuild.length ? (
          <p className="note">
            {own.zh}在该流程目标时代不可用{blockedBuild.map((id) => data.core.unitById[id]?.zh ?? id).join('、')}，暂不提供此开局入口。
          </p>
        ) : (
          <p>
            <Link className="ulink" to={matchupBuildPath(own.en, enemy.en, 'me', guide.build)}>
              参考开局：
              <CountText text={order.name.zh} />
            </Link>
          </p>
        ))}
      <p className="note">参考其升时代和建造顺序，遇到快攻优先调整防守，不必照抄全部出兵步骤。文明经济加成的计入范围以开局页提示为准。</p>
      <details>
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
