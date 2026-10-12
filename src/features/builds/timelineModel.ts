/**
 * #3 M3：把 M2 的 BuildTimeline（buildSim 输出）整理成时间线界面要画的行和摘要。
 * 纯函数，不碰 React；所有数字都来自 simulateBuild，不手写示例数。
 */
import { floorSec, formatClock } from '../../domain/formatTime';
import { TC_BUSY_ZH } from '../../domain/buildSim';
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
  /** 短标签，如「卡人口 · 约 0:24」 */
  label: string;
  reasonZh: string;
  step: number;
  /** 资源类卡点：缺的是哪种资源；城镇中心忙：忙什么。用于摘要按同类合计 */
  resource?: Res;
  busy?: Anomaly['busy'];
  /** 只在摘要 top 上有：同类等待在整个开局里的合计秒数（Steve 规则 2） */
  total?: number;
}
export interface TimelineView {
  end: number;
  rows: Record<RowKey, Seg[]>;
  ages: AgeMark[];
  bottlenecks: Bottleneck[];
  /** 摘要第一块：主要卡点（pickSummaryBottleneck：卡人口优先，否则同类合计最长，平局取先出现） */
  top: Bottleneck | null;
  timeout: boolean;
  tOut: number;
  tcIdleTotal: number;
}

export const AGE_ZH = { feudal: '封建', castle: '城堡', imperial: '帝王' } as const;
export const RES_ZH: Record<Res, string> = { food: '食物', wood: '木头', gold: '黄金', stone: '石头' };
/** 原因优先级（摘要与步骤行共用）：卡人口 > 等前置建筑 > 超时 > 城镇中心闲置 > 缺资源（#3 Steve 定） */
const PRIO: Record<Anomaly['type'], number> = { pop_block: 0, prereq_wait: 1, timeout: 2, idle_tc: 3, resource_short: 4, tc_busy: 5 };
const dur = (a: Pick<Anomaly, 'waitSec' | 'from' | 'to'>) => a.waitSec ?? a.to - a.from;

/** 一组异常里选出唯一要显示的原因：先按优先级，同级取等待更久的 */
export function pickReason<T extends Pick<Anomaly, 'type' | 'waitSec' | 'from' | 'to'>>(list: readonly T[]): T | null {
  return [...list].sort((a, b) => PRIO[a.type] - PRIO[b.type] || dur(b) - dur(a))[0] ?? null;
}
/** 步骤行的一段等待：原因 + 这段在时间上的起止（秒） */
export interface RowSeg<T> {
  a: T;
  start: number;
  end: number;
}
/** 步骤行要列出的原因（#51）：互相重叠的原因只留优先级最高的一条（pickReason）；前后接续、不重叠的各成一段，按时间先后。
 *  传入 clip（步骤开始 → 实际开始研究）时，每段裁到这个区间内，各段时长之和就是行时间的跳变。 */
export function rowSegments<T extends Pick<Anomaly, 'type' | 'waitSec' | 'from' | 'to'>>(list: readonly T[], clip?: { from: number; to: number }): RowSeg<T>[] {
  const groups: { from: number; to: number; items: T[] }[] = [];
  for (const a of [...list].sort((x, y) => x.from - y.from || x.to - y.to)) {
    const g = groups[groups.length - 1];
    // 区间有交叠（接缝 ≤ 0.05 秒不算）归入同一组；零长度的（如超时）贴着上一组时也算交叠
    if (g && (a.from < g.to - 0.05 || (a.to - a.from <= 0.05 && a.from <= g.to + 0.05))) {
      g.items.push(a);
      g.to = Math.max(g.to, a.to);
    } else groups.push({ from: a.from, to: a.to, items: [a] });
  }
  const segs = groups.map((g) => ({ a: pickReason(g.items)!, start: g.from, end: g.to }));
  if (!clip) return segs;
  return segs
    .map((x) => ({ ...x, start: Math.max(x.start, clip.from), end: Math.min(x.end, clip.to) }))
    .filter((x, k) => x.end - x.start > 0.05 || (k === 0 && segs.length === 1));
}
/** 一段的文案：「原因 · 约 m:ss」，时长取这一段的长度 */
export const segLabel = (x: RowSeg<Anomaly>, tOut = Infinity) => bottleneckLabel({ ...x.a, waitSec: x.end - x.start }, tOut);
/** 行内最多 3 行；超过时第 3 行写「另有 N 段等待」 */
export const ROW_SEG_MAX = 3;
const VILLAGER = '83';

/** 约 m:ss：统一走 domain/formatTime（向下取整），这里只是别名 */
export const mmss = formatClock;

export function bottleneckLabel(a: Anomaly, tOut = Infinity): string {
  const d = mmss(dur(a));
  if (a.type === 'pop_block' && a.to >= tOut - 1e-6) return `卡人口 · 约 ${mmss(a.from)} 起`;
  if (a.type === 'idle_tc') return `城镇中心闲置 · 约 ${d}`;
  if (a.type === 'pop_block') return `卡人口 · 约 ${d}`;
  if (a.type === 'prereq_wait') return `等前置建筑 · 约 ${d}`;
  if (a.type === 'tc_busy') return `${TC_BUSY_ZH[a.busy ?? 'vil']} · 约 ${d}`;
  if (a.type === 'resource_short') return `${a.resource ? RES_ZH[a.resource] : '资源'}差 ${a.shortfall ?? '?'} · 约 ${d}`;
  return '60 分钟内到不了';
}

const AGE_N_ZH: Record<number, string> = { 1: '黑暗', 2: '封建', 3: '城堡', 4: '帝王' };
/** 等前置建筑的详情灰字：升城堡需先建完 2 座封建建筑（还差：市场） */
export function prereqDetail(a: Pick<Anomaly, 'age' | 'need' | 'missing'>): string {
  const age = a.age ?? 3;
  const miss = a.missing?.length ? `（还差：${a.missing.join('、')}）` : '';
  return `升${AGE_N_ZH[age]}需先建完 ${a.need ?? 2} 座${AGE_N_ZH[age - 1]}建筑${miss}`;
}
/** 步骤行显示的时间：研究类步骤用实际开始研究的时刻，其他用步骤开始时刻 */
export const rowTime = (s: { startAt: number; researchAt?: number }) => s.researchAt ?? s.startAt;

const KIND_ZH: Record<Anomaly['type'], string> = {
  tc_busy: '城镇中心忙',
  idle_tc: '城镇中心闲置',
  pop_block: '卡人口',
  prereq_wait: '等前置建筑',
  resource_short: '缺资源',
  timeout: '超时',
};
/** 摘要主要卡点的「同类」：类型 + 资源（缺资源）/ 忙的内容（城镇中心忙） */
const sameKind = (b: Pick<Bottleneck, 'type' | 'resource' | 'busy'>) => `${b.type}|${b.resource ?? ''}|${b.busy ?? ''}`;

/** 摘要主要卡点（Steve 定）：
 *  1. 有卡人口时卡人口永远优先，取最早那次，显示开始时间；
 *  2. 否则按同类（类型 + 资源）把整个开局里的等待时长加起来，取合计最长的一类，显示合计时长；
 *  3. 合计相同取最先出现的一类。
 *  返回该类最早那一条（用于跳步和高亮），total 为该类合计秒数。超时（零长度）仍沿用原规则：没有卡人口时显示超时。 */
export function pickSummaryBottleneck(list: readonly Bottleneck[]): Bottleneck | null {
  const byTime = [...list].sort((a, b) => a.from - b.from || PRIO[a.type] - PRIO[b.type]);
  const pop = byTime.find((b) => b.type === 'pop_block');
  if (pop) return { ...pop, total: pop.sec };
  const timeout = byTime.find((b) => b.type === 'timeout');
  if (timeout) return { ...timeout, total: 0 };
  const groups = new Map<string, { first: Bottleneck; total: number }>();
  for (const b of byTime) {
    const g = groups.get(sameKind(b));
    if (g) g.total += b.sec;
    else groups.set(sameKind(b), { first: b, total: b.sec });
  }
  let best: { first: Bottleneck; total: number } | null = null;
  // Map 按首次出现顺序遍历；只有严格更长才替换，平局保留先出现的
  for (const g of groups.values()) if (!best || floorSec(g.total) > floorSec(best.total)) best = g;
  return best ? { ...best.first, total: best.total } : null;
}

/**
 * 摘要第 2 格拆成两段（#78 第 7 项）：reason「卡在木头」+ time「约 6:02」/「约 0:45 起」；
 * 没有时间的文案（没有卡点、超时）time 为 null。分享卡预览只在两段之间断行。
 */
export function summaryParts(b: Bottleneck | null, targetZh: string): { reason: string; time: string | null } {
  if (!b) return { reason: '没有卡点', time: null };
  if (b.type === 'timeout') return { reason: `60 分钟内到不了${targetZh}`, time: null };
  if (b.type === 'pop_block') return { reason: '卡人口', time: `约 ${formatClock(b.from)} 起` };
  const kind =
    b.type === 'resource_short' ? (b.resource ? `卡在${RES_ZH[b.resource]}` : '缺资源') : b.type === 'tc_busy' ? TC_BUSY_ZH[b.busy ?? 'vil'] : KIND_ZH[b.type];
  return { reason: kind, time: `约 ${formatClock(b.total ?? b.sec)}` };
}

/** 摘要第 2 格：主文案「卡人口 约 0:45 起」/「卡在木头 约 6:02」+ 小字「第 12 步」；超时按目标时代写 */
export function summaryText(b: Bottleneck | null, targetZh: string): { main: string; sub: string } {
  const { reason, time } = summaryParts(b, targetZh);
  return { main: time ? `${reason} ${time}` : reason, sub: b ? `第 ${b.step + 1} 步` : '' };
}
/** 误差带两端相同只显示一个时间 */
export const rangeText = (t: number, e: { early: number; late: number }) =>
  floorSec(t - e.early) === floorSec(t + e.late) ? null : `${mmss(t - e.early)}–${mmss(t + e.late)}`;

/** 摘要卡误差带文案：「误差 m:ss–m:ss」；两端相同时返回 null（不渲染整行，Steve 定）。分享卡复用同一函数。 */
export const rangeLabel = (t: number, e: { early: number; late: number }) => {
  const r = rangeText(t, e);
  return r ? `误差 ${r}` : null;
};

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
        sec: a.waitSec ?? a.to - a.from,
        label: bottleneckLabel(a, tOut),
        reasonZh: a.reasonZh,
        step: s.index,
        ...(a.resource ? { resource: a.resource } : {}),
        ...(a.busy ? { busy: a.busy } : {}),
      });
    }
  bottlenecks.sort((a, b) => a.from - b.from || PRIO[a.type] - PRIO[b.type]);
  const top = pickSummaryBottleneck(bottlenecks);

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
  // URL 里的 step 从 1 开始（与界面步号一致），内部下标从 0 开始；0、越界、非数字视为无
  const n = st !== null && /^\d+$/.test(st) && Number(st) >= 1 ? Number(st) - 1 : null;
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

/** #3 390 宽 2×2 摘要：主要卡点文案超过这么多字时占满一整行（Jony 44c7bed，边界 >14） */
export const BN_LONG_CHARS = 14;
export const isLongBottleneck = (text: string) => [...text].length > BN_LONG_CHARS;

/** #42：步骤说明拆段，不需要房子的文明（匈奴）把造房片段标成 skip（界面置灰 + 删除线 +「匈奴不需要」）。noHouses=false 时原样一段。 */
export type NotePart = { text: string; skip?: true };
export function noteParts(note: string, houseText: readonly string[] | undefined, noHouses: boolean): NotePart[] {
  if (!noHouses || !houseText?.length) return note ? [{ text: note }] : [];
  const out: NotePart[] = [];
  let rest = note;
  const frags = [...houseText].sort((a, b) => note.indexOf(a) - note.indexOf(b));
  for (const f of frags) {
    const k = rest.indexOf(f);
    if (k < 0) continue;
    if (k > 0) out.push({ text: rest.slice(0, k) });
    out.push({ text: f, skip: true });
    rest = rest.slice(k + f.length);
  }
  if (rest) out.push({ text: rest });
  return out;
}

/** #42 摘要对比行（Jony 稿 huns-flag-*）：「比通用：到达封建 早 0:21 · 木头按净值省 0（起始少 100 木）」 */
export function noHouseCompareText(c: { earlierSec: number; startWoodDelta: number; woodNet: number }, ageZh: string): string {
  const t = c.earlierSec >= 0 ? `早 ${mmss(c.earlierSec)}` : `晚 ${mmss(-c.earlierSec)}`;
  const w = c.woodNet >= 0 ? `省 ${Math.round(c.woodNet)}` : `多花 ${Math.round(-c.woodNet)}`;
  const start = c.startWoodDelta < 0 ? `起始少 ${-c.startWoodDelta} 木` : c.startWoodDelta > 0 ? `起始多 ${c.startWoodDelta} 木` : '起始木头相同';
  return `比通用：到达${ageZh} ${t} · 木头按净值${w}（${start}）`;
}
