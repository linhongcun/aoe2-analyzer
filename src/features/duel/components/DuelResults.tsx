import type { Ref, RefObject } from 'react';
import { civByEn } from '../../../data';
import ShareImage from '../../../shared/ui/ShareImage';
import {
  groupFight,
  oneVOneFight,
  costSum,
  fighterUsesAssumeHit,
  NO_NORMAL_ATTACK_REASON,
  unitIsNonAttackingCaster,
  type GroupResult,
  type OneVOneResult,
} from '../../../domain/duel';
import { formatHp } from '../../../domain/hpFormat';
import { buildGroupReplay, buildOneVOneReplay } from '../../../domain/battleReplay';
import { formatTrade, tradeLosses } from '../../../domain/trade';
import { CostView } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import type { Tech } from '../../../domain/types';
import { CounterSummary } from './CounterSummary';
import { BattleReplay } from './BattleReplay';
import { DuelUnmodeledNotes } from './DuelUnmodeledNotes';
import { OneTimeline, GroupTimeline } from './DuelTimeline';
import { GroupContact } from './ContactSummary';
import { r1, type Resolved } from '../logic/duelSide';
import { summarizeGroup, summarizeOneVOne } from '../logic/duelSummary';

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

export function OneVOne({
  A,
  B,
  result,
  resultElRef,
  headingRef,
}: {
  A: Resolved;
  B: Resolved;
  result?: OneVOneResult;
  resultElRef?: Ref<HTMLDivElement>;
  headingRef?: RefObject<HTMLHeadingElement>;
}) {
  const r = result ?? oneVOneFight(A.F, B.F);
  const summary = summarizeOneVOne(A, B, r);
  const wn = summary.headline;
  const aNoAttack = !r.ab.canAttack;
  const bNoAttack = !r.ba.canAttack;
  const bothNoAttack = ('outcome' in r && r.outcome === 'both-no-attack') || (aNoAttack && bNoAttack);
  const singleNoAttack = (aNoAttack || bNoAttack) && !bothNoAttack;
  const hasCaster = unitIsNonAttackingCaster(A.u) || unitIsNonAttackingCaster(B.u);

  if (bothNoAttack) {
    return (
      <div id="duel-res" className="posbox" data-t="duel-both-no-attack" ref={resultElRef}>
        <h2 className="duel-win w-draw" ref={headingRef} tabIndex={-1}>
          <Icon name={summary.icon} /> {wn}
        </h2>
        <p className="duel-no-atk-body">双方无法通过普通攻击分出胜负。{hasCaster ? '招降与治疗未计入。' : ''}</p>
      </div>
    );
  }

  const isContact = r.mode === 'contact';
  const assumeHitA = fighterUsesAssumeHit(A.F);
  const assumeHitB = fighterUsesAssumeHit(B.F);
  const unitById = { [A.u.id]: A.u, [B.u.id]: B.u };
  const oneModel = isContact
    ? buildOneVOneReplay(
        r,
        { uid: A.u.id, fighter: A.F, civZh: civByEn(A.civ)?.zh ?? A.civ },
        { uid: B.u.id, fighter: B.F, civZh: civByEn(B.civ)?.zh ?? B.civ },
      )
    : null;
  const fmtTime = (ow: typeof r.ab) => (ow.time === null ? '—' : r1(ow.time) + 's');
  const fmtDps = (ow: typeof r.ab) => (ow.dps === null || !Number.isFinite(ow.dps) ? '—' : (Math.round(ow.dps * 100) / 100).toString());
  const rows: [string, string, string][] = [
    ['每击伤害', r1(r.ab.dmg), r1(r.ba.dmg)],
    ['期望每击（含命中率）', r1(r.ab.expDmg), r1(r.ba.expDmg)],
    ['击杀所需次数', Number.isFinite(r.ab.hits) ? String(r.ab.hits) : '—', Number.isFinite(r.ba.hits) ? String(r.ba.hits) : '—'],
    ['击杀用时', fmtTime(r.ab), fmtTime(r.ba)],
    ['DPS', fmtDps(r.ab), fmtDps(r.ba)],
  ];
  const dpsReason = r.ab.dpsReason || r.ba.dpsReason;
  const noSide = aNoAttack ? 'A' : 'B';
  const noUnit = aNoAttack ? A.u : B.u;
  const foeUnit = aNoAttack ? B.u : A.u;
  const firstStrike = isContact ? r.contact.firstStrike : null;
  const hasFirstStrike = Boolean(firstStrike && firstStrike.volleys > 0);
  const shareRemaining = isContact && (r.status === 'timeout' || r.status === 'limit') ? `A ${formatHp(r.aHp)} / B ${formatHp(r.bHp)}` : formatHp(r.remaining);
  const shareNote = isContact
    ? assumeHitA || assumeHitB
      ? '一维接敌与射程先手模型（1 vs 1）；目录准确度 0% 单位按每击命中主目标估算；完整文明和科技参数见链接。'
      : '一维接敌与射程先手模型（1 vs 1）；完整文明和科技参数见链接。'
    : assumeHitA || assumeHitB
      ? '忽略射程拉扯与操作；目录准确度 0% 单位按每击命中主目标估算；完整文明和科技参数见链接。'
      : '忽略射程拉扯与操作；完整文明和科技参数见链接。';
  return (
    <div id="duel-res" className="posbox" ref={resultElRef}>
      <h2 className={'duel-win w-' + summary.winner} ref={headingRef} tabIndex={-1}>
        <Icon name={summary.icon} /> {wn}
        {isContact ? (
          r.status === 'win' && (r.winner === 'a' || r.winner === 'b') ? (
            <small className="note">
              {' '}
              · {hasFirstStrike ? '含接近与先手用时' : '含接近用时'} <span className="num nw">{r1(r.duration)} 秒</span> · 剩余生命{' '}
              <span className="num nw">
                {formatHp(r.remaining)} / {formatHp((r.winner === 'a' ? A : B).F.hp)}
              </span>
              {hasFirstStrike && firstStrike && (
                <>
                  （{firstStrike.side === r.winner ? '先手齐射' : '先手受击'} <span className="num nw">{firstStrike.volleys} 轮</span>
                  {r.contact.meleeAt !== null && (
                    <>
                      ，<span className="num nw">{r1(r.contact.meleeAt)} 秒</span>近战接敌
                    </>
                  )}
                  ）
                </>
              )}
            </small>
          ) : r.status === 'timeout' || r.status === 'limit' ? (
            <small className="note">
              {' '}
              · 用时 <span className="num nw">{r1(r.duration)} 秒</span> · 剩余生命{' '}
              <span className="num nw">
                A {formatHp(r.aHp)} / B {formatHp(r.bHp)}
              </span>
            </small>
          ) : (
            <small className="note">
              {' '}
              · 用时 <span className="num nw">{r1(r.duration)} 秒</span>
            </small>
          )
        ) : (
          r.outcome === 'win' &&
          r.winner !== 'draw' && (
            <small className="note">
              {' '}
              · 用时 <span className="num nw">{r1(r.duration)}s</span> · 剩余生命{' '}
              <span className="num nw">
                {formatHp(r.remaining)} / {formatHp((r.winner === 'a' ? A : B).F.hp)}
              </span>
            </small>
          )
        )}
      </h2>
      {singleNoAttack && (
        <aside className="pk-callout is-info" data-t="pk-no-attack" role="region" aria-label="无普通攻击说明">
          <p className="pk-callout-title">
            <strong>
              {noSide} 方{noUnit.zh}没有普通攻击
            </strong>
          </p>
          <p className="pk-callout-body">
            {foeUnit.zh}不会受{noUnit.zh}的普通攻击伤害。{unitIsNonAttackingCaster(noUnit) ? '招降与治疗未计入。' : ''}
          </p>
        </aside>
      )}
      <DuelUnmodeledNotes
        usesContact={isContact}
        entries={[
          { side: 'a', badge: 'A', unit: A.u, civ: A.civ, age: A.age, selectedTechs: selectedTechsOf(A), assumeHit: assumeHitA },
          { side: 'b', badge: 'B', unit: B.u, civ: B.civ, age: B.age, selectedTechs: selectedTechsOf(B), assumeHit: assumeHitB },
        ]}
        vgSides={[
          { rowKey: 'a', k: 'a', unitId: A.u.id, civ: A.civ, age: A.age, rof: A.S.rof, seconds: isContact ? r.contact.a[0]!.meleeUnitSeconds : r.duration },
          { rowKey: 'b', k: 'b', unitId: B.u.id, civ: B.civ, age: B.age, rof: B.S.rof, seconds: isContact ? r.contact.b[0]!.meleeUnitSeconds : r.duration },
        ]}
      />
      {oneModel ? <BattleReplay model={oneModel} unitById={unitById} /> : !isContact ? <BattleReplay fallback={{ reason: r.fallbackReason }} /> : null}
      <ShareImage
        title={`${A.u.zh} 对 ${B.u.zh}：${wn}`}
        stats={
          !isContact && r.outcome === 'no-kill'
            ? [
                ['模拟结果', wn],
                ['双方数量', '1 / 1'],
              ]
            : [
                ['模拟用时', `${r1(r.duration)} 秒`],
                ['剩余生命', shareRemaining],
                ['双方数量', '1 / 1'],
              ]
        }
        note={shareNote}
      />
      <CounterSummary a={A.F} b={B.F} />
      <table className="stat duel-tab">
        <thead>
          <tr>
            <td></td>
            <td>A {A.u.zh} 打 B</td>
            <td>B {B.u.zh} 打 A</td>
          </tr>
        </thead>
        <tbody>
          {rows.map(([n, a, b], idx) => (
            <tr key={n}>
              <td>{n}</td>
              {aNoAttack ? (
                idx === 0 ? (
                  <td rowSpan={rows.length} className="duel-no-atk-cell" data-t="duel-no-attack-a">
                    {NO_NORMAL_ATTACK_REASON}
                  </td>
                ) : null
              ) : (
                <td className="num nw">{a}</td>
              )}
              {bNoAttack ? (
                idx === 0 ? (
                  <td rowSpan={rows.length} className="duel-no-atk-cell" data-t="duel-no-attack-b">
                    {NO_NORMAL_ATTACK_REASON}
                  </td>
                ) : null
              ) : (
                <td className="num nw">{b}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {isContact && (
        <p className="note" data-t="duel-tab-note">
          上表「击杀用时」与 DPS 为无接近、无最小射程停火的单向静态理论值；本场实际交战用时与胜负见上方结果卡与回放。
        </p>
      )}
      {dpsReason && (
        <p className="note" data-t="dps-reason">
          {dpsReason}
        </p>
      )}
      <OneTimeline A={A} B={B} result={r} />
    </div>
  );
}

export function Group({
  A,
  B,
  na,
  nb,
  bud,
  result,
  resultElRef,
  headingRef,
}: {
  A: Resolved;
  B: Resolved;
  na: number;
  nb: number;
  bud: number;
  result?: GroupResult;
  resultElRef?: Ref<HTMLDivElement>;
  headingRef?: RefObject<HTMLHeadingElement>;
}) {
  const g = result ?? groupFight(A.F, na, B.F, nb, { recordReplay: true });
  if (g.status === 'error')
    return (
      <div id="duel-res" className="posbox" role="alert" ref={resultElRef}>
        <h2 ref={headingRef} tabIndex={-1}>
          群战结果未生成
        </h2>
        <p>{g.reason}</p>
      </div>
    );
  const summary = summarizeGroup(A, B, g)!;
  const wn = summary.headline;
  const groupModel = buildGroupReplay(
    g,
    { uid: A.u.id, fighter: A.F, count: na, civZh: civByEn(A.civ)?.zh ?? A.civ },
    { uid: B.u.id, fighter: B.F, count: nb, civZh: civByEn(B.civ)?.zh ?? B.civ },
  );
  const unitById = { [A.u.id]: A.u, [B.u.id]: B.u };
  return (
    <div id="duel-res" className="posbox" ref={resultElRef}>
      <h2 className={'duel-win w-' + summary.winner} ref={headingRef} tabIndex={-1}>
        <Icon name={summary.icon} /> {wn}
        <small className="note">
          {' '}
          · 用时 <span className="num nw">{r1(g.duration)} 秒</span>
          {g.status === 'win' && (
            <>
              {' '}
              · 剩余 <span className="num nw">{g.winner === 'b' ? g.bAlive : g.aAlive} 个单位</span>、总生命{' '}
              <span className="num nw">{formatHp(g.hpLeft)}</span>
            </>
          )}
        </small>
      </h2>
      <DuelUnmodeledNotes
        group
        entries={[
          { side: 'a', badge: 'A', unit: A.u, civ: A.civ, age: A.age, selectedTechs: selectedTechsOf(A), assumeHit: fighterUsesAssumeHit(A.F) },
          { side: 'b', badge: 'B', unit: B.u, civ: B.civ, age: B.age, selectedTechs: selectedTechsOf(B), assumeHit: fighterUsesAssumeHit(B.F) },
        ]}
        vgSides={[
          { rowKey: 'a', k: 'a', unitId: A.u.id, civ: A.civ, age: A.age, rof: A.S.rof, seconds: g.contact.a[0]!.meleeUnitSeconds },
          { rowKey: 'b', k: 'b', unitId: B.u.id, civ: B.civ, age: B.age, rof: B.S.rof, seconds: g.contact.b[0]!.meleeUnitSeconds },
        ]}
      />
      <GroupContact value={g.contact} a={{ fighter: A.F, count: na, ...g.contact.a[0]! }} b={{ fighter: B.F, count: nb, ...g.contact.b[0]! }} />
      <BattleReplay model={groupModel} unitById={unitById} />
      <ShareImage
        title={`${na} ${A.u.zh} 对 ${nb} ${B.u.zh}：${wn}`}
        stats={[
          ['模拟用时', `${r1(g.duration)} 秒`],
          ['A 存活', g.aAlive],
          ['B 存活', g.bAlive],
        ]}
        note={
          fighterUsesAssumeHit(A.F) || fighterUsesAssumeHit(B.F)
            ? '一维接敌与占位近似；目录准确度 0% 单位按每击命中主目标估算，结果用于比较方案。'
            : '一维接敌与占位近似，结果用于比较方案。'
        }
      />
      {bud > 0 && (
        <p className="note">
          预算 <span className="num nw">{bud}</span>：
          {(
            [
              ['A', A, na],
              ['B', B, nb],
            ] as const
          ).map(([key, side, count]) => (
            <span key={key}>
              {' '}
              {key} {side.u.zh} <span className="num nw">× {count}</span>（单价 <span className="num nw">{costSum(side.training.price.cost)}</span>，投入{' '}
              <span className="num nw">{count * costSum(side.training.price.cost)}</span>）
            </span>
          ))}
        </p>
      )}
      <CounterSummary a={A.F} b={B.F} />
      <table className="stat duel-tab">
        <tbody>
          <tr>
            <td>数量</td>
            <td className="num nw">
              A {na}，剩 {g.aAlive}
            </td>
            <td className="num nw">
              B {nb}，剩 {g.bAlive}
            </td>
          </tr>
        </tbody>
      </table>
      <TradeRow A={A} B={B} na={na} nb={nb} aAlive={g.aAlive} bAlive={g.bAlive} />
      <GroupTimeline result={g} na={na} nb={nb} />
    </div>
  );
}

/** issue 107 交换比：只计阵亡单位，按折后取整单价；金按 1:1 计入 */
function TradeRow({ A, B, na, nb, aAlive, bAlive }: { A: Resolved; B: Resolved; na: number; nb: number; aAlive: number; bAlive: number }) {
  const t = tradeLosses({ na, nb, aAlive, bAlive, costA: A.training.price.cost, costB: B.training.price.cost });
  const f = formatTrade(t);
  return (
    <div className="pk-trade" data-t="pk-trade">
      <p className="pk-trade-main">
        {f.label}{' '}
        <b className="pk-trade-value" data-t="pk-trade-value">
          {f.value}
        </b>
      </p>
      {f.note && <p className="note">{f.note}</p>}
      {(['a', 'b'] as const).map((k) => (
        <p key={k} className="note pk-trade-loss" data-t={`pk-trade-loss-${k}`}>
          <span className="nw">
            {k.toUpperCase()} 损失 {t[k].total}
          </span>
          （阵亡 {t[k].dead}
          {t[k].dead > 0 && (
            <>
              ：<CostView c={t[k].res} />
            </>
          )}
          ）
        </p>
      ))}
      <p className="note">只计阵亡单位，存活单位掉的血不算；金按 1:1 计入。</p>
    </div>
  );
}
