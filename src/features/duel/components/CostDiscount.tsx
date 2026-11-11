/** #24 常驻文明训练折扣的已计入 / 未计入句式。单价在卡头，派出数量在预算区。 */
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CostDiscount } from '../../../domain/costDiscount';
import { RES_ZH } from '../../../domain/ratings';
import { Icon } from '../../../shared/ui/Icon';
import { minus } from '../../../shared/utils/minus';

import { AGE_ZH as AGE } from '../../../domain/ratings';
const ORDER = ['Food', 'Wood', 'Gold', 'Stone'];

export function CostDiscountBlock({ unit, civ, d }: { unit: string; civ: string; d: CostDiscount }) {
  if (!d.applied.length && !d.unsupported.length && !d.half.length) return null;
  return (
    <div className="pk-civ">
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
          <h3 className="pk-pop-title">
            {civ} · {unit} 的费用
          </h3>
          {d.applied.length > 0 && (
            <section>
              <h4 className="pk-pop-subtitle">已计入</h4>
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
              <h4 className="pk-pop-subtitle">折扣未计入</h4>
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
              <h4 className="pk-pop-subtitle">未计入</h4>
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
              <h4 className="pk-pop-subtitle">不影响费用</h4>
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
