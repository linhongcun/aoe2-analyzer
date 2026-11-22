import type { Ref, RefObject } from 'react';
import ShareImage from '../../../shared/ui/ShareImage';
import { duel, groupFight, costSum, type DuelResult, type GroupResult } from '../../../domain/duel';
import { formatHp } from '../../../domain/hpFormat';
import { groupReplay, oneReplay } from '../../../domain/battleReplay';
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
  result?: DuelResult;
  resultElRef?: Ref<HTMLDivElement>;
  headingRef?: RefObject<HTMLHeadingElement>;
}) {
  const r = result ?? duel(A.F, B.F);
  const summary = summarizeOneVOne(A, B, r);
  const wn = summary.headline;
  const fmtTime = (ow: typeof r.ab) => (ow.time === null ? '—' : r1(ow.time) + 's');
  const fmtDps = (ow: typeof r.ab) => (ow.dps === null || !Number.isFinite(ow.dps) ? '—' : (Math.round(ow.dps * 100) / 100).toString());
  const rows: [string, string, string, string?][] = [
    ['每击伤害', r1(r.ab.dmg), r1(r.ba.dmg)],
    ['期望每击（含命中率）', r1(r.ab.expDmg), r1(r.ba.expDmg)],
    ['击杀所需次数', String(r.ab.hits), String(r.ba.hits)],
    ['击杀用时', fmtTime(r.ab), fmtTime(r.ba)],
    ['DPS', fmtDps(r.ab), fmtDps(r.ba)],
  ];
  const dpsReason = r.ab.dpsReason || r.ba.dpsReason;
  return (
    <div id="duel-res" className="posbox" ref={resultElRef}>
      <h2 className={'duel-win w-' + summary.winner} ref={headingRef} tabIndex={-1}>
        <Icon name={summary.icon} /> {wn}
        {r.winner !== 'draw' && (
          <small className="note">
            {' '}
            · 用时 <span className="num nw">{r1(r.duration)}s</span> · 剩余生命{' '}
            <span className="num nw">
              {formatHp(r.remaining)} / {formatHp((r.winner === 'a' ? A : B).F.hp)}
            </span>
          </small>
        )}
      </h2>
      <DuelUnmodeledNotes
        entries={[
          { side: 'a', badge: 'A', unit: A.u, civ: A.civ, age: A.age, selectedTechs: selectedTechsOf(A) },
          { side: 'b', badge: 'B', unit: B.u, civ: B.civ, age: B.age, selectedTechs: selectedTechsOf(B) },
        ]}
        vgSides={[
          { rowKey: 'a', k: 'a', unitId: A.u.id, civ: A.civ, age: A.age, rof: A.S.rof, seconds: r.duration },
          { rowKey: 'b', k: 'b', unitId: B.u.id, civ: B.civ, age: B.age, rof: B.S.rof, seconds: r.duration },
        ]}
      />
      <ShareImage
        title={`${A.u.zh} 对 ${B.u.zh}：${wn}`}
        stats={[
          ['模拟用时', `${r1(r.duration)} 秒`],
          ['剩余生命', formatHp(r.remaining)],
          ['双方数量', '1 / 1'],
        ]}
        note="忽略射程拉扯与操作；完整文明和科技参数见链接。"
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
          {rows.map(([n, a, b]) => (
            <tr key={n}>
              <td>{n}</td>
              <td>{a}</td>
              <td>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {dpsReason && (
        <p className="note" data-t="dps-reason">
          {dpsReason}
        </p>
      )}
      <BattleReplay frames={oneReplay(A.F, B.F, r)} duration={r.duration} a={A.u} b={B.u} maxA={A.F.hp} maxB={B.F.hp} unit="生命" />
      <OneTimeline A={A} B={B} result={r} />
      {(A.F.ranged || B.F.ranged) && (
        <p className="note">
          <Icon name="triangle-alert" className="ic warn" /> 1v1 基础模式忽略射程与风筝：远程单位实战中可在接敌前先手输出（射程 {r1(A.S.rng)} / {r1(B.S.rng)}
          ）。
        </p>
      )}
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
  const g = result ?? groupFight(A.F, na, B.F, nb);
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
          { side: 'a', badge: 'A', unit: A.u, civ: A.civ, age: A.age, selectedTechs: selectedTechsOf(A) },
          { side: 'b', badge: 'B', unit: B.u, civ: B.civ, age: B.age, selectedTechs: selectedTechsOf(B) },
        ]}
        vgSides={[
          { rowKey: 'a', k: 'a', unitId: A.u.id, civ: A.civ, age: A.age, rof: A.S.rof, seconds: g.contact.a[0]!.meleeUnitSeconds },
          { rowKey: 'b', k: 'b', unitId: B.u.id, civ: B.civ, age: B.age, rof: B.S.rof, seconds: g.contact.b[0]!.meleeUnitSeconds },
        ]}
      />
      <GroupContact value={g.contact} a={{ fighter: A.F, count: na, ...g.contact.a[0]! }} b={{ fighter: B.F, count: nb, ...g.contact.b[0]! }} />
      <ShareImage
        title={`${na} ${A.u.zh} 对 ${nb} ${B.u.zh}：${wn}`}
        stats={[
          ['模拟用时', `${r1(g.duration)} 秒`],
          ['A 存活', g.aAlive],
          ['B 存活', g.bAlive],
        ]}
        note="一维接敌与占位近似，结果用于比较方案。"
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
      <BattleReplay frames={groupReplay(g)} duration={g.duration} a={A.u} b={B.u} maxA={na} maxB={nb} unit="个单位" />
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
