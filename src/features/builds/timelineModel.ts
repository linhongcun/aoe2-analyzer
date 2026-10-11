/**
 * #3 M3：把 M2 的 BuildTimeline（buildSim 输出）整理成时间线界面要画的行和摘要。
 * 纯函数，不碰 React；所有数字都来自 simulateBuild，不手写示例数。
 */
import type { Anomaly, BuildTimeline, ErrBand, Res } from '../../domain/buildSim';

export type RowKey = 'tc' | 'food' | 'wood' | 'gold' | 'military';
export interface Seg {
  from: number;
  to: number;
  label: string;
  kind: 'villager' | 'ageup' | Res | 'military';
  step?: number;
}
export interface AgeMark {
  age: 'feudal' | 'castle' | 'imperial';
  nameZh: string;
  clickAt: number;
  reachAt: number;
  errSec: ErrBand;
  vils: number;
  pop: { used: number; cap: number };
}
export interface Bottleneck {
  type: Anomaly['type'];
  from: number;
  to: number;
  sec: number;
  /** 短标签，如「卡人口 · 约 24 秒」 */
  label: string;
  reasonZh: string;
  step: number;
}
export interface TimelineView {
  end: number;
  rows: Record<RowKey, Seg[]>;
  ages: AgeMark[];
  bottlenecks: Bottleneck[];
  /** 摘要第一块：最该先看的卡点（优先级最高，同级取最久） */
  top: Bottleneck | null;
  timeout: boolean;
  tOut: number;
  tcIdleTotal: number;
}

export const AGE_ZH = { feudal: '封建', castle: '城堡', imperial: '帝王' } as const;
export const RES_ZH: Record<Res, string> = { food: '食物', wood: '木头', gold: '黄金', stone: '石头' };
/** 原因优先级（摘要与步骤行共用）：卡人口 > 超时 > 其他 */
const PRIO: Record<Anomaly['type'], number> = { pop_block: 0, timeout: 1, idle_tc: 2, resource_short: 3 };
const dur = (a: Pick<Anomaly, 'waitSec' | 'from' | 'to'>) => a.waitSec ?? a.to - a.from;

/** 一组异常里选出唯一要显示的原因：先按优先级，同级取等待更久的 */
export function pickReason<T extends Pick<Anomaly, 'type' | 'waitSec' | 'from' | 'to'>>(list: readonly T[]): T | null {
  return [...list].sort((a, b) => PRIO[a.type] - PRIO[b.type] || dur(b) - dur(a))[0] ?? null;
}
const VILLAGER = '83';

/** 约 m:ss */
export const mmss = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export function bottleneckLabel(a: Anomaly, tOut = Infinity): string {
  const d = mmss(dur(a));
  if (a.type === 'pop_block' && a.to >= tOut - 1e-6) return `卡人口 · 约 ${mmss(a.from)} 起`;
  if (a.type === 'idle_tc') return `城镇中心闲置 · 约 ${d}`;
  if (a.type === 'pop_block') return `卡人口 · 约 ${d}`;
  if (a.type === 'resource_short') return `${a.resource ? RES_ZH[a.resource] : '资源'}差 ${a.shortfall ?? '?'} · 约 ${d}`;
  return '60 分钟内到不了';
}

const KIND_ZH: Record<Anomaly['type'], string> = { idle_tc: '城镇中心闲置', pop_block: '卡人口', resource_short: '缺资源', timeout: '超时' };
/** 摘要第 2 格：主文案「卡人口 约 0:45」+ 小字「第 12 步」；超时按目标时代写 */
export function summaryText(b: Bottleneck | null, targetZh: string, tOut = Infinity): { main: string; sub: string } {
  if (!b) return { main: '没有卡点', sub: '' };
  const sub = `第 ${b.step + 1} 步`;
  if (b.type === 'timeout') return { main: `60 分钟内到不了${targetZh}`, sub };
  const kind = b.type === 'resource_short' ? b.label.split(' · ')[0]! : KIND_ZH[b.type];
  if (b.type === 'pop_block' && b.to >= tOut - 1e-6) return { main: `${kind} 约 ${mmss(b.from)} 起`, sub };
  return { main: `${kind} 约 ${mmss(b.sec)}`, sub };
}
/** 误差带两端相同只显示一个时间 */
export const rangeText = (t: number, e: { early: number; late: number }) =>
  Math.round(t - e.early) === Math.round(t + e.late) ? null : `${mmss(t - e.early)}–${mmss(t + e.late)}`;

export function buildView(tl: BuildTimeline, unitName: (id: string) => string): TimelineView {
  const steps = [...tl.steps].sort((a, b) => a.startAt - b.startAt || a.index - b.index);
  // 超时步骤的 doneAt 是 60 分钟上限，不参与定轴长，否则整条轴被压扁
  const tOut = tl.anomalies.find((a) => a.type === 'timeout')?.from ?? Infinity;
  const finite = tl.steps.filter((s) => s.doneAt < tOut - 1e-6);
  const end = Math.max(60, ...finite.map((s) => s.doneAt), ...tl.ageUps.map((a) => a.reachAt + a.errSec.late)) + 30;

  // 资源行：每段 = 两个步骤之间该资源上的村民数，相同数相邻合并
  const resRow = (r: 'food' | 'wood' | 'gold'): Seg[] => {
    const out: Seg[] = [];
    steps.forEach((s, i) => {
      const n = s.villagers[r];
      const to = steps[i + 1]?.startAt ?? end;
      if (!n || to <= s.startAt) return;
      const last = out[out.length - 1];
      if (last && last.label === String(n) && Math.abs(last.to - s.startAt) < 1e-6) last.to = to;
      else out.push({ from: s.startAt, to, label: String(n), kind: r, step: s.index });
    });
    return out;
  };

  // 城镇中心行：造村民段 + 升时代段（琥珀），TC 闲置由卡点层叠加
  const tc: Seg[] = [];
  let cur = 0;
  const vilsAt = (t: number) => steps.filter((s) => s.startAt <= t + 1e-6).reduce((m, s) => Math.max(m, s.vils), steps[0]?.vils ?? 0);
  for (const a of tl.ageUps) {
    if (a.clickAt > cur)
      tc.push({ from: cur, to: a.clickAt, label: `村民 ×${vilsAt(a.clickAt) - vilsAt(cur)} · 约 ${mmss(cur)}–${mmss(a.clickAt)}`, kind: 'villager' });
    tc.push({ from: a.clickAt, to: a.reachAt, label: `升${AGE_ZH[a.age]}`, kind: 'ageup' });
    cur = a.reachAt;
  }
  const lastDone = Math.min(end, Math.max(...tl.steps.map((s) => s.doneAt)));
  if (lastDone > cur + 1) {
    const n = vilsAt(lastDone) - vilsAt(cur);
    tc.push({ from: cur, to: lastDone, label: n > 0 ? `村民 ×${n} · 约 ${mmss(cur)}–${mmss(lastDone)}` : '', kind: 'villager' });
  }

  const military: Seg[] = tl.steps
    .filter((s) => s.action === 'train' && s.entity?.kind === 'unit' && s.entity.id !== VILLAGER)
    .map((s) => ({
      from: s.startAt,
      to: Math.min(end, Math.max(s.doneAt, s.startAt + 1)),
      label: unitName(s.entity!.id),
      kind: 'military' as const,
      step: s.index,
    }));

  const ages: AgeMark[] = tl.ageUps.map((a) => {
    const at = steps.filter((s) => s.startAt <= a.reachAt + 1e-6).pop() ?? steps[0]!;
    return { age: a.age, nameZh: AGE_ZH[a.age], clickAt: a.clickAt, reachAt: a.reachAt, errSec: a.errSec, vils: vilsAt(a.reachAt), pop: at.pop };
  });

  const seen = new Set<string>();
  const bottlenecks: Bottleneck[] = [];
  for (const s of tl.steps)
    for (const a of s.anomalies) {
      const k = `${a.type}|${a.from}|${a.to}|${a.resource ?? ''}`;
      if (seen.has(k)) continue;
      seen.add(k);
      bottlenecks.push({
        type: a.type,
        from: a.from,
        to: a.to,
        sec: Math.round(a.waitSec ?? a.to - a.from),
        label: bottleneckLabel(a, tOut),
        reasonZh: a.reasonZh,
        step: s.index,
      });
    }
  bottlenecks.sort((a, b) => a.from - b.from || PRIO[a.type] - PRIO[b.type]);
  let top = pickReason(bottlenecks);
  // 超时前已经卡人口：卡人口才是原因，摘要显示它和它所在的步骤，不显示超时（Steve #39）
  if (top?.type === 'timeout') top = bottlenecks.find((b) => b.type === 'pop_block' && b.from < top!.from) ?? top;

  return {
    end,
    rows: { tc, food: resRow('food'), wood: resRow('wood'), gold: resRow('gold'), military },
    ages,
    bottlenecks,
    top,
    timeout: top?.type === 'timeout',
    tOut,
    tcIdleTotal: tl.tcIdleTotal,
  };
}

/** URL 参数解析：非法值回退默认，不报错（交互稿 §3） */
export interface TimelineQuery {
  bo: string | null;
  civ: string;
  dist: number;
  house: boolean;
  step: number | null;
  /** 激进/保守：M2 还没有变体数据，先原样透传，不丢参数 */
  variant: 'aggr' | 'cons' | null;
}
export function parseQuery(sp: URLSearchParams, boIds: string[], civIds: string[], stepCount: (bo: string) => number = () => Infinity): TimelineQuery {
  const bo = sp.get('bo');
  const civ = sp.get('civ');
  const d = Number(sp.get('dist'));
  const st = sp.get('step');
  const okBo = bo && boIds.includes(bo) ? bo : null;
  const n = st !== null && /^\d+$/.test(st) ? Number(st) : null;
  const v = sp.get('var');
  return {
    bo: okBo,
    // 默认通用（不计文明加成）：缺省、非法或 civ=Generic → ''（产品决定 #39）
    civ: civ && civIds.includes(civ) ? civ : '',
    dist: Number.isInteger(d) && d >= 1 && d <= 10 ? d : 4,
    house: sp.get('house') !== '0',
    step: n !== null && okBo && n < stepCount(okBo) ? n : null,
    variant: v === 'aggr' || v === 'cons' ? v : null,
  };
}
