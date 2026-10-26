import ShareImage from '../../../shared/ui/ShareImage';
import { duel, groupFight, costSum } from '../../../domain/duel';
import { sideEngagementSeconds } from '../../../domain/generateResource';
import { groupReplay, oneReplay } from '../../../domain/battleReplay';
import { formatTrade, tradeLosses } from '../../../domain/trade';
import { CostView } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { CounterSummary } from './CounterSummary';
import { BattleReplay } from './BattleReplay';
import { VgNotes } from './VgNotes';
import { OneTimeline, GroupTimeline } from './DuelTimeline';
import { r1, type Resolved } from '../logic/duelSide';

export function OneVOne({ A, B }: { A: Resolved; B: Resolved }) {
  const r = duel(A.F, B.F);
  const wn = r.winner === 'draw' ? '平局（同时击杀）' : `${r.winner === 'a' ? 'A' : 'B'} · ${(r.winner === 'a' ? A : B).u.zh} 获胜`;
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
    <div id="duel-res" className="posbox">
      <h2 className={'duel-win w-' + r.winner}>
        <Icon name="trophy" /> {wn}
        {r.winner !== 'draw' && (
          <small className="note">
            {' '}
            · 用时 {r1(r.duration)}s · 剩余生命 {r1(r.remaining)} / {r1((r.winner === 'a' ? A : B).F.hp)}
          </small>
        )}
      </h2>
      <ShareImage
        title={`${A.u.zh} 对 ${B.u.zh}：${wn}`}
        stats={[
          ['模拟用时', `${r1(r.duration)} 秒`],
          ['剩余生命', r1(r.remaining)],
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
      <VgNotes
        sides={[
          { k: 'a', unitId: A.u.id, civ: A.civ, age: A.age, rof: A.S.rof, seconds: r.duration },
          { k: 'b', unitId: B.u.id, civ: B.civ, age: B.age, rof: B.S.rof, seconds: r.duration },
        ]}
      />
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

export function Group({ A, B, na, nb, bud }: { A: Resolved; B: Resolved; na: number; nb: number; bud: number }) {
  const g = groupFight(A.F, na, B.F, nb);
  const wn = g.winner === 'draw' ? '平局 / 同归于尽' : `${g.winner === 'a' ? 'A' : 'B'} · ${(g.winner === 'a' ? A : B).u.zh} 获胜`;
  return (
    <div id="duel-res" className="posbox">
      <h2 className={'duel-win w-' + g.winner}>
        <Icon name="trophy" /> {wn}
        <small className="note">
          {' '}
          · 用时 {r1(g.duration)}s · 剩余 {g.winner === 'b' ? g.bAlive : g.aAlive} 个单位、总生命 {g.hpLeft}
        </small>
      </h2>
      <ShareImage
        title={`${na} ${A.u.zh} 对 ${nb} ${B.u.zh}：${wn}`}
        stats={[
          ['模拟用时', `${r1(g.duration)} 秒`],
          ['A 存活', g.aAlive],
          ['B 存活', g.bAlive],
        ]}
        note="群战不模拟走位、围墙与城镇中心火力；完整参数见链接。"
      />
      {bud > 0 && (
        <p className="note">
          预算 {bud}：A {A.u.zh} × {na}（单价 {costSum(A.disc.cost)}，投入 {na * costSum(A.disc.cost)}），B {B.u.zh} × {nb}（单价 {costSum(B.disc.cost)}，投入{' '}
          {nb * costSum(B.disc.cost)}）
        </p>
      )}
      <CounterSummary a={A.F} b={B.F} />
      <table className="stat duel-tab">
        <tbody>
          <tr>
            <td>数量</td>
            <td>
              A {na}，剩 {g.aAlive}
            </td>
            <td>
              B {nb}，剩 {g.bAlive}
            </td>
          </tr>
        </tbody>
      </table>
      <TradeRow A={A} B={B} na={na} nb={nb} aAlive={g.aAlive} bAlive={g.bAlive} />
      <VgNotes
        sides={[
          { k: 'a', unitId: A.u.id, civ: A.civ, age: A.age, rof: A.S.rof, seconds: sideEngagementSeconds(g.timeline, 'a') },
          { k: 'b', unitId: B.u.id, civ: B.civ, age: B.age, rof: B.S.rof, seconds: sideEngagementSeconds(g.timeline, 'b') },
        ]}
      />
      <BattleReplay frames={groupReplay(g)} duration={g.duration} a={A.u} b={B.u} maxA={na} maxB={nb} unit="个单位" />
      <GroupTimeline result={g} na={na} nb={nb} />
      <p className="note">集火模型：每方所有单位攻击对方第一个存活单位，同时刻伤害同时结算，单位死亡后多余伤害转给下一个目标。</p>
    </div>
  );
}

/** issue 107 交换比：只计阵亡单位，按折后取整单价；金按 1:1 计入 */
function TradeRow({ A, B, na, nb, aAlive, bAlive }: { A: Resolved; B: Resolved; na: number; nb: number; aAlive: number; bAlive: number }) {
  const t = tradeLosses({ na, nb, aAlive, bAlive, costA: A.disc.cost, costB: B.disc.cost });
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
