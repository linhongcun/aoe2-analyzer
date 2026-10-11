import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Info, TriangleAlert as Warn, Landmark, Link2, Settings2, TriangleAlert, X } from 'lucide-react';
import eco from '../../data/eco.json';
import units from '../../data/units.json';
import { buildOrders } from '../../data/buildOrders';
import { civByEn, civs } from '../../data';
import { simSupport } from '../../domain/simSupport';
import { simulateBuild, WALK, type EcoData, type UpgradeData } from '../../domain/buildSim';
import { CivPicker } from '../../shared/ui/CivPicker';
import { Breadcrumbs } from '../../shared/ui/layout';
import { PENDING_LABEL, agePending, pendingFrom } from './pendingFix';
import {
  RES_ZH,
  bottleneckLabel,
  buildView,
  pickReason,
  prereqDetail,
  rowTime,
  mmss,
  parseQuery,
  rangeText,
  summaryText,
  isLongBottleneck,
  type RowKey,
  type Seg,
} from './timelineModel';

const UPS = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const UNIT_ZH = Object.fromEntries((units as { id: number; zh: string }[]).map((u) => [String(u.id), u.zh]));
const AGE_ZH = ['', '黑暗', '封建', '城堡', '帝王'];
const ROWS: { key: RowKey; zh: string }[] = [
  { key: 'tc', zh: '城镇中心' },
  { key: 'food', zh: '食物' },
  { key: 'wood', zh: '木头' },
  { key: 'gold', zh: '金子' },
  { key: 'military', zh: '军事' },
];
const PRESETS = [
  ['近', WALK.presets.near],
  ['中', WALK.presets.mid],
  ['远', WALK.presets.far],
] as const;

/** #/builds?bo=…：开局时间线（#3 v1.0 交互稿 + v1.1 增补 + #39 手机首屏/设置抽屉） */
export default function BuildTimelineView() {
  const [sp, setSp] = useSearchParams();
  const q = parseQuery(
    sp,
    buildOrders.map((b) => b.id),
    civs.map((c) => c.en),
    (id) => buildOrders.find((b) => b.id === id)?.steps.length ?? 0,
  );
  const bo = buildOrders.find((b) => b.id === q.bo)!;
  const patch = (kv: Record<string, string | null>) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p);
        for (const [k, v] of Object.entries(kv)) {
          if (v === null) n.delete(k);
          else n.set(k, v);
        }
        return n;
      },
      { replace: true },
    );
  const set = (k: string, v: string | null) => patch({ [k]: v });

  // #42：链接里的文明加成还没计入 → 保留 URL 里的 civ，按通用计算并提示
  const unsupported = !!q.civ && !simSupport(q.civ);
  const simCiv = q.civ && !unsupported ? q.civ : 'Generic';
  const [warnOff, setWarnOff] = useState(() => sessionStorage.getItem('tl-civwarn-off') === '1');
  const tl = useMemo(
    () => simulateBuild(bo, simCiv, eco as unknown as EcoData, UPS, { walkTiles: q.dist, autoHouses: q.house }),
    [bo, simCiv, q.dist, q.house],
  );
  const v = useMemo(() => buildView(tl, (id) => UNIT_ZH[id] ?? id), [tl]);
  const [showAssume, setShowAssume] = useState(false);
  const [copied, setCopied] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const setBtn = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  const minutes = Math.ceil(v.end / 60);
  const span = minutes * 60;
  const pct = (t: number) => `${(Math.min(span, Math.max(0, t)) / span) * 100}%`;
  const w = (a: number, b: number) => `${(Math.max(0, Math.min(span, b) - Math.max(0, a)) / span) * 100}%`;
  const every = minutes > 30 ? 5 : minutes > 15 ? 2 : 1;
  const ticks = Array.from({ length: minutes + 1 }, (_, i) => i).filter((m) => m % every === 0);
  const target = v.ages.find((a) => a.age === (['', '', 'feudal', 'castle', 'imperial'] as const)[bo.target.age]) ?? v.ages[v.ages.length - 1];
  const targetZh = AGE_ZH[bo.target.age]!;
  const civLabel = simCiv !== 'Generic' ? `按${civByEn(simCiv)?.zh ?? simCiv}计` : '按通用计';
  const ranged = v.bottlenecks.filter((b) => b.to > b.from);
  const tagged = v.top && v.top.to > v.top.from ? v.top : [...ranged].sort((a, b) => b.sec - a.sec)[0];
  const bad = new Set(tl.steps.filter((s) => s.anomalies.length).map((s) => s.index));
  const sel = q.step !== null ? tl.steps[q.step] : undefined;
  const sumT = summaryText(v.top, targetZh, v.tOut);
  const changed = (q.civ ? 1 : 0) + (q.dist !== WALK.default ? 1 : 0) + (q.house ? 0 : 1);
  const source = bo.sources[0]?.title;

  // 不相邻的浅色卡点合并，只有 top 用实色，避免红带铺满（Jony 建议）
  const merged = useMemo(() => {
    const out: { from: number; to: number; types: Set<string> }[] = [];
    for (const b of [...ranged].filter((x) => x !== tagged).sort((a, b) => a.from - b.from)) {
      const last = out[out.length - 1];
      if (last && b.from <= last.to + 1) {
        last.to = Math.max(last.to, b.to);
        last.types.add(b.type);
      } else out.push({ from: b.from, to: b.to, types: new Set([b.type]) });
    }
    return out;
  }, [ranged, tagged]);

  const jump = (step: number) => {
    set('step', String(step + 1));
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-step="${step}"] .tl-step`);
      el?.scrollIntoView({ block: 'center' });
      el?.focus({ preventScroll: true });
    });
  };

  const close = () => {
    setDrawer(false);
    setBtn.current?.focus();
  };
  useEffect(() => {
    if (!drawer) return;
    sheet.current?.querySelector<HTMLElement>('button, input')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  // 手机胶囊行：把当前开局滚到可见
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('.tl-chips [aria-checked="true"]');
    const row = el?.parentElement;
    if (el && row) row.scrollLeft = el.offsetLeft - row.offsetLeft - 8;
  }, [bo.id]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 剪贴板不可用时静默：地址栏仍是可分享链接 */
    }
  };
  const share = (
    <button type="button" className="tl-share" onClick={copy} aria-label="复制链接">
      {copied ? <Check size={16} aria-hidden /> : <Link2 size={16} aria-hidden />}
      {copied ? '已复制' : '复制链接'}
    </button>
  );
  const dot = (on: boolean) => on && <span className="tl-dot" aria-label="非默认" />;

  const settings = (
    <>
      <span className="tl-ctl">
        文明{' '}
        <CivPicker
          id="tlciv"
          label="文明"
          none="通用"
          isEnabled={simSupport}
          disabledGroup="暂不支持 · 文明加成尚未计入"
          disabledNote="文明加成尚未计入"
          value={unsupported ? '' : q.civ}
          onChange={(en) => set('civ', en || null)}
        />
        {dot(q.civ !== '')}
      </span>
      <div className="tl-seg" role="radiogroup" aria-label="走路距离预设">
        {PRESETS.map(([zh, d]) => (
          <button key={d} type="button" role="radio" aria-checked={q.dist === d} aria-label={zh} onClick={() => set('dist', String(d))}>
            {zh} {d}
          </button>
        ))}
      </div>
      <label className="tl-ctl">
        走路距离
        <input
          type="range"
          min={WALK.min}
          max={WALK.max}
          value={q.dist}
          aria-label="走路距离"
          aria-valuemin={WALK.min}
          aria-valuemax={WALK.max}
          aria-valuenow={q.dist}
          onChange={(e) => set('dist', e.target.value)}
        />
        <span className="tl-num">{q.dist} 格</span>
        {dot(q.dist !== WALK.default)}
      </label>
      <button type="button" role="switch" aria-checked={q.house} className="tl-switch" onClick={() => set('house', q.house ? '0' : '1')}>
        自动造房 <span className="tl-knob" aria-hidden />
        {dot(!q.house)}
      </button>
      <span className="note">羊和浆果按近距离计{!q.house && ' · 关掉可以看到不造房会卡在哪'}</span>
    </>
  );

  return (
    <section className="pane tl" id="builds" data-t="timeline">
      <div className="tl-desk-only">
        <Breadcrumbs current={bo.name.zh} />
        <h2 className="tl-title">{bo.name.zh}</h2>
        <p className="note">
          {bo.summary}
          {source && ` · 来源 ${source}`}
        </p>
      </div>

      {/* 开局：电脑为下拉，手机为横滑胶囊 + 「设置」 */}
      <div className="tl-params" role="group" aria-label="参数">
        <label className="tl-ctl tl-desk-only">
          开局
          <select value={bo.id} onChange={(e) => set('bo', e.target.value)} aria-label="开局">
            {buildOrders.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name.zh}
              </option>
            ))}
          </select>
        </label>
        <div className="tl-chips tl-mob-only" role="radiogroup" aria-label="开局胶囊">
          {buildOrders.map((b) => (
            <button key={b.id} type="button" role="radio" aria-checked={b.id === bo.id} className="tl-chip" onClick={() => set('bo', b.id)}>
              {b.name.zh}
            </button>
          ))}
        </div>
        <button
          ref={setBtn}
          type="button"
          className="tl-setbtn tl-mob-only"
          onClick={() => setDrawer(true)}
          aria-haspopup="dialog"
          aria-label={`设置${changed ? `（${changed} 项已改）` : ''}`}
        >
          <Settings2 size={16} aria-hidden /> 设置
          {changed > 0 && (
            <span className="tl-badge" data-t="settings-badge">
              {changed}
            </span>
          )}
        </button>
        <div className="tl-desk-only tl-inline-settings">{settings}</div>
      </div>

      {unsupported && !warnOff && (
        <div className="tl-civwarn" role="status" data-t="civ-warn">
          <Warn size={16} aria-hidden />
          <span>链接里的{civByEn(q.civ)?.zh ?? q.civ}加成尚未计入，已按通用计算。</span>
          <button
            type="button"
            aria-label="关闭提示"
            onClick={() => {
              sessionStorage.setItem('tl-civwarn-off', '1');
              setWarnOff(true);
            }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      )}
      <div className="tl-summary-card">
        <ul className="tl-summary" role="region" aria-label="摘要">
          <li className="tl-arrive" data-t="sum-arrive">
            <span className="k">到达{target?.nameZh ?? targetZh}</span>
            <b className="tl-num" data-time>
              {target ? `约 ${mmss(target.reachAt)}` : '—'}
            </b>
            <span className="tl-civ" data-t="sum-civ">
              {civLabel}
            </span>
            {target && rangeText(target.reachAt, target.errSec) && (
              <span className="s tl-num tl-desk-only" data-t="sum-range">
                {rangeText(target.reachAt, target.errSec)}
              </span>
            )}
          </li>
          <li className={`tl-bn${topP ? ' is-pending' : v.top ? ' is-bad' : ''}${!topP && isLongBottleneck(sumT.main) ? ' is-long' : ''}`} data-t="sum-bottleneck">
            {topP ? (
              <>
                <span className="k">主要卡点</span>
                <b data-pending>
                  — <small className="pending-note">{PENDING_LABEL}</small>
                </b>
              </>
            ) : v.top ? (
              <button type="button" className="tl-jump" onClick={() => jump(v.top!.step)} aria-label={`主要卡点 ${sumT.main}，${sumT.sub}，跳到该步`}>
                <span className="k">主要卡点</span>
                <b>{sumT.main}</b>
                <span className="s">{sumT.sub}</span>
              </button>
            ) : (
              <>
                <span className="k">主要卡点</span>
                <b>没有卡点</b>
              </>
            )}
          </li>
          <li>
            <span className="k">城镇中心闲置</span>
            <b className="tl-num" data-time>
              约 {mmss(v.tcIdleTotal)}
            </b>
          </li>
          <li>
            <span className="k">村民</span>
            <b className="tl-num">{target?.vils ?? '—'}</b>
          </li>
        </ul>
        <div className="tl-share-slot">{share}</div>
      </div>

      <div className="tl-card">
        <div className="tl-chart" role="list" aria-label="时间线">
          <div className="tl-axis" aria-hidden>
            {ticks.map((m) => (
              <span key={m} className={(m / every) % 2 ? 'odd' : ''} style={{ left: pct(m * 60) }}>
                {m}:00
              </span>
            ))}
          </div>
          {ROWS.map((r) => (
            <div className="tl-row" key={r.key} data-row={r.key}>
              <span className="tl-lab">{r.zh}</span>
              <div className="tl-track">
                {v.rows[r.key].map((s: Seg, i) => (
                  <span
                    key={i}
                    role="listitem"
                    className={`tl-bar k-${s.kind}${s.step !== undefined && s.step === q.step ? ' is-sel' : ''}`}
                    style={{ left: pct(s.from), width: w(s.from, s.to) }}
                    title={`${s.label} · 约 ${mmss(s.from)}–${mmss(s.to)}`}
                    aria-label={`${r.zh} ${s.label} 约 ${mmss(s.from)} 到 ${mmss(s.to)}`}
                  >
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <div className="tl-row" data-row="age">
            <span className="tl-lab">到达时代</span>
            <div className="tl-track">
              {v.ages.map((a) => (
                <span key={a.age}>
                  <span
                    className="tl-band"
                    data-errband
                    data-early={a.errSec.early}
                    data-late={a.errSec.late}
                    style={{ left: pct(a.reachAt - a.errSec.early), width: w(a.reachAt - a.errSec.early, a.reachAt + a.errSec.late) }}
                  />
                  <span
                    className="tl-age"
                    style={{ left: pct(a.reachAt) }}
                    data-age={a.age}
                    role="listitem"
                    aria-label={`到达${a.nameZh} 约 ${mmss(a.reachAt)}`}
                  >
                    <Landmark size={14} aria-hidden />
                    <span className="tl-age-t" data-time>
                      {a.nameZh} · {a.vils} 村民 · 人口 {a.pop.used}/{a.pop.cap} · 约 {mmss(a.reachAt)}
                    </span>
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div className="tl-blocks" aria-hidden>
            {merged.map((b, i) => (
              <span
                key={i}
                className="tl-block is-soft"
                data-anomaly={[...b.types].join(' ')}
                data-short-range={b.types.has('resource_short') ? '' : undefined}
                style={{ left: pct(b.from), width: w(b.from, b.to) }}
              />
            ))}
            {tagged && (
              <span
                className="tl-block is-top"
                data-anomaly={tagged.type}
                data-short-range={tagged.type === 'resource_short' ? '' : undefined}
                style={{ left: pct(tagged.from), width: w(tagged.from, tagged.to) }}
                title={tagged.reasonZh}
              >
                <span className="tl-block-tag">{tagged.label}</span>
              </span>
            )}
          </div>
        </div>
        <div className="tl-legend">
          {(['food', 'wood', 'gold'] as const).map((r) => (
            <span key={r}>
              <i className={`k-${r}`} />
              {RES_ZH[r]}
            </span>
          ))}
          <span>
            <i className="k-villager" />
            村民生产
          </span>
          <span>
            <i className="k-military" />
            军事
          </span>
          <span>
            <i className="k-ageup" />
            升级时代
          </span>
          <span>
            <i className="k-band" />
            估算范围
          </span>
          <span>
            <i className="k-bad" />
            卡点
          </span>
          <button type="button" className="tl-est" onClick={() => setShowAssume((x) => !x)} aria-expanded={showAssume}>
            <Info size={14} aria-hidden /> 估算
          </button>
        </div>
        {showAssume && (
          <div role="dialog" aria-label="估算说明" className="tl-assume">
            <ul>
              {tl.model.assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
            <span className="note">模型版本 {tl.model.version}</span>
          </div>
        )}
      </div>

      <ol className="tl-steps" aria-label="步骤">
        {bo.steps.map((st, i) => {
          const s = tl.steps[i]!;
          const open = q.step === i;
          return (
            <li key={i} data-step={i} className={`${bad.has(i) ? 'is-bad' : ''}${open ? ' is-sel' : ''}`} aria-selected={open}>
              <button type="button" className="tl-step" onClick={() => set('step', open ? null : String(i + 1))} aria-expanded={open}>
                <span className="tl-num i">{i + 1}</span>
                <span className="tl-num t" data-time>
                  约 {mmss(rowTime(s))}
                </span>
                <span className="n">
                  {st.note}
                  {st.siteAdded && (
                    <span className="tl-site-added" data-t="site-added">
                      本站补充，来源未列
                    </span>
                  )}
                </span>
                {s.anomalies.length > 0 && (
                  <span className="r">
                    <TriangleAlert size={14} aria-hidden /> {bottleneckLabel(pickReason(s.anomalies)!, v.tOut)}
                  </span>
                )}
              </button>
              {open && sel && (
                <div role="region" aria-label="步骤详情" className="tl-detail">
                  {s.anomalies
                    .filter((a) => a.type === 'prereq_wait')
                    .map((a, k) => (
                      <span key={'pre' + k} className="note" data-t="prereq-detail">
                        {prereqDetail(a)}
                      </span>
                    ))}
                  {(['food', 'wood', 'gold', 'stone'] as const).map((r) => (
                    <span key={r}>
                      {RES_ZH[r]} <b className="tl-num">{Math.round(sel.stock[r])}</b>
                    </span>
                  ))}
                  <span>
                    人口{' '}
                    <b className="tl-num">
                      {sel.pop.used}/{sel.pop.cap}
                    </b>
                  </span>
                  <span>
                    村民 食 {sel.villagers.food} · 木 {sel.villagers.wood} · 金 {sel.villagers.gold} · 石 {sel.villagers.stone} · 建造 {sel.villagers.build}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="note">
        {source && <span className="tl-mob-only">来源 {source} · </span>}
        时间为模拟估算（{tl.model.version}）。<Link to="/builds">返回开局列表</Link>
      </p>
      <div className="tl-share-sticky">{share}</div>

      {drawer && (
        <div className="tl-scrim" onClick={close}>
          <div ref={sheet} className="tl-sheet" role="dialog" aria-modal="true" aria-label="设置" onClick={(e) => e.stopPropagation()}>
            <div className="tl-sheet-head">
              <span className="tl-grab" aria-hidden />
              <b>设置</b>
              <button type="button" className="tl-x" onClick={close} aria-label="关闭">
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="tl-sheet-body">{settings}</div>
            <div className="tl-sheet-foot">
              <button type="button" className="tl-ghost" onClick={() => patch({ civ: null, dist: null, house: null })}>
                恢复默认
              </button>
              <button type="button" className="tl-primary" onClick={close}>
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
