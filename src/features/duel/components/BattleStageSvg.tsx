import { useId } from 'react';
import { formatMeleeCaption, isLargeAggregate, type BattleReplayModel, type BattleReplaySnapshot } from '../../../domain/battleReplay';
import { formatHp } from '../../../domain/hpFormat';
import { computeRetreatCapLines } from '../logic/duelKiteView';

interface BattleStageSvgProps {
  model: BattleReplayModel;
  snap: BattleReplaySnapshot;
  isCompact: boolean;
  isNarrow: boolean;
}

function r1(v: number): string {
  return String(Math.round(v * 10) / 10);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function estimateSvgTextWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    w += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/u.test(ch) ? 12.6 : 7.4;
  }
  return Math.ceil(w);
}

export function BattleStageSvg({ model, snap, isCompact, isNarrow }: BattleStageSvgProps) {
  const arrowId = useId();
  const W = isNarrow ? 340 : 760;
  const H = isNarrow ? 196 : 220;
  const padL = isNarrow ? 54 : 112;
  const padR = isNarrow ? 54 : 112;
  const trackW = W - padL - padR;
  const rulerY = 24;
  const laneY = isNarrow ? 98 : 108;
  const footY = H - 22;

  const { minX, span, originX } = model.bounds;
  const toX = (worldX: number) => padL + ((worldX - minX) / span) * trackW;

  const xA = clamp(toX(snap.aPos), padL, W - padR);
  const xB = clamp(toX(snap.bPos), padL, W - padR);
  const contactLineX = model.trace.contactX !== null ? clamp(toX(model.trace.contactX), padL, W - padR) : null;
  const retreatCapLines = computeRetreatCapLines(model);

  const aFrontMeta = model.a.rows[snap.aFrontRow];
  const bFrontMeta = model.b.rows[snap.bFrontRow];
  const aFrontSnap = snap.aRows[snap.aFrontRow];
  const bFrontSnap = snap.bRows[snap.bFrontRow];

  const aDead = Math.max(0, model.a.totalInitial - snap.aAlive);
  const bDead = Math.max(0, model.b.totalInitial - snap.bAlive);
  const aWait = Math.max(0, snap.aAlive - snap.aActive);
  const bWait = Math.max(0, snap.bAlive - snap.bActive);
  const largeAgg = isLargeAggregate(model);
  const compactDots = isCompact || largeAgg;

  // 顶部格距刻度（统一 3 刻度，保证跨视口文本确定性与窄屏可读性）
  const tickCount = 3;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const ratio = i / (tickCount - 1);
    const wx = minX + span * ratio;
    const rel = Math.round((wx - originX) * 10) / 10;
    const label = Math.abs(rel) < 0.05 ? '0' : `${rel > 0 ? '+' : ''}${r1(rel)}`;
    return { x: padL + trackW * ratio, label };
  });

  // 最小射程盲区带（与 snap.silencedMinRange 严格同源）
  const blindZone = (() => {
    const bz = snap.blindZone;
    if (!bz) return null;
    const rows = bz.side === 'a' ? snap.aRows : snap.bRows;
    const sb = rows[bz.rowIndex]?.setback ?? 0;
    if (bz.side === 'b') {
      const rightEdge = clamp(toX(snap.bPos + sb), padL, W - padR);
      const leftEdge = clamp(toX(snap.bPos + sb - bz.minRange), padL, rightEdge);
      return { side: bz.side, x: leftEdge, w: Math.max(8, rightEdge - leftEdge), minRange: bz.minRange };
    }
    const leftEdge = clamp(toX(snap.aPos - sb), padL, W - padR);
    const rightEdge = clamp(toX(snap.aPos - sb + bz.minRange), leftEdge, W - padR);
    return { side: bz.side, x: leftEdge, w: Math.max(8, rightEdge - leftEdge), minRange: bz.minRange };
  })();

  // 远程活跃射击方（用于绘制最多 3 条虚线弹道弧线与底部射程标注）
  const aRangedActiveIdx = model.a.rows.findIndex((r, i) => r.ranged && (snap.aRows[i]?.active ?? 0) > 0);
  const bRangedActiveIdx = model.b.rows.findIndex((r, i) => r.ranged && (snap.bRows[i]?.active ?? 0) > 0);
  const rangedArcs: { key: string; d: string; color: string }[] = [];
  if (aRangedActiveIdx >= 0 && snap.bAlive > 0) {
    const startX = clamp(toX(snap.aPos - (snap.aRows[aRangedActiveIdx]?.setback ?? 0)), padL, W - padR);
    const arcCount = model.kind === 'one' ? 1 : Math.min(3, Math.max(1, Math.ceil((snap.aRows[aRangedActiveIdx]?.active ?? 1) / 8)));
    for (let i = 0; i < arcCount; i++) {
      const dy = (i - (arcCount - 1) / 2) * 14;
      const midX = (startX + xB) / 2;
      const lift = 28 + i * 10;
      rangedArcs.push({
        key: `arc-a-${i}`,
        d: `M ${startX.toFixed(1)} ${(laneY + dy).toFixed(1)} Q ${midX.toFixed(1)} ${(laneY - lift).toFixed(1)} ${xB.toFixed(1)} ${(laneY + dy * 0.4).toFixed(1)}`,
        color: 'var(--color-accent)',
      });
    }
  }
  if (bRangedActiveIdx >= 0 && snap.aAlive > 0) {
    const startX = clamp(toX(snap.bPos + (snap.bRows[bRangedActiveIdx]?.setback ?? 0)), padL, W - padR);
    const arcCount = model.kind === 'one' ? 1 : Math.min(3, Math.max(1, Math.ceil((snap.bRows[bRangedActiveIdx]?.active ?? 1) / 8)));
    for (let i = 0; i < arcCount; i++) {
      const dy = (i - (arcCount - 1) / 2) * 14;
      const midX = (startX + xA) / 2;
      const lift = 28 + i * 10;
      rangedArcs.push({
        key: `arc-b-${i}`,
        d: `M ${startX.toFixed(1)} ${(laneY + dy).toFixed(1)} Q ${midX.toFixed(1)} ${(laneY - lift).toFixed(1)} ${xA.toFixed(1)} ${(laneY + dy * 0.4).toFixed(1)}`,
        color: 'var(--color-link)',
      });
    }
  }

  // 渲染单侧单位队列（恒定低 SVG 节点数）
  const renderSide = (side: 'a' | 'b') => {
    const isA = side === 'a';
    const xFront = isA ? xA : xB;
    const dir = isA ? -1 : 1; // 向后排延展方向
    const color = isA ? 'var(--color-accent)' : 'var(--color-link)';
    const soft = isA ? 'var(--color-accent-soft)' : 'var(--color-link-soft)';
    const alive = isA ? snap.aAlive : snap.bAlive;
    const active = isA ? snap.aActive : snap.bActive;
    const wait = isA ? aWait : bWait;
    const dead = isA ? aDead : bDead;
    const frontMeta = isA ? aFrontMeta : bFrontMeta;
    const frontSnap = isA ? aFrontSnap : bFrontSnap;

    if (alive <= 0) {
      return (
        <g key={`side-${side}`} data-t={`replay-dead-${side}`}>
          <rect
            x={clamp(xFront + dir * 24 - 28, 6, W - 62)}
            y={laneY - 18}
            width={56}
            height={36}
            rx={6}
            fill="var(--color-surface)"
            fillOpacity={0.7}
            stroke="var(--color-border)"
            strokeDasharray="4 3"
          />
          <text x={clamp(xFront + dir * 24, 34, W - 34)} y={laneY + 4} textAnchor="middle" fontSize={12} fill="var(--color-muted)">
            全灭
          </text>
        </g>
      );
    }

    // 1v1：清晰单兵令牌与血条
    if (model.kind === 'one' && frontMeta && frontSnap) {
      const hpRatio = frontMeta.maxHpPerUnit > 0 ? clamp(frontSnap.hp / frontMeta.maxHpPerUnit, 0, 1) : 0;
      const cx = clamp(xFront + dir * 14, 24, W - 24);
      const barW = 46;
      return (
        <g key={`side-${side}`}>
          <circle
            cx={cx}
            cy={laneY}
            r={13}
            fill={frontSnap.silencedByMinRange ? 'var(--color-warn-soft)' : color}
            fillOpacity={1}
            stroke={frontSnap.silencedByMinRange ? 'var(--color-warn)' : color}
            strokeWidth={2}
            data-t={`replay-token-${side}`}
          />
          <text
            x={cx}
            y={laneY + 4}
            textAnchor="middle"
            fontSize={12}
            fontWeight={700}
            fill={frontSnap.silencedByMinRange ? 'var(--color-warn)' : 'var(--color-on-accent)'}
          >
            {isA ? 'A' : 'B'}
          </text>
          <rect x={cx - barW / 2} y={laneY + 20} width={barW} height={6} rx={3} fill="var(--color-control)" />
          <rect x={cx - barW / 2} y={laneY + 20} width={barW * hpRatio} height={6} rx={3} fill={color} />
          <text x={cx} y={laneY + 40} textAnchor="middle" fontSize={12} fill="var(--color-text)">
            {formatHp(frontSnap.hp)}
          </text>
        </g>
      );
    }

    // 1 射程多排近战（最多 3 列 × 4 点）
    const multiDepth = Boolean(frontMeta && !frontMeta.ranged && frontMeta.canFightAtMultipleDepths && (frontSnap?.ranks ?? 0) > 1 && !compactDots);
    const cols = multiDepth ? Math.min(3, frontSnap!.ranks) : 1;
    const perCol = compactDots ? 5 : multiDepth ? 4 : 6;
    const shownActive = Math.min(Math.max(active, alive > 0 ? 1 : 0), cols * perCol);
    const dotR = isNarrow ? 3.5 : 4.5;
    const colGap = isNarrow ? 9 : 12;
    const rowGap = isNarrow ? 11 : 13;
    const dots: { cx: number; cy: number; key: string }[] = [];
    for (let i = 0; i < shownActive; i++) {
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      const inThisCol = Math.min(perCol, shownActive - col * perCol);
      const cx = clamp(xFront + dir * (10 + col * colGap), 10, W - 10);
      const cy = laneY + (row - (inThisCol - 1) / 2) * rowGap;
      dots.push({ cx, cy, key: `${side}-d-${i}` });
    }

    const backBaseX = xFront + dir * (18 + cols * colGap + (isNarrow ? 18 : 34));
    const waitBoxW = isNarrow ? 48 : 68;
    const waitX = clamp(backBaseX - waitBoxW / 2, 4, W - waitBoxW - 4);
    const deadX = isA ? 6 : W - (isNarrow ? 44 : 64);

    return (
      <g key={`side-${side}`}>
        {multiDepth && cols > 1 && (
          <line
            x1={clamp(xFront + dir * 10, 10, W - 10)}
            y1={laneY}
            x2={clamp(xFront + dir * (10 + (cols - 1) * colGap), 10, W - 10)}
            y2={laneY}
            stroke={color}
            strokeWidth={2}
            strokeOpacity={0.45}
          />
        )}
        {dots.map((d) => (
          <circle key={d.key} cx={d.cx} cy={d.cy} r={dotR} fill={color} fillOpacity={active > 0 ? 0.95 : 0.45} />
        ))}
        {active > 0 && (
          <text x={clamp(xFront + dir * 14, 24, W - 24)} y={laneY - 38} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--color-text)">
            {multiDepth ? `${frontSnap!.ranks}排·${active}人` : `×${active}`}
          </text>
        )}
        {wait > 0 && (
          <g>
            <rect
              x={waitX}
              y={laneY - 22}
              width={waitBoxW}
              height={44}
              rx={6}
              fill={soft}
              fillOpacity={0.85}
              stroke={color}
              strokeDasharray="4 3"
              strokeWidth={1.2}
            />
            <text x={waitX + waitBoxW / 2} y={laneY - 3} textAnchor="middle" fontSize={12} fill="var(--color-text)">
              后排
            </text>
            <text x={waitX + waitBoxW / 2} y={laneY + 13} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--color-text)">
              {wait}
            </text>
          </g>
        )}
        {!isNarrow && dead > 0 && (
          <g>
            <rect x={deadX} y={laneY - 16} width={58} height={32} rx={6} fill="var(--color-surface)" fillOpacity={0.65} stroke="var(--color-border)" />
            <text x={deadX + 29} y={laneY - 1} textAnchor="middle" fontSize={12} fill="var(--color-muted)">
              阵亡
            </text>
            <text x={deadX + 29} y={laneY + 12} textAnchor="middle" fontSize={12} fill="var(--color-muted)">
              {dead}
            </text>
          </g>
        )}
      </g>
    );
  };

  // 底部摘要提示（接敌人数 / 拉扯 / 脱离接战 / 射程先手窗口）
  const bottomCaption = (() => {
    if (snap.phase === 'disengaged') {
      return `双方脱离接战（间距 ${r1(snap.gap)} 格）`;
    }
    if (snap.phase === 'kiting') {
      return `远程拉扯后撤 · 间距 ${r1(snap.gap)} 格`;
    }
    if (snap.phase === 'melee') {
      return formatMeleeCaption(model, snap);
    }
    if (snap.phase === 'opening' && snap.openingSide) {
      const sideMeta = snap.openingSide === 'a' ? model.a : model.b;
      const shooter = sideMeta.rows.find((r) => r.ranged) ?? sideMeta.rows[0];
      const fs = model.contact.firstStrike;
      if (shooter) {
        return `${snap.openingSide.toUpperCase()} ${shooter.name}射程 ${r1(shooter.rng)} 格${fs ? `（先手 ${r1(fs.duration)} 秒 · ${fs.volleys} 轮）` : ''}`;
      }
    }
    if (blindZone) {
      return `最小射程盲区（< ${formatHp(blindZone.minRange)} 格停火）`;
    }
    return `初始间距 ${r1(model.trace.initialGap)} 格`;
  })();

  // 混编已清空前排（严格对齐 battleReplay.ts，仅含真正前排 rowIndex < rows.length - 1，不含末行全灭）
  const clearedBadges =
    model.kind === 'mixed'
      ? snap.clearedEvents.filter((ev) => {
          const sideMeta = ev.side === 'a' ? model.a : model.b;
          return sideMeta.rows.length > 1 && ev.rowIndex < sideMeta.rows.length - 1;
        })
      : [];

  return (
    <div className="br-stage-wrap">
      {clearedBadges.length > 0 && (
        <div className="br-cleared-strip" data-t="replay-cleared-badges" role="status" aria-label="已清空前排记录">
          {clearedBadges.map((ev) => {
            const tag = `${ev.side.toUpperCase()}${ev.rowIndex + 1}`;
            const rowName = (ev.side === 'a' ? model.a : model.b).rows[ev.rowIndex]?.name ?? '';
            return (
              <span key={`clr-${ev.side}-${ev.rowIndex}`} className="br-cleared-pill" data-t="replay-row-cleared" data-row-tag={tag}>
                <span className="nw">{tag} 前排清空</span>
                <span aria-hidden="true">·</span>
                <span>{rowName}</span>
                <span className="num nw">0/{ev.initial}</span>
                <span aria-hidden="true">·</span>
                <span className="num nw">@{r1(ev.t)}s</span>
              </span>
            );
          })}
        </div>
      )}
      <svg
        className="br-stage-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`战斗一维战线画布：${snap.phaseLabel}，阵线间距 ${r1(snap.gap)} 格`}
        data-t="replay-stage-svg"
      >
        <defs>
          <marker id={arrowId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--color-warn)" />
          </marker>
        </defs>

        {/* 顶部格距标尺 */}
        <line x1={padL} y1={rulerY} x2={W - padR} y2={rulerY} stroke="var(--color-border)" strokeWidth={1} />
        {ticks.map((tk, i) => (
          <g key={i}>
            <line x1={tk.x} y1={rulerY - 4} x2={tk.x} y2={rulerY + 4} stroke="var(--color-muted)" strokeWidth={1} />
            <text x={tk.x} y={rulerY - 8} textAnchor="middle" fontSize={12} fill="var(--color-muted)">
              {tk.label}
            </text>
          </g>
        ))}

        {/* 主战场轨道底线 */}
        <line x1={padL} y1={laneY} x2={W - padR} y2={laneY} stroke="var(--color-line)" strokeWidth={2} />

        {/* 最小射程盲区提醒带 */}
        {blindZone && (
          <g data-t="replay-blind-zone" data-side={blindZone.side} data-min-range={blindZone.minRange}>
            <rect
              x={blindZone.x}
              y={laneY - 34}
              width={blindZone.w}
              height={68}
              rx={4}
              fill="var(--color-warn-soft)"
              fillOpacity={0.75}
              stroke="var(--color-warn)"
              strokeDasharray="4 3"
              strokeWidth={1}
            />
          </g>
        )}

        {/* 40 格退距上限参照线（仅触底或已触发拉扯且落入遍历包络时绘制，严禁撑宽标尺） */}
        {retreatCapLines.map((line) => {
          const lx = clamp(toX(line.x), padL, W - padR);
          return (
            <g key={`cap-${line.side}`} data-t="replay-retreat-cap" data-side={line.side} data-hit={line.hit ? 'true' : 'false'}>
              <line
                x1={lx}
                y1={rulerY + 6}
                x2={lx}
                y2={footY - 22}
                stroke={line.hit ? 'var(--color-warn)' : 'var(--color-muted)'}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                strokeOpacity={0.85}
              />
            </g>
          );
        })}

        {/* 0 接敌/碰撞参考线（纯远程对射 contactX === null 不绘红线） */}
        {contactLineX !== null && (
          <g data-t="replay-contact-line">
            <line
              x1={contactLineX}
              y1={rulerY + 6}
              x2={contactLineX}
              y2={footY - 22}
              stroke="var(--color-bad)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              strokeOpacity={0.75}
            />
          </g>
        )}

        {/* 远程弹道弧线 */}
        {rangedArcs.map((arc) => (
          <path key={arc.key} d={arc.d} fill="none" stroke={arc.color} strokeWidth={1.6} strokeOpacity={0.85} className="br-arc" />
        ))}

        {/* 混编已清空前排原位标尺小标针与底部推进箭头（文字标牌位于画布上方独立胶囊条，不侵入兵线） */}
        {clearedBadges.map((ev) => {
          const cx = clamp(toX(ev.x), padL + 10, W - padR - 10);
          const targetX = ev.side === 'a' ? xA : xB;
          return (
            <g key={`clr-pin-${ev.side}-${ev.rowIndex}`} data-t="replay-row-cleared-pin">
              <line x1={cx} y1={rulerY} x2={cx} y2={rulerY + 8} stroke="var(--color-warn)" strokeWidth={1.5} />
              <circle cx={cx} cy={rulerY + 9} r={2.5} fill="var(--color-warn)" />
              {Math.abs(targetX - cx) > 10 && (
                <path
                  d={`M ${targetX.toFixed(1)} ${(footY - 26).toFixed(1)} L ${cx.toFixed(1)} ${(footY - 26).toFixed(1)}`}
                  fill="none"
                  stroke="var(--color-warn)"
                  strokeWidth={1.6}
                  strokeDasharray="4 3"
                  markerEnd={`url(#${arrowId})`}
                />
              )}
            </g>
          );
        })}

        {/* A / B 双方阵型 */}
        {renderSide('a')}
        {renderSide('b')}

        {/* 底部状态胶囊 */}
        {(() => {
          const capW = Math.min(W - 12, Math.max(184, estimateSvgTextWidth(bottomCaption) + 24));
          return (
            <g data-t="replay-bottom-caption">
              <rect
                x={W / 2 - capW / 2}
                y={footY - 14}
                width={capW}
                height={22}
                rx={11}
                fill={snap.phase === 'melee' ? 'var(--color-bad-soft)' : 'var(--color-surface)'}
                stroke={snap.phase === 'melee' ? 'var(--color-bad)' : 'var(--color-border)'}
                strokeWidth={1}
              />
              <text
                x={W / 2}
                y={footY + 1}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill={snap.phase === 'melee' ? 'var(--color-bad)' : 'var(--color-text-2)'}
              >
                {bottomCaption}
              </text>
            </g>
          );
        })()}
      </svg>

      <div className="br-legend" aria-hidden="true">
        <span className="br-legend-item">
          <i className="br-dot is-a-active" /> A 活跃出手
        </span>
        <span className="br-legend-item">
          <i className="br-dot is-a-wait" /> A 后排排队
        </span>
        <span className="br-legend-item">
          <i className="br-dot is-b-active" /> B 活跃出手
        </span>
        <span className="br-legend-item">
          <i className="br-dot is-b-wait" /> B 后排排队
        </span>
        <span className="br-legend-item">
          <i className="br-dot is-contact" /> 接触线
        </span>
        {retreatCapLines.length > 0 && (
          <span className="br-legend-item" data-t="replay-legend-retreat-cap">
            <i className={`br-dot is-retreat-cap${retreatCapLines.some((l) => l.hit) ? ' is-hit' : ''}`} />
            <span className="num nw">40 格</span>退距线
          </span>
        )}
      </div>
    </div>
  );
}
