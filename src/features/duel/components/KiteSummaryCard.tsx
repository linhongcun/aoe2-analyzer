import type { KiteSummary, SideKiteSummary } from '../../../domain/contactKite';
import { formatHp } from '../../../domain/hpFormat';
import { Icon } from '../../../shared/ui/Icon';
import '../ranged-kite.css';

export const KITE_CONTACT_BOUNDARY =
  '边走边射按目录真实出手前摇（停顿）与攻击间隔估算理论理想移动窗口，单方累计后撤上限 40 格（触底后接战）；缺失目录前摇按 0 秒处理。未计入地形障碍、包抄绕路、玩家微操失误、走位躲箭、攻城器拆装与转向。';

const fmt1 = (v: number) => v.toFixed(1);
const fmt2 = (v: number) => v.toFixed(2);

export function DisengagedNotice({
  aName,
  aRng,
  bName,
  bRng,
  disengagedAt,
}: {
  aName: string;
  aRng: number;
  bName: string;
  bRng: number;
  disengagedAt: number;
}) {
  return (
    <div className="kite-disengaged-notice" role="status" data-t="duel-disengaged-notice">
      <Icon name="info" className="ic" />
      <div>
        <strong>双方同时边走边射，已拉开超出最大射程并脱离接战</strong>
        <p>
          A（{aName}，射程 <span className="num nw">{formatHp(aRng)} 格</span>）与 B（{bName}，射程 <span className="num nw">{formatHp(bRng)} 格</span>）于{' '}
          <span className="num nw">{fmt1(disengagedAt)} 秒</span>脱离接战。如需对比单方拉扯，请将其中一方切回「站桩输出」。
        </p>
      </div>
    </div>
  );
}

function RetreatBar({ side }: { side: SideKiteSummary }) {
  const pct = Math.max(0, Math.min(100, (side.retreated / Math.max(1, side.retreatCap)) * 100));
  return (
    <div className="kite-bar-wrap">
      <div className="kite-bar" aria-hidden="true">
        <div className={`kite-bar-fill${side.capHit ? ' is-warn' : ''}`} style={{ width: `${pct.toFixed(1)}%` }} />
      </div>
      <div className="kite-bar-scale">
        <span className="num nw">0 格</span>
        <span className="num nw">{side.capHit ? `${side.retreatCap} / ${side.retreatCap} 格触底` : `上限 ${side.retreatCap} 格`}</span>
      </div>
    </div>
  );
}

function MoveWindowLine({ side }: { side: SideKiteSummary }) {
  return (
    <p>
      移动窗口 <span className="num nw">{fmt2(side.moveWindowSeconds)} 秒 / 轮</span>（
      {side.attackDelaySeconds <= 1e-9 ? (
        <>
          前摇 <span className="num nw">0 秒</span>，按目录处理
        </>
      ) : (
        <>
          前摇停顿 <span className="num nw">{fmt2(side.attackDelaySeconds)} 秒</span>
        </>
      )}
      ）
    </p>
  );
}

function SideEntry({ label, side, mixed }: { label: 'A' | 'B'; side: SideKiteSummary; mixed: boolean }) {
  if (mixed && side.hadMeleeFront) {
    if (!side.triggered) {
      return (
        <div className="kite-side-entry">
          <p>
            {label} 方前排未清空，全程站桩协同（累计后撤 <span className="num nw">0.0 格</span>）。
          </p>
        </div>
      );
    }
    const frontText = side.clearedFrontNames.length ? side.clearedFrontNames.join('、') : '近战';
    return (
      <div className="kite-side-entry">
        <p>
          {label} 方前排 {frontText} 存活期间后排站桩；<span className="num nw">{fmt1(side.activatedAt ?? 0)} 秒</span>清空后 {side.rangedName}{' '}
          自动转入拉扯。后排累计后撤 <span className="num nw">{fmt1(side.retreated)} 格</span> / 上限 <span className="num nw">{side.retreatCap} 格</span>（
          {side.capHit ? '已触底' : '未触底'}）。
        </p>
        <RetreatBar side={side} />
        <MoveWindowLine side={side} />
      </div>
    );
  }
  return (
    <div className="kite-side-entry">
      {side.capHit ? (
        <p>
          {label} 方累计后撤 <span className="num nw">{fmt1(side.retreated)} 格</span>（已触底），于{' '}
          <span className="num nw">{fmt1(side.capHitAt ?? 0)} 秒</span>停步接战
        </p>
      ) : (
        <p>
          {label} 方累计后撤 <span className="num nw">{fmt1(side.retreated)} 格</span> / 上限 <span className="num nw">{side.retreatCap} 格</span>
        </p>
      )}
      <RetreatBar side={side} />
      <MoveWindowLine side={side} />
    </div>
  );
}

/** issue 1295：拉扯结果摘要卡；1v1 传 headingLevel=3（<h3>），群战/混编传 headingLevel=4（<h4>）。 */
export function KiteSummaryCard({ kite, mixed = false, headingLevel = 4 }: { kite: KiteSummary; mixed?: boolean; headingLevel?: 3 | 4 }) {
  const aOn = kite.a.enabled;
  const bOn = kite.b.enabled;
  if (!aOn && !bOn) return null;
  const Heading = headingLevel === 3 ? 'h3' : 'h4';

  // 双边均开启拉扯
  if (aOn && bOn) {
    const disengaged = kite.disengagedAt !== null;
    if (disengaged) {
      return (
        <div className="contact-card kite-summary-card" data-t="duel-kite-card">
          <Heading>双方拉扯退距</Heading>
          <span className="kite-pill is-info" data-t="kite-status-pill">
            <Icon name="info" className="ic" />
            双拉扯 · 已脱离接战
          </span>
          {(
            [
              ['A', kite.a],
              ['B', kite.b],
            ] as const
          ).map(([lbl, s]) => (
            <p key={lbl}>
              {lbl} 方累计后撤 <span className="num nw">{fmt1(s.retreated)} 格</span> / 上限 <span className="num nw">{s.retreatCap} 格</span>
              {s.activatedAt !== null && (
                <>
                  {' '}
                  · <span className="num nw">{fmt1(s.activatedAt)} 秒</span>前排清空后转拉扯
                </>
              )}
            </p>
          ))}
        </div>
      );
    }
    if (mixed) {
      if (!kite.a.triggered && !kite.b.triggered) {
        return (
          <div className="contact-card kite-summary-card" data-t="duel-kite-card">
            <Heading>混编分段拉扯摘要</Heading>
            <span className="kite-pill is-neutral" data-t="kite-status-pill">
              双方前排未清空，全程站桩
            </span>
            <p>
              双方前排存活期间后排保持站桩协同，本场未触发后撤（A 累计后撤 <span className="num nw">0.0 格</span> · B 累计后撤{' '}
              <span className="num nw">0.0 格</span>）。
            </p>
          </div>
        );
      }
      if (kite.a.triggered !== kite.b.triggered) {
        const activeLabel = kite.a.triggered ? 'A' : 'B';
        const activeSide = kite.a.triggered ? kite.a : kite.b;
        const idleLabel = kite.a.triggered ? 'B' : 'A';
        return (
          <div className="contact-card kite-summary-card" data-t="duel-kite-card">
            <Heading>混编分段拉扯摘要</Heading>
            <span className={`kite-pill ${activeSide.capHit ? 'is-warn' : 'is-good'}`} data-t="kite-status-pill">
              <Icon name={activeSide.capHit ? 'triangle-alert' : 'footprints'} className="ic" />
              {activeSide.capHit ? (
                <>
                  已触及 <span className="num nw">40 格</span>退距上限
                </>
              ) : (
                `${activeLabel} · ${activeSide.hadMeleeFront ? '前排清空后转拉扯' : '边走边射（未触底）'}`
              )}
            </span>
            <SideEntry label={activeLabel} side={activeSide} mixed />
            <p>
              {idleLabel} 方前排未清空，全程站桩协同（累计后撤 <span className="num nw">0.0 格</span>）。
            </p>
          </div>
        );
      }
      const anyCap = kite.a.capHit || kite.b.capHit;
      return (
        <div className="contact-card kite-summary-card" data-t="duel-kite-card">
          <Heading>双方混编拉扯摘要</Heading>
          <span className={`kite-pill ${anyCap ? 'is-warn' : 'is-good'}`} data-t="kite-status-pill">
            <Icon name={anyCap ? 'triangle-alert' : 'footprints'} className="ic" />
            {anyCap ? (
              <>
                已触及 <span className="num nw">40 格</span>退距上限
              </>
            ) : (
              '双拉扯 · 分出胜负'
            )}
          </span>
          <SideEntry label="A" side={kite.a} mixed />
          <SideEntry label="B" side={kite.b} mixed />
        </div>
      );
    }
    const anyCap = kite.a.capHit || kite.b.capHit;
    return (
      <div className="contact-card kite-summary-card" data-t="duel-kite-card">
        <Heading>双方拉扯退距</Heading>
        <span className={`kite-pill ${anyCap ? 'is-warn' : 'is-good'}`} data-t="kite-status-pill">
          <Icon name={anyCap ? 'triangle-alert' : 'footprints'} className="ic" />
          {anyCap ? (
            <>
              已触及 <span className="num nw">40 格</span>退距上限
            </>
          ) : (
            '双拉扯 · 分出胜负'
          )}
        </span>
        <SideEntry label="A" side={kite.a} mixed={false} />
        <SideEntry label="B" side={kite.b} mixed={false} />
      </div>
    );
  }

  // 单边开启拉扯
  const label: 'A' | 'B' = aOn ? 'A' : 'B';
  const side = aOn ? kite.a : kite.b;
  if (mixed && side.hadMeleeFront) {
    if (!side.triggered) {
      return (
        <div className="contact-card kite-summary-card" data-t="duel-kite-card">
          <Heading>混编分段拉扯摘要</Heading>
          <span className="kite-pill is-neutral" data-t="kite-status-pill">
            {label} · 前排未清空，全程站桩
          </span>
          <p>
            前排存活期间后排保持站桩协同，本场未触发后撤（累计后撤 <span className="num nw">0.0 格</span>）。
          </p>
        </div>
      );
    }
    const frontText = side.clearedFrontNames.length ? side.clearedFrontNames.join('、') : '近战';
    return (
      <div className="contact-card kite-summary-card" data-t="duel-kite-card">
        <Heading>混编分段拉扯摘要</Heading>
        <span className={`kite-pill ${side.capHit ? 'is-warn' : 'is-good'}`} data-t="kite-status-pill">
          <Icon name={side.capHit ? 'triangle-alert' : 'footprints'} className="ic" />
          {side.capHit ? (
            <>
              已触及 <span className="num nw">40 格</span>退距上限
            </>
          ) : (
            `${label} · 前排清空后转拉扯`
          )}
        </span>
        <p>
          前排 {frontText} 存活期间后排站桩；<span className="num nw">{fmt1(side.activatedAt ?? 0)} 秒</span>清空后 {side.rangedName} 自动转入拉扯。后排累计后撤{' '}
          <span className="num nw">{fmt1(side.retreated)} 格</span> / 上限 <span className="num nw">{side.retreatCap} 格</span>（
          {side.capHit ? '已触底' : '未触底'}）。
        </p>
        <RetreatBar side={side} />
        <MoveWindowLine side={side} />
      </div>
    );
  }

  return (
    <div className="contact-card kite-summary-card" data-t="duel-kite-card">
      <Heading>拉扯与后撤摘要</Heading>
      {side.capHit ? (
        <>
          <span className="kite-pill is-warn" data-t="kite-status-pill">
            <Icon name="triangle-alert" className="ic" />
            已触及 <span className="num nw">40 格</span>退距上限
          </span>
          <p>
            {label} 方累计后撤 <span className="num nw">{fmt1(side.retreated)} 格</span>（已触底），于{' '}
            <span className="num nw">{fmt1(side.capHitAt ?? 0)} 秒</span>停步接战
          </p>
        </>
      ) : (
        <>
          <span className="kite-pill is-good" data-t="kite-status-pill">
            <Icon name="footprints" className="ic" />
            {label} · 边走边射（未触底）
          </span>
          <p>
            累计后撤 <span className="num nw">{fmt1(side.retreated)} 格</span> / 上限 <span className="num nw">{side.retreatCap} 格</span>
          </p>
        </>
      )}
      <RetreatBar side={side} />
      <MoveWindowLine side={side} />
    </div>
  );
}
