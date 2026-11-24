import { useMemo, type RefObject } from 'react';
import { civByEn } from '../../../data';
import { evaluateIgnoreArmor } from '../../../domain/damageCore';
import { fighterUsesAssumeHit } from '../../../domain/duel';
import { TEAM_BONUSES } from '../../../domain/effects';
import { formatHp } from '../../../domain/hpFormat';
import { buildMixedReplay } from '../../../domain/battleReplay';
import { FIGHT_CAP, FIGHT_TIME } from '../../../domain/contactFight';
import type { MixedDuelInput } from '../../../domain/mixedDuelParams';
import { MIXED_RULE_LABEL, type MixedFightResult, type MixedArmyResult } from '../../../domain/mixedFight';
import { AGE_ZH } from '../../../domain/ratings';
import { parseRelicCount } from '../../../domain/relicParams';
import type { Tech, Unit } from '../../../domain/types';
import { Icon } from '../../../shared/ui/Icon';
import { UnitIcon } from '../../../shared/ui/art';
import { mixedSideCanKite, standingOpeningDelta } from '../logic/duelKiteView';
import type { Resolved } from '../logic/duelSide';
import { mixedSideRelicMatchedUnits, type MixedSideView } from '../logic/mixedDuel';
import { BattleReplay } from './BattleReplay';
import { CONTACT_BOUNDARY, MixedContact, STOP_LABELS } from './ContactSummary';
import { DisengagedNotice } from './KiteSummaryCard';
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
          <li>
            沿用本站伤害类别、护甲和常规远程命中率期望（目录准确度为 <span className="num nw">0%</span>{' '}
            的特殊远程攻击按每击命中主目标估算），攻击方「无视护甲」时目标的近战、穿刺护甲不扣，目标「抵抗无视护甲」时照扣；占比只是单位数量占比，不是人口、资源或攻击权重。
          </li>
          <li>
            达到 <span className="num nw">{FIGHT_TIME} 游戏秒</span>时限或事件、攻击计算上限时停止。双方仍存活时显示存活数量，暂无胜者。
          </li>
          <li>{CONTACT_BOUNDARY}</li>
        </ul>
      </details>
    </aside>
  );
}

function buildMixedIgnoreArmorNote(a: MixedSideView, b: MixedSideView): string | null {
  const clauses: string[] = [];
  const pairs: readonly [string, MixedSideView, string, MixedSideView][] = [
    ['A', a, 'B', b],
    ['B', b, 'A', a],
  ];
  for (const [atkPrefix, atkView, defPrefix, defView] of pairs) {
    const defRows = defView.rows.flatMap((row, i) => (row.resolved ? [{ label: `${defPrefix}${i + 1} ${row.resolved.u.zh}`, fighter: row.resolved.F }] : []));
    if (!defRows.length) continue;
    for (let i = 0; i < atkView.rows.length; i++) {
      const atkResolved = atkView.rows[i]?.resolved;
      if (!atkResolved) continue;
      const atkLabel = `${atkPrefix}${i + 1} ${atkResolved.u.zh}`;
      const appliedTargets: string[] = [];
      const resistedTargets: string[] = [];
      const categorySet = new Set<'近战' | '穿刺'>();
      for (const target of defRows) {
        const evalRes = evaluateIgnoreArmor(atkResolved.F, target.fighter);
        if (!evalRes.active) continue;
        for (const cat of evalRes.categories) categorySet.add(cat);
        if (evalRes.applied) appliedTargets.push(target.label);
        else if (evalRes.resisted) resistedTargets.push(target.label);
      }
      if (!appliedTargets.length && !resistedTargets.length) continue;
      const categories = (['近战', '穿刺'] as const).filter((cat) => categorySet.has(cat)).join('、');
      if (appliedTargets.length) {
        const base = `${atkLabel} 打 ${appliedTargets.join('、')} 时不扣${categories}护甲`;
        clauses.push(resistedTargets.length ? `${base}；${resistedTargets.join('、')} 抵抗无视护甲，照常扣甲` : base);
      } else {
        clauses.push(`${atkLabel} 的无视护甲对本场目标无效（${resistedTargets.join('、')} 抵抗无视护甲），照常扣甲`);
      }
    }
  }
  return clauses.length ? `无视护甲：${clauses.join('；')}。` : null;
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
              assumeHit: fighterUsesAssumeHit(row.resolved.F),
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
  const unitById: Record<number, Unit> = {};
  for (const row of [...a.rows, ...b.rows]) {
    if (row.unit) unitById[row.unit.id] = row.unit;
  }
  const replayModel = buildMixedReplay(
    result,
    { civZh: civByEn(input.a.civ)?.zh ?? input.a.civ, rows: a.army! },
    { civZh: civByEn(input.b.civ)?.zh ?? input.b.civ, rows: b.army! },
  );
  const standingDeltaVolleys = useMemo(() => standingOpeningDelta(a.army!, b.army!, result.contact), [a.army, b.army, result.contact]);
  const sideKey = (s: MixedDuelInput['a']) =>
    `${s.civ}@${s.age}[${s.techs.join(',')}][${s.team.join(',')}][k=${s.kite ? 1 : 0}][r=${parseRelicCount(s.relics)}]:${s.rows.map((r) => `${r.uid}x${r.qty}`).join(',')}`;
  const replayKey = `${sideKey(input.a)}|${sideKey(input.b)}|${result.duration}`;
  const isDisengaged = result.status === 'disengaged';
  const rangedInfo = (army: NonNullable<MixedSideView['army']>, side: 'a' | 'b') => {
    const aliveRows = army.filter((_, i) => (result[side].rows[i]?.alive ?? 0) > 0);
    const r = aliveRows.find((row) => row.fighter.ranged) ?? aliveRows[0] ?? army.find((row) => row.fighter.ranged) ?? army[0]!;
    return { name: r.fighter.name, rng: r.fighter.rng };
  };
  const aInfo = rangedInfo(a.army!, 'a');
  const bInfo = rangedInfo(b.army!, 'b');
  const ignoreArmorNote = buildMixedIgnoreArmorNote(a, b);
  return (
    <section className="mix-result" data-testid="mixed-result" aria-labelledby="mix-result-title">
      <div className="mix-result-head">
        <div>
          <p className="mix-eyebrow">混编结果 · {MIXED_RULE_LABEL}</p>
          <h2 id="mix-result-title" ref={headingRef} tabIndex={-1}>
            {isDisengaged && <Icon name="info" />} {title}
            {isDisengaged && (
              <small className="note">
                {' '}
                · A 剩余{' '}
                <span className="num nw">
                  {result.a.total.alive} / {result.a.total.initial}
                </span>{' '}
                · B 剩余{' '}
                <span className="num nw">
                  {result.b.total.alive} / {result.b.total.initial}
                </span>
              </small>
            )}
          </h2>
        </div>
        <span className="tag num nw">用时 {formatHp(result.duration)} 游戏秒</span>
      </div>
      {isDisengaged && result.contact.kite ? (
        <DisengagedNotice
          aName={aInfo.name}
          aRng={aInfo.rng}
          bName={bInfo.name}
          bRng={bInfo.rng}
          disengagedAt={result.contact.kite.disengagedAt ?? result.duration}
        />
      ) : (
        <p role="status">
          {result.status === 'timeout' || result.status === 'limit'
            ? '下方显示停止时的存活数量。'
            : result.status === 'draw'
              ? '本次事件内双方攻击均完成，结果为同时全灭。'
              : '结果对应本次配置。'}
        </p>
      )}
      {ignoreArmorNote && (
        <p className="note" data-t="mixed-ignore-armor-note">
          {ignoreArmorNote}
        </p>
      )}
      <DuelUnmodeledNotes mixed group entries={unmodeledEntries} vgSides={vgSides} />
      <MixedContact value={result.contact} status={result.status} a={lines(a, 'a')} b={lines(b, 'b')} standingDeltaVolleys={standingDeltaVolleys} />
      <BattleReplay key={replayKey} model={replayModel} unitById={unitById} />
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
          const showMode = mixedSideCanKite(view);
          const showRelics = mixedSideRelicMatchedUnits(s.civ, view.rows).length > 0;
          return (
            <p key={key}>
              {key.toUpperCase()}：{civByEn(s.civ)?.zh ?? s.civ} / {AGE_ZH[+s.age]} / 科技：
              {s.techs.map((id) => view.techs.find((o) => String(o.t.id) === id)?.t.zh ?? id).join('、') || '无科技'} / 团队效果：
              {s.team.map((id) => TEAM_BONUSES[+id]?.[1] ?? id).join('、') || '无'}
              {showMode && <> / 作战模式：{s.kite === true ? '边走边射（拉扯）' : '站桩输出'}</>}
              {showRelics && (
                <>
                  {' '}
                  / 驻守圣物：<span className="num nw">{parseRelicCount(s.relics)} 件</span>
                </>
              )}
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
