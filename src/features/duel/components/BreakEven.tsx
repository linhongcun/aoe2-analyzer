/** #25 PK 盈亏平衡点（v3 样稿：https://github.com/linhongcun/aoe2-analyzer/tree/362f1ed7a7acebbecb08f43dfa04684828eba923/docs/design/mockups/issue25-v3/）。只负责展示，计算见 domain/breakEven.ts */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { breakEvenSteps, type BreakEvenResult } from '../../../domain/breakEven';
import { fighterUsesAssumeHit, type Fighter } from '../../../domain/duel';
import { Icon } from '../../../shared/ui/Icon';
import { useShareLink } from '../../../shared/ui/useShareLink';
import { CONTACT_MODEL, STOP_LABELS } from './ContactSummary';

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
  const [job, setJob] = useState(() => (auto ? { sig, a, b, nb, summary } : null));
  const [res, setRes] = useState<{ sig: string; r: BreakEvenResult; aName: string; bName: string; summary: string; assumeHitSides: string[] } | null>(null);
  if (job && job.sig !== sig) setJob(null);
  const pending = job?.sig === sig;
  useEffect(() => {
    if (!job || job.sig !== sig) return;
    const steps = breakEvenSteps(job.a, job.b, job.nb);
    let timer: ReturnType<typeof setTimeout>;
    const batch = () => {
      const until = performance.now() + 8;
      do {
        const step = steps.next();
        if (step.done) {
          const assumeHitSides = [...(fighterUsesAssumeHit(job.a) ? [`A 方${job.a.name}`] : []), ...(fighterUsesAssumeHit(job.b) ? [`B 方${job.b.name}`] : [])];
          setRes({ sig: job.sig, r: step.value, aName: job.a.name, bName: job.b.name, summary: job.summary, assumeHitSides });
          setJob(null);
          return;
        }
      } while (performance.now() < until);
      timer = setTimeout(batch, 0);
    };
    timer = setTimeout(batch, 0);
    return () => clearTimeout(timer);
  }, [job, sig]);
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
    setJob({ sig, a, b, nb, summary });
    onComputed();
  };
  const stale = !!res && res.sig !== sig;
  const copy = () => copyLink(location.href);
  if (pending)
    return (
      <p className="note" role="status">
        正在计算盈亏平衡点…
      </p>
    );
  if (!res)
    return (
      <div className="be-entry" data-t="be-entry">
        <button type="button" className="be-pri" onClick={run}>
          <Icon name="scale" /> 算盈亏平衡
        </button>
        <small className="note">
          A 至少要多少个才能打赢 <span className="num nw">B × {nb}</span>
        </small>
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
        {r.interrupted ? (
          <div className="be-cap" role="status">
            <b>盈亏平衡计算中止</b>
            <span>
              A 方 <span className="num nw">{r.interrupted.n} 个单位</span>一档未完成。
              {r.interrupted.result.reason}
            </span>
          </div>
        ) : r.n !== null ? (
          <p className="be-hero">
            <b className="be-n" data-t="be-n">
              {r.n}
            </b>
            <span>
              <span className="num nw">个{aName}</span>
              {r.incomplete ? '起已确认能打赢 ' : '，才能打赢 '}
              <span className="num nw">{r.nb} 个</span>
              {bName}
            </span>
          </p>
        ) : (
          <div className="be-cap" data-t="be-cap">
            <b>
              <span className="num nw">{r.cap} 个</span>以内未找到稳定获胜门槛
            </b>
            <span>
              下方显示 A 方 <span className="num nw">{r.cap} 个单位</span>时的战损。
            </span>
          </div>
        )}
        {r.n !== null && (
          <p className="be-sub" data-t="be-sub">
            从 <span className="num nw">{r.n} 个</span>到 <span className="num nw">{r.cap} 个</span>均能获胜
          </p>
        )}
        {r.incomplete && (
          <p className="note">
            A 方 <span className="num nw">{r.incomplete.n} 个单位</span>一档{STOP_LABELS[r.incomplete.status]}。
          </p>
        )}
        <p className="note be-sum">
          {sumText} · {CONTACT_MODEL}
        </p>
        {!!r.rows.length && (
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
                {r.rows.map((x) => {
                  const status = x.r.status;
                  const unfinished = status === 'timeout' || status === 'limit';
                  return (
                    <tr key={x.n} className={x.n === r.n ? 'on' : undefined} data-n={x.n}>
                      <td className="num nw">{x.n}</td>
                      <td className={unfinished ? undefined : x.win ? 'be-w' : 'be-l'}>
                        <Icon name={unfinished ? 'info' : x.win ? 'check' : 'x'} /> {unfinished ? STOP_LABELS[status] : x.win ? 'A 胜' : 'A 负（含平局）'}
                      </td>
                      <td className="num nw">{x.r.aAlive}</td>
                      <td className="num nw">{x.r.bAlive}</td>
                      <td className="num nw">{r1(x.r.duration)} 秒</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="be-how">
          B 方固定 <span className="num nw">{r.nb} 个</span>，从 <span className="num nw">1 个</span>起逐档计算 A 方。
          取从该数量起、直到计算上限每一档都能获胜的最少数量。平局及未分出胜负的档位不计为胜局。
        </p>
        {res.assumeHitSides.length > 0 && (
          <p className="be-how" data-t="be-assume-hit">
            {res.assumeHitSides.join('、')} · 按每击命中估算：目录准确度 <span className="num nw">0%</span>{' '}
            不表示打不中。本场把每次主弹都算作命中主目标，这是主弹对单个目标的输出上限（同上方结果口径）。
          </p>
        )}
        {r.n !== null && (
          <div className="be-act">
            <button type="button" className="be-pri" disabled={stale} onClick={() => onOpen(r.n!, r.nb)}>
              <Icon name="arrow-right" /> 在 N vs M 中打开{' '}
              <span className="num nw">
                {r.n} vs {r.nb}
              </span>
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
