/** #24 等资源：每侧的原价 → 折后价、派出数量与「已计入 / 未计入」说明（v3 SPEC）。只展示，数值来自 domain/costDiscount */
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { costSum } from '../../../domain/duel';
import type { CostDiscount } from '../../../domain/costDiscount';
import { RES_ZH } from '../../../domain/ratings';
import { Icon } from '../../../shared/ui/Icon';

import { AGE_ZH as AGE } from '../../../domain/ratings';
const ORDER = ['Food', 'Wood', 'Gold', 'Stone'];
/** issue 97：只在显示层把「-数字」里的连字符换成 U+2212 减号；数据原文不动 */
export const minus = (s: string) => s.replace(/-(?=\s?\d)/g, '\u2212');

/** issue 103：有变化的格子：「原价 ~~55~~ 实际 **47**」；无变化只显示单个数字 */
function WasNow({ was, now, wasLabel = '原价' }: { was: number; now: number; wasLabel?: string }) {
  return (
    <span className="pk-wn">
      <span className="pk-lbl">{wasLabel}</span>
      <s className="pk-was">{was}</s>
      <span className="pk-lbl">实际</span>
      <b className="pk-now">{now}</b>
    </span>
  );
}

export function CostDiscountBlock({ k, unit, civ, d, bud, count }: { k: 'a' | 'b'; unit: string; civ: string; d: CostDiscount; bud: number; count: number }) {
  const res = ORDER.filter((r) => d.base[r]);
  const baseSum = costSum(d.base),
    sum = costSum(d.cost);
  const baseCount = Math.max(1, Math.floor(bud / Math.max(1, baseSum)));
  const changed = sum !== baseSum;
  return (
    <div className="pk-cost" data-t={`pk-cost-${k}`}>
      <table className="stat pk-cost-tab">
        <tbody>
          {res.map((r) => (
            <tr key={r} data-t={`pk-res-${r}`}>
              <td>{RES_ZH[r] ?? r}</td>
              <td>{d.cost[r] !== d.base[r] ? <WasNow was={d.base[r]!} now={d.cost[r]!} /> : d.base[r]}</td>
            </tr>
          ))}
          <tr data-t="pk-sum">
            <td>单价合计</td>
            <td>{changed ? <WasNow was={baseSum} now={sum} /> : sum}</td>
          </tr>
          <tr className="pk-count" data-t="pk-count">
            <td>派出数量</td>
            <td>{changed && baseCount !== count ? <WasNow was={baseCount} now={count} wasLabel="按原价" /> : <b>{count}</b>}</td>
          </tr>
          <tr data-t="pk-spent">
            <td>实际投入</td>
            <td>
              {count * sum}
              <small className="note"> / {bud}</small>
            </td>
          </tr>
        </tbody>
      </table>
      {d.applied.map((a) => (
        <div key={a.techs.join()} className="pk-line pk-applied" data-t="pk-applied">
          <Icon name="check" className="ic" />
          <span>
            已计入：{civ}
            <small className="pk-orig" data-t="pk-orig">
              {minus(a.text)}
            </small>
          </span>
          <SourcePop civ={civ} unit={unit} d={d} />
        </div>
      ))}
      {d.unsupported.map((a, i) => (
        <div key={a.techs.join()} className="pk-line pk-unverified" data-t="pk-unsupported">
          <Icon name="info" className="ic" />
          <span>
            折扣未计入：{civ} {a.label}
            <small className="note">数据读不出或与加成文本对不上，按原价计算</small>
          </span>
          {!d.applied.length && i === 0 && (
            <>
              <SourcePop civ={civ} unit={unit} d={d} />
            </>
          )}
        </div>
      ))}
      {d.half.map((a, i) => (
        <div key={a.techs.join()} className="pk-line pk-unverified" data-t="pk-half">
          <Icon name="info" className="ic" />
          <span>
            未计入：{civ} {a.label}
            <small className="note">尚未核实，暂不计入</small>
          </span>
          {!d.applied.length && !d.unsupported.length && i === 0 && <SourcePop civ={civ} unit={unit} d={d} />}
        </div>
      ))}
      {!d.applied.length && !d.unsupported.length && !d.half.length && (
        <p className="note pk-none" data-t="pk-none">
          该文明没有可计入的训练费用加成，按原价计算。
        </p>
      )}
    </div>
  );
}

function SourcePop({ civ, unit, d }: { civ: string; unit: string; d: CostDiscount }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const click = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', click);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('mousedown', click);
    };
  }, [open]);
  const res = ORDER.filter((r) => d.base[r] && d.cost[r] !== d.base[r]);
  return (
    <span className="pk-src" ref={ref}>
      <button type="button" className="linkish" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} data-t="pk-src-btn">
        <Icon name="info" className="ic" />
        来源
      </button>
      {open && (
        <div id={id} className="pk-pop" role="dialog" aria-label={`${civ} · ${unit} 的费用`} data-t="pk-pop">
          <h4>
            {civ} · {unit} 的费用
          </h4>
          {d.applied.length > 0 && (
            <section>
              <h5>已计入</h5>
              {d.applied.map((a) => (
                <p key={a.techs.join()}>
                  <Icon name="check" className="ic" /> {minus(a.label)} −{a.pct}%（{AGE[d.age]}）
                  <small className="note">{res.map((r) => `${RES_ZH[r] ?? r} ${d.base[r]} → ${d.cost[r]}`).join(' · ')}</small>
                </p>
              ))}
            </section>
          )}
          {d.unsupported.length > 0 && (
            <section>
              <h5>折扣未计入</h5>
              {d.unsupported.map((a) => (
                <p key={a.techs.join()}>
                  <Icon name="info" className="ic" /> {a.label}
                  <small className="note">按原价，不显示估算值</small>
                </p>
              ))}
            </section>
          )}
          {d.half.length > 0 && (
            <section data-t="pk-pop-half">
              <h5>未计入</h5>
              {d.half.map((a) => (
                <p key={a.techs.join()}>
                  <Icon name="info" className="ic" /> {a.label}
                  <small className="note">尚未核实，暂不计入</small>
                </p>
              ))}
            </section>
          )}
          {d.noCost.length > 0 && (
            <section data-t="pk-nocost">
              <h5>不影响费用</h5>
              {d.noCost.map((a) => (
                <p key={a.techs.join()}>
                  <Icon name="info" className="ic" /> {minus(a.text)}（科技费用或研究时间，仍需研究）
                  <small className="note">不改变数量与攻击数值</small>
                </p>
              ))}
            </section>
          )}
          <Link to="/bonuses" className="pk-pop-link">
            查看文明加成 <Icon name="arrow-right" className="ic" />
          </Link>
        </div>
      )}
    </span>
  );
}
