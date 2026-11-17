import type { RefObject } from 'react';
import { civByEn } from '../../../data';
import { TEAM_BONUSES } from '../../../domain/effects';
import { formatHp } from '../../../domain/hpFormat';
import type { MixedDuelInput } from '../../../domain/mixedDuelParams';
import { MIXED_RULE_LABEL, type MixedFightResult, type MixedArmyResult } from '../../../domain/mixedFight';
import { AGE_ZH } from '../../../domain/ratings';
import { Icon } from '../../../shared/ui/Icon';
import { UnitIcon } from '../../../shared/ui/art';
import type { MixedSideView } from '../logic/mixedDuel';

export function MixedRules() {
  return (
    <aside className="mix-info mix-rules" aria-label="混编规则">
      <strong>
        <Icon name="info" />
        {MIXED_RULE_LABEL}
      </strong>
      <p>
        每方第 1 行先受击，消灭后移至下一行。所有兵种从开局同时参战。
        <br />
        <b>无走位、射程、溅射，不解释前排保护。</b>
      </p>
      <details>
        <summary>查看完整规则</summary>
        <ul>
          <li>
            各个体初始满血、首次出手在 <span className="num nw">0 游戏秒</span>，之后按本行独立攻击间隔出手。
          </li>
          <li>同一时刻先快照双方存活攻击者，故该时刻被击杀的单位仍能完成本次攻击；之后不再出手。</li>
          <li>同刻攻击按本方行顺序和稳定个体顺序逐击解析，逐击重选当前队首目标，切换目标也重新取对应伤害。单击超额伤害丢弃，不穿透、不转移、不溅射。</li>
          <li>沿用本站伤害类别、护甲和远程命中率期望；占比只是单位数量占比，不是人口、资源或攻击权重。</li>
          <li>
            上限 <span className="num nw">600 游戏秒</span>，包含边界时刻的攻击；届时双方仍存活则超时、无胜者，不按剩余单位强行判胜。
          </li>
          <li>不包含接敌、移动、阵型、治疗、招降、增援与特殊技能；结果不是实战强弱、组合协同或胜率预测。</li>
        </ul>
      </details>
    </aside>
  );
}

export function MixedResult({
  result,
  input,
  a,
  b,
  headingRef,
  onEdit,
  onShare,
}: {
  result: Exclude<MixedFightResult, { status: 'error' }>;
  input: MixedDuelInput;
  a: MixedSideView;
  b: MixedSideView;
  headingRef: RefObject<HTMLHeadingElement>;
  onEdit: () => void;
  onShare: () => void;
}) {
  const title =
    result.status === 'win' ? `${result.winner.toUpperCase()} 方在此规则下获胜` : result.status === 'draw' ? '双方同刻全部阵亡' : '达到时限，暂无胜者';
  const order = (view: MixedSideView) => view.rows.map((r) => r.unit?.zh ?? '未知单位').join(' / ');
  return (
    <section className="mix-result" data-testid="mixed-result" aria-labelledby="mix-result-title">
      <div className="mix-result-head">
        <div>
          <p className="mix-eyebrow">混编结果 · 理想模型</p>
          <h2 id="mix-result-title" ref={headingRef} tabIndex={-1}>
            {title}
          </h2>
        </div>
        <span className="tag num nw">用时 {formatHp(result.duration)} 游戏秒</span>
      </div>
      <p role="status">
        {result.status === 'timeout'
          ? '双方仍有存活单位，未按剩余兵力判胜。'
          : result.status === 'draw'
            ? '本次事件内双方攻击均完成，结果为同时全灭。'
            : '仅适用于本次输入及指定队列规则。'}
      </p>
      <div className="mix-result-rules">
        <strong>{MIXED_RULE_LABEL}</strong>
        <p>无走位、射程、溅射，不解释前排保护。</p>
        <p>
          A 受击顺序：{order(a)}
          <br />B 受击顺序：{order(b)}
        </p>
      </div>
      <ArmyResult side="a" value={result.a} view={a} input={input} />
      <ArmyResult side="b" value={result.b} view={b} input={input} />
      <div className="bar mix-result-actions">
        <button type="button" onClick={onEdit}>
          <Icon name="arrow-left" />
          修改配置
        </button>
        <button type="button" className="pri" onClick={onShare}>
          <Icon name="copy" />
          复制混编链接
        </button>
      </div>
      <details className="mix-input-snapshot">
        <summary>本次输入与版本</summary>
        {(['a', 'b'] as const).map((key) => {
          const s = input[key],
            view = key === 'a' ? a : b;
          return (
            <p key={key}>
              {key.toUpperCase()}：{civByEn(s.civ)?.zh ?? s.civ} / {AGE_ZH[+s.age]} / 科技：
              {s.techs.map((id) => view.techs.find((o) => String(o.t.id) === id)?.t.zh ?? id).join('、') || '无科技'} / 团队效果：
              {s.team.map((id) => TEAM_BONUSES[+id]?.[1] ?? id).join('、') || '无'}
              <br />
              单位与数量：{s.rows.map((r, i) => `${view.rows[i]?.unit?.zh}（ID ${r.uid}）× ${r.qty}`).join('；')}
            </p>
          );
        })}
        <p>人数与顺序见上表；生命合计按每个存活个体实际生命相加。展示值四舍五入不影响逐击计算。</p>
        <p>
          规则：{MIXED_RULE_LABEL}（{input.rule}）。链接只保存配置，不回放历史战果；打开链接后须重新计算。
        </p>
        <p className="mix-pin">固定数据标识：{input.data}</p>
      </details>
    </section>
  );
}

function ArmyResult({ side, value, view, input }: { side: 'a' | 'b'; value: MixedArmyResult; view: MixedSideView; input: MixedDuelInput }) {
  return (
    <section className="mix-army-result" aria-labelledby={`mix-${side}-result-title`}>
      <div className="mix-side-head">
        <h3 id={`mix-${side}-result-title`}>
          {side.toUpperCase()} 方 · {civByEn(input[side].civ)?.zh}
        </h3>
        <span className="num nw">
          剩余 {value.total.alive} / {value.total.initial}
        </span>
      </div>
      <table className="mix-results-table">
        <caption className="sr-only">{side.toUpperCase()} 方逐兵种损失及合计</caption>
        <thead>
          <tr>
            {['单位', '初始（个）', '阵亡（个）', '剩余（个）', '剩余总生命'].map((s) => (
              <th key={s} scope="col">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {value.rows.map((r, i) => (
            <tr key={r.uid}>
              <th scope="row">
                <span className="mix-result-unit">
                  {view.rows[i]?.unit && <UnitIcon u={view.rows[i]!.unit!} />}
                  <span>
                    {view.rows[i]?.unit?.zh}
                    <small className="note">
                      ID <span className="num nw">{r.uid}</span>
                    </small>
                  </span>
                </span>
              </th>
              <td data-label="初始（个）" className="num nw">
                {r.initial}
              </td>
              <td data-label="阵亡（个）" className="num nw">
                {r.lost}
              </td>
              <td data-label="剩余（个）" className="num nw">
                {r.alive}
              </td>
              <td data-label="剩余总生命" className="num nw">
                {formatHp(r.hp)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">本方合计</th>
            <td data-label="初始（个）" className="num nw">
              {value.total.initial}
            </td>
            <td data-label="阵亡（个）" className="num nw">
              {value.total.lost}
            </td>
            <td data-label="剩余（个）" className="num nw">
              {value.total.alive}
            </td>
            <td data-label="剩余总生命" className="num nw">
              {formatHp(value.total.hp)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
