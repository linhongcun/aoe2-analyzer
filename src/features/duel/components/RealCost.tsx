/** #88 等采集时间：每侧把（折后）价格换算成村民采集时间。只展示，数值来自 domain/realCost */
import { useEffect, useId, useRef, useState } from 'react';
import type { CostDiscount } from '../../../domain/costDiscount';
import { countForTime, fmtClock, gatherModel, realCost, type GatherRes } from '../../../domain/realCost';
import { AGE_ZH, RES_ZH } from '../../../domain/ratings';
import { Icon } from '../../../shared/ui/Icon';
import { minus } from './CostDiscount';

const ORDER: GatherRes[] = ['Food', 'Wood', 'Gold', 'Stone'];

/** 未计入行括号里的原因。没有覆盖的文明仍写「数据读不准，按通用速度算」（v0.9.0 F 收尾只改这三家）。 */
const UNCOUNTED_REASON: Record<string, string> = {
  Bohemians: '需研究科技，未建模',
  Armenians: '需研究科技，未建模',
  Mayans: '资源多持续 15%，不是采集变快，暂不计入',
};

export function uncountedText(civ: string, civZh: string, label: string): string {
  const reason = UNCOUNTED_REASON[civ] ?? '数据读不准，按通用速度算';
  return `未计入：${civZh} ${label}（${reason}）`;
}

const NoSeed = () => (
  <small className="rc-ns" data-t="rc-noseed">
    不含播种
  </small>
);

export function realCostOf(d: CostDiscount, age: number, civ: string) {
  const g = gatherModel(age, civ);
  return { g, rc: realCost(d.cost, g) };
}

export function RealCostBlock({
  k,
  civ,
  civZh,
  age,
  d,
  vils,
  min,
}: {
  k: 'a' | 'b';
  civ: string;
  civZh: string;
  age: number;
  d: CostDiscount;
  vils: number;
  min: number;
}) {
  const { g, rc } = realCostOf(d, age, civ);
  const count = countForTime(rc.total, vils, min);
  const res = ORDER.filter((r) => d.base[r]);
  return (
    <div className="pk-cost rc" data-t={`rc-${k}`}>
      <table className="stat pk-cost-tab">
        <tbody>
          {res.map((r) => (
            <tr key={r} data-t={`rc-res-${r}`}>
              <td>
                {RES_ZH[r] ?? r}
                {d.cost[r] === d.base[r] && ` ${d.base[r]}`}
                {r === 'Food' && <small className="rc-res">按农田计</small>}
              </td>
              <td>
                {d.cost[r] !== d.base[r] && (
                  <span className="pk-wn">
                    <span className="pk-lbl">原价</span>
                    <s className="pk-was">{d.base[r]}</s>
                    <span className="pk-lbl">实际</span>
                    <b className="pk-now">{d.cost[r]}</b>
                    <span className="pk-lbl">用时</span>
                  </span>
                )}
                <b className="rc-t tl-num" data-t="rc-time">
                  {fmtClock(rc.per[r] ?? 0)}
                </b>
                {r === 'Food' && <NoSeed />}
              </td>
            </tr>
          ))}
          <tr data-t="rc-sum">
            <td>
              单个用时<small className="rc-res">1 个村民</small>
            </td>
            <td>
              <b className="rc-t tl-num" data-t="rc-total">
                {fmtClock(rc.total)}
              </b>
              {rc.hasFood && <NoSeed />}
            </td>
          </tr>
          <tr className="pk-count" data-t="rc-count">
            <td>派出数量</td>
            <td>
              <b className="rc-big tl-num">{count}</b>
            </td>
          </tr>
        </tbody>
      </table>
      {d.applied.map((a) => (
        <div key={'d' + a.techs.join()} className="pk-line pk-applied" data-t="rc-disc">
          <Icon name="check" className="ic" />
          <span>
            已计入：{civZh} {minus(a.label)} · 时间按实际价换算
          </span>
        </div>
      ))}
      {g.applied.map((a) => (
        <div key={'g' + a.label} className="pk-line pk-applied" data-t="rc-applied">
          <Icon name="check" className="ic" />
          <span>
            已计入：{civZh} {a.label}（来源：aoe2techtree 文明描述：{a.source}）
          </span>
        </div>
      ))}
      {g.unsupported.map((a) => (
        <div key={'u' + a.label} className="pk-line pk-unverified rc-unsupported" data-t="rc-unsupported">
          <Icon name="info" className="ic" />
          <span title={uncountedText(civ, civZh, a.label)}>{uncountedText(civ, civZh, a.label)}</span>
        </div>
      ))}
      <Basis age={age} food={rc.hasFood} />
    </div>
  );
}

/** 口径行 + 浮层（与 #97「来源」浮层同一套 pk-pop 样式） */
export function Basis({ age, food, compact }: { age: number; food: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
  const a = AGE_ZH[age] ?? '';
  return (
    <div className={compact ? 'rc-basis rc-basis-c' : 'rc-basis'} ref={ref} data-t="rc-basis">
      {!compact && <Icon name="clock" className="ic" />}
      {!compact && <span>{`${a} · 经济科技全研究${food ? ' · 按农田计' : ''}`}</span>}
      <button type="button" className="linkish" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} data-t="rc-basis-btn">
        <Icon name="info" className="ic" />
        口径
      </button>
      {open && (
        <div id={id} className="pk-pop" role="dialog" aria-label="采集时间怎么算" data-t="rc-pop">
          <h4>采集时间怎么算</h4>
          <ol>
            <li>采集速度按{a}，该时代能研究的经济科技全部算上；选了文明就叠加文明加成。</li>
            <li>食物按农田算，播种耗时未核实，不计入。</li>
            <li>金和木离放置点 3 格，农田贴着磨坊；每趟 = 携带量 ÷ 采集速度 + 往返路程 ÷ 村民速度。</li>
            <li>有文明折扣先按折扣价，再换算成时间。</li>
          </ol>
          <small className="note">不模拟地图和资源分布，和实战会有出入。数据：游戏 .dat（DE Update 185872）</small>
        </div>
      )}
    </div>
  );
}
