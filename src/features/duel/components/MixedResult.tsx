import type { RefObject } from 'react';
import { civByEn } from '../../../data';
import { TEAM_BONUSES } from '../../../domain/effects';
import { formatHp } from '../../../domain/hpFormat';
import { FIGHT_CAP, FIGHT_TIME } from '../../../domain/contactFight';
import type { MixedDuelInput } from '../../../domain/mixedDuelParams';
import { MIXED_RULE_LABEL, type MixedFightResult, type MixedArmyResult } from '../../../domain/mixedFight';
import { AGE_ZH } from '../../../domain/ratings';
import type { Tech } from '../../../domain/types';
import { Icon } from '../../../shared/ui/Icon';
import { UnitIcon } from '../../../shared/ui/art';
import type { Resolved } from '../logic/duelSide';
import type { MixedSideView } from '../logic/mixedDuel';
import { CONTACT_BOUNDARY, MixedContact, STOP_LABELS } from './ContactSummary';
import { DuelUnmodeledNotes } from './DuelUnmodeledNotes';

function selectedTechsOf(side: Resolved): Tech[] {
  const seen = new Set<number>();
  const list: Tech[] = [];
  for (const { t } of side.avail) {
    if (side.sel.has(t.id) && !seen.has(t.id)) {
      seen.add(t.id);
      list.push(t);
    }
  }
  for (const { tech } of side.training.costs) {
    if (side.sel.has(tech.id) && !seen.has(tech.id)) {
      seen.add(tech.id);
      list.push(tech);
    }
  }
  return list;
}

export function MixedRules() {
  return (
    <aside className="mix-info mix-rules" aria-label="混编规则">
      <strong>
        <Icon name="info" />
        {MIXED_RULE_LABEL}
      </strong>
      <p>按行序受击，最前一行清空后由下一行顶上。前排近战能同时出手的人数受占位限制。后排远程进入射程后可以越过己方前排输出。</p>
      <details>
        <summary>查看完整规则</summary>
        <ul>
          <li>
            每方 <span className="num nw">1–3 行</span>，最多 <span className="num nw">{FIGHT_CAP} 个单位</span>。
          </li>
          <li>
            前排按移速接近。进入射程后开始首击前摇，之后按攻击间隔出手。缺少目录前摇时按零处理。单兵低于最小射程时无法开火；多人数远程行按纵深排数判定，仅贴脸低于最小射程的前排停火，后排纵深仍可开火。
          </li>
          <li>后排近战等前排清空后才能接敌。先进入射程的一方可能有接敌前的齐射窗口。</li>
          <li>同一时刻先快照双方存活攻击者，故该时刻被击杀的单位仍能完成本次攻击；之后不再出手。</li>
          <li>同刻攻击按本方行顺序逐击结算。清空前排后，仅对还在射程内的下一行继续结算，按新目标计算每击伤害。单击超出的伤害丢弃。</li>
          <li>沿用本站伤害类别、护甲和远程命中率期望；占比只是单位数量占比，不是人口、资源或攻击权重。</li>
          <li>
            达到 <span className="num nw">{FIGHT_TIME} 游戏秒</span>时限或事件、攻击计算上限时停止。双方仍存活时显示存活数量，暂无胜者。
          </li>
          <li>{CONTACT_BOUNDARY}</li>
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
    result.status === 'win' ? `${result.winner.toUpperCase()} 方在此规则下获胜` : result.status === 'draw' ? '双方同刻全部阵亡' : STOP_LABELS[result.status];
  const lines = (view: MixedSideView, side: 'a' | 'b') => view.army!.map((row, i) => ({ ...row, ...result.contact[side][i]! }));
  const unmodeledEntries = (
    [
      ['a', a],
      ['b', b],
    ] as const
  ).flatMap(([side, view]) =>
    view.rows.flatMap((row, i) =>
      row.resolved
        ? [
            {
              side,
              badge: `${side.toUpperCase()}${i + 1}`,
              unit: row.resolved.u,
              civ: row.resolved.civ,
              age: row.resolved.age,
              selectedTechs: selectedTechsOf(row.resolved),
            },
          ]
        : [],
    ),
  );
  const vgSides = (
    [
      ['a', a],
      ['b', b],
    ] as const
  ).flatMap(([side, view]) =>
    view.rows.flatMap((row, i) =>
      row.resolved
        ? [
            {
              rowKey: `${side}-${i}-${row.resolved.u.id}`,
              k: side,
              rowLabel: `${side.toUpperCase()}${i + 1} · ${row.resolved.u.zh}`,
              unitId: row.resolved.u.id,
              civ: row.resolved.civ,
              age: row.resolved.age,
              rof: row.resolved.S.rof,
              seconds: result.contact[side][i]!.meleeUnitSeconds,
            },
          ]
        : [],
    ),
  );
  return (
    <section className="mix-result" data-testid="mixed-result" aria-labelledby="mix-result-title">
      <div className="mix-result-head">
        <div>
          <p className="mix-eyebrow">混编结果 · {MIXED_RULE_LABEL}</p>
          <h2 id="mix-result-title" ref={headingRef} tabIndex={-1}>
            {title}
          </h2>
        </div>
        <span className="tag num nw">用时 {formatHp(result.duration)} 游戏秒</span>
      </div>
      <p role="status">
        {result.status === 'timeout' || result.status === 'limit'
          ? '下方显示停止时的存活数量。'
          : result.status === 'draw'
            ? '本次事件内双方攻击均完成，结果为同时全灭。'
            : '结果对应本次配置。'}
      </p>
      <DuelUnmodeledNotes mixed group entries={unmodeledEntries} vgSides={vgSides} />
      <MixedContact value={result.contact} a={lines(a, 'a')} b={lines(b, 'b')} />
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
              单位与数量：
              {s.rows.map((r, i) => (
                <span key={r.uid}>
                  {i > 0 && '；'}
                  {view.rows[i]?.unit?.zh}（<span className="num nw">ID {r.uid}</span>）<span className="num nw">× {r.qty}</span>
                </span>
              ))}
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
