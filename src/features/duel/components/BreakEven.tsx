/** #25 PK 盈亏平衡点（v3 样稿 docs/design/mockups/issue25-v3/）。只负责展示，计算见 domain/breakEven.ts */
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { breakEven, BREAK_EVEN_CAP, type BreakEvenResult } from '../../../domain/breakEven';
import type { Fighter } from '../../../domain/duel';
import { Icon } from '../../../shared/ui/Icon';
import { useShareLink } from '../../../shared/ui/useShareLink';

const r1 = (x: number) => String(Math.round(x * 10) / 10);

export interface BreakEvenProps {
  a: Fighter;
  b: Fighter;
  /** B 固定数量：N vs M 为当前 M，1v1 为 1 */
  nb: number;
  /** 参数摘要，如「拜占庭 长戟兵 vs 法兰克 游侠 · 满科技」 */
  summary: string;
  /** 参数签名：变化即视为旧结果 */
  sig: string;
  /** URL 带 be=1 时打开即计算 */
  auto: boolean;
  onComputed: () => void;
  onOpen: (na: number, nb: number) => void;
}

export function BreakEven({ a, b, nb, summary, sig, auto, onComputed, onOpen }: BreakEvenProps) {
  const route = useLocation();
  const compute = () => ({ sig, r: breakEven(a, b, nb, BREAK_EVEN_CAP), aName: a.name, bName: b.name, summary });
  // URL 带 be=1（分享链接）时首次渲染即计算
  const [res, setRes] = useState<{ sig: string; r: BreakEvenResult; aName: string; bName: string; summary: string } | null>(() => (auto ? compute() : null));
  const {
    copy: copyLink,
    copied,
    status,
    manualLink,
    statusProps,
  } = useShareLink({
    stateKey: JSON.stringify([sig, auto, route.pathname, route.search]),
    successMessage: '链接已复制。',
    failureMessage: '自动复制失败，请手动复制下方完整链接。',
  });
  const run = () => {
    setRes(compute());
    onComputed();
  };
  const stale = !!res && res.sig !== sig;
  const copy = () => copyLink(location.href);
  if (!res)
    return (
      <div className="be-entry" data-t="be-entry">
        <button type="button" className="be-pri" onClick={run}>
          <Icon name="scale" /> 算盈亏平衡
        </button>
        <small className="note">{nb === 1 ? '几个 A 能打过 1 个 B' : `A 至少要多少个才能打赢 B × ${nb}`}</small>
      </div>
    );
  const { r, aName, bName } = res;
  // 变灰时仍展示计算当时的参数摘要
  const sumText = res.summary;
  return (
    <div className="be-wrap" id="duel-be">
      {stale && (
        <div className="be-stale" role="status" data-t="be-stale">
          <span>
            <Icon name="triangle-alert" />
            参数已变，请重新计算
          </span>
          <button type="button" className="be-pri" onClick={run}>
            <Icon name="calculator" /> 重新计算
          </button>
        </div>
      )}
      <section className={'be-card' + (stale ? ' is-stale' : '')} aria-label="盈亏平衡点">
        <h2 className="be-title">
          <Icon name="scale" /> 盈亏平衡点
        </h2>
        {r.n !== null ? (
          <p className="be-hero">
            <b className="be-n" data-t="be-n">
              {r.n}
            </b>
            <span>
              个{aName}，才能打赢 {r.nb} 个{bName}
            </span>
          </p>
        ) : (
          <div className="be-cap" data-t="be-cap">
            <b>{r.cap} 个以内都打不赢</b>
            <span>
              A 用 {r.cap} 个{aName}仍打不赢 {r.nb} 个{bName}。下面是 {r.cap} 个时的战损。
            </span>
          </div>
        )}
        {r.n !== null && (
          <p className="be-sub" data-t="be-sub">
            {r.n} 个及以上都能赢
          </p>
        )}
        <p className="note be-sum">{sumText} · 集火模型</p>
        <div className="be-tw">
          <table className="stat be-tab">
            <thead>
              <tr>
                <td>A 数量</td>
                <td>结果</td>
                <td>A 剩余</td>
                <td>B 剩余</td>
                <td>用时</td>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((x) => (
                <tr key={x.n} className={x.n === r.n ? 'on' : undefined} data-n={x.n}>
                  <td>{x.n}</td>
                  <td className={x.win ? 'be-w' : 'be-l'}>
                    <Icon name={x.win ? 'check' : 'x'} /> {x.win ? 'A 胜' : 'A 负（含平局）'}
                  </td>
                  <td>{x.r.aAlive}</td>
                  <td>{x.r.bAlive}</td>
                  <td>{r1(x.r.duration)} 秒</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="be-how">
          怎么算的：B 固定 {r.nb} 个，A 从 1 个起逐个加到 {r.cap} 个，用和群战相同的集火模型，找出 A <b>严格获胜</b>的最少数量；平局算没打赢。
        </p>
        {r.n !== null && (
          <div className="be-act">
            <button type="button" className="be-pri" disabled={stale} onClick={() => onOpen(r.n!, r.nb)}>
              <Icon name="arrow-right" /> 在 N vs M 中打开 {r.n} vs {r.nb}
            </button>
            <button type="button" className="be-sec" onClick={copy}>
              {copied ? '已复制' : '复制链接'}
            </button>
            <span className="share-link-status" {...statusProps}>
              {copied ? status : ''}
            </span>
          </div>
        )}
        {manualLink && (
          <>
            <p className="note" {...statusProps}>
              {status}
            </p>
            <label className="note share-link-manual">
              手动复制盈亏平衡链接
              <textarea aria-label="手动复制盈亏平衡链接" readOnly value={manualLink} rows={3} onFocus={(e) => e.currentTarget.select()} />
            </label>
          </>
        )}
      </section>
    </div>
  );
}
