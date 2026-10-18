import { sharePageUrl } from '../../domain/sharePage';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Download, Info, TriangleAlert as Warn, Landmark, Link2, Settings2, Share2, X } from 'lucide-react';
import eco from '../../data/eco.json';
import units from '../../data/units.json';
import { buildOrders } from '../../data/buildOrders';
import { civByEn, civs } from '../../data';
import { useCore } from '../../data/hooks';
import type { BuildOrder } from '../../domain/buildOrder';
import { visibleSources } from './sources';
import { followupHint, stepEntities, villagerGroups } from './timelineFollowups';
import { simSupport } from '../../domain/simSupport';
import { civSimNotes, noHouseCompare, simulateBuild, WALK, type EcoData, type UpgradeData } from '../../domain/buildSim';
import { CivPicker } from '../../shared/ui/CivPicker';
import { Breadcrumbs } from '../../shared/ui/layout';
import { RowSegs } from './RowSegs';
import { SHARE_DISABLED_NOTE, buildShareCard } from './shareCard';
import { shareCardBlob } from './shareCardImage';
import {
  RES_ZH,
  buildView,
  prereqDetail,
  ROW_SEG_MAX,
  rowSegments,
  segLabel,
  rowTime,
  mmss,
  parseQuery,
  rangeLabel,
  summaryText,
  isLongBottleneck,
  noHouseCompareText,
  noteParts,
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
/** 费用：整数照常显示，带小数的保留 1 位（#42 哥特民兵 42.5） */
const fmtCost = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

export default function BuildTimelineView({ orders = buildOrders }: { orders?: BuildOrder[] }) {
  const core = useCore();
  const [sp, setSp] = useSearchParams();
  const q = parseQuery(
    sp,
    orders.map((b) => b.id),
    civs.map((c) => c.en),
    (id) => orders.find((b) => b.id === id)?.steps.length ?? 0,
  );
  const bo = orders.find((b) => b.id === q.bo)!;
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
  // #42 匈奴（huns-flag-* 稿）：只有文明被支持、按它计算且它不需要房子时才出现；置灰时 simCiv 是 Generic，这里恒为 false
  const noHouses = tl.noHouses;
  const noNeedZh = `${civByEn(simCiv)?.zh ?? simCiv}不需要`;
  const genericTl = useMemo(
    () => (noHouses ? simulateBuild(bo, 'Generic', eco as unknown as EcoData, UPS, { walkTiles: q.dist, autoHouses: q.house }) : null),
    [noHouses, bo, q.dist, q.house],
  );
  const [showAssume, setShowAssume] = useState(false);
  const [copied, setCopied] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const setBtn = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  const minutes = Math.ceil(v.end / 60);
  const span = minutes * 60;
  const pct = (t: number) => `${(Math.min(span, Math.max(0, t)) / span) * 100}%`;
  const w = (a: number, b: number) => `${(Math.max(0, Math.min(span, b) - Math.max(0, a)) / span) * 100}%`;
  const every = minutes > 30 ? 5 : minutes > 10 ? 2 : 1;
  const ticks = Array.from({ length: minutes + 1 }, (_, i) => i).filter((m) => m % every === 0);
  const target = v.ages.find((a) => a.age === (['', '', 'feudal', 'castle', 'imperial'] as const)[bo.target.age]) ?? v.ages[v.ages.length - 1];
  const targetZh = AGE_ZH[bo.target.age]!;
  const civLabel = simCiv !== 'Generic' ? `按${civByEn(simCiv)?.zh ?? simCiv}计` : '按通用计';
  const civNotes = useMemo(() => (simCiv !== 'Generic' ? civSimNotes(eco as unknown as EcoData, simCiv) : []), [simCiv]);
  const ranged = v.bottlenecks.filter((b) => b.to > b.from);
  const tagged =
    v.top && v.top.to > v.top.from
      ? (ranged.find((b) => b.from === v.top!.from && b.type === v.top!.type && b.step === v.top!.step) ?? v.top)
      : [...ranged].sort((a, b) => b.sec - a.sec)[0];
  const bad = new Set(tl.steps.filter((s) => s.anomalies.length).map((s) => s.index));
  const sel = q.step !== null ? tl.steps[q.step] : undefined;
  const sumT = summaryText(v.top, targetZh);
  const cmp = genericTl
    ? noHouseCompare(tl, genericTl, eco as unknown as EcoData, simCiv, (['', '', 'feudal', 'castle', 'imperial'] as const)[bo.target.age]!)
    : null;
  const cmpText = cmp ? noHouseCompareText(cmp, targetZh) : null;
  const changed = (q.civ ? 1 : 0) + (q.dist !== WALK.default ? 1 : 0) + (q.house ? 0 : 1);
  const source = visibleSources(bo.sources)[0]?.title;
  const [hintOff, setHintOff] = useState(() => sessionStorage.getItem('tl-followup-off') === '1');
  const hint = sel && !hintOff ? followupHint(sel, noHouses) : null;
  const groups = useMemo(() => villagerGroups(tl), [tl]);
  const nodeLabel = (i: number) =>
    `第 ${i + 1} 步，约 ${mmss(rowTime(tl.steps[i]!))}${tl.steps[i]!.anomalies.length ? '，' + tl.steps[i]!.anomalies.map((a) => a.reasonZh).join('；') : ''}`;
  const roam = (event: ReactKeyboardEvent<HTMLButtonElement>, i: number, chart = false) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      set('step', null);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(bo.steps.length - 1, i + (event.key === 'ArrowRight' ? 1 : -1)));
    document.querySelector<HTMLButtonElement>(chart ? `[data-node="${next}"]` : `[data-step="${next}"] .tl-step`)?.focus();
  };

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
      await navigator.clipboard.writeText(sharePageUrl('/builds', sp.toString(), document.baseURI));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 剪贴板不可用时静默：地址栏仍是可分享链接 */
    }
  };

  // #19 分享卡：置灰文明（simSupport=false）不生成卡，避免通用数字配上该文明的名字传出去（Steve 定）
  const canCard = !unsupported;
  const card = useMemo(
    () =>
      buildShareCard({
        view: v,
        target,
        boId: bo.id,
        boNameZh: bo.name.zh,
        civEn: q.civ,
        civZh: q.civ ? (civByEn(q.civ)?.zh ?? q.civ) : '通用',
        targetZh,
        dist: q.dist,
        defaultDist: WALK.default,
        house: q.house,
        patchBuild: __DATA_SOURCES__.patch.build,
        siteRoot:
          typeof document === 'undefined' ? `${location.host}${location.pathname}` : `${new URL(document.baseURI).host}${new URL(document.baseURI).pathname}`,
      }),
    [v, target, bo, q.civ, q.dist, q.house, targetZh],
  );
  const [cardOpen, setCardOpen] = useState(false);
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const cardBlob = useRef<Blob | null>(null);
  const shareBtn = useRef<HTMLButtonElement | null>(null);
  const cardDlg = useRef<HTMLDivElement>(null);
  const openCard = (e: { currentTarget: HTMLButtonElement }) => {
    if (!canCard) return; // aria-disabled：可聚焦，点了不动
    shareBtn.current = e.currentTarget;
    setCardOpen(true);
  };
  const closeCard = () => {
    setCardOpen(false);
    shareBtn.current?.focus();
  };
  useEffect(() => {
    if (!cardOpen) return;
    let live = true;
    let url: string | null = null;
    void shareCardBlob(card).then((b) => {
      if (!live || !b) return;
      cardBlob.current = b;
      url = URL.createObjectURL(b);
      setCardUrl(url);
    });
    cardDlg.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeCard();
    window.addEventListener('keydown', onKey);
    return () => {
      live = false;
      window.removeEventListener('keydown', onKey);
      if (url) URL.revokeObjectURL(url);
      setCardUrl(null);
      cardBlob.current = null;
    };
  }, [cardOpen, card]);
  const fileName = `aoe2-${bo.id}${q.civ ? `-${q.civ}` : ''}.png`;
  const sysShare = async () => {
    const b = cardBlob.current;
    if (!b) return;
    const file = new File([b], fileName, { type: 'image/png' });
    try {
      await navigator.share({ files: [file], title: card.title, url: sharePageUrl('/builds', sp.toString(), document.baseURI) });
    } catch {
      /* 用户取消或平台不支持：不提示 */
    }
  };
  const canSysShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';

  const copyBtn = (
    <button type="button" className="tl-share" onClick={copy} aria-label="复制链接">
      <Link2 size={16} aria-hidden />
      复制链接
    </button>
  );
  const shareCardBtn = (where: string) => (
    <button
      type="button"
      className="tl-share is-ghost"
      data-t="share-card-btn"
      onClick={openCard}
      aria-disabled={canCard ? undefined : true}
      aria-describedby={canCard ? undefined : `share-note-${where}`}
    >
      <Share2 size={16} aria-hidden />
      分享
    </button>
  );
  const shareNote = (where: string) =>
    !canCard && (
      <span className="tl-share-note" id={`share-note-${where}`} data-t="share-note">
        {SHARE_DISABLED_NOTE}
      </span>
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
      <div className="tl-settings-economy">
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
        <button
          type="button"
          role="switch"
          aria-checked={noHouses ? false : q.house}
          aria-disabled={noHouses || undefined}
          disabled={noHouses}
          className="tl-switch"
          data-t="auto-house"
          onClick={() => set('house', q.house ? '0' : '1')}
        >
          自动造房 <span className="tl-knob" aria-hidden />
          {!noHouses && dot(!q.house)}
        </button>
        {noHouses && (
          <span className="tl-no-need" data-t="no-need">
            {noNeedZh}
          </span>
        )}
        <span className="note">羊和浆果按近距离计{!q.house && ' · 关掉可以看到不造房会卡在哪'}</span>
      </div>
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

      {['fast-castle-boom', 'fast-castle-knights'].includes(bo.id) && (
        <p className="note">
          城堡后选择：
          <Link className="ulink" to="/builds?bo=fast-castle-boom">
            暴经济
          </Link>
          {' · '}
          <Link className="ulink" to="/builds?bo=fast-castle-knights">
            转骑士
          </Link>
          （沿用相同前半段）
        </p>
      )}
      {['hybrid-fish-18', 'fast-castle-knights'].includes(bo.id) && (
        <details className="bo-sources">
          <summary>开局来源</summary>
          <ul>
            {(bo.sources ?? []).map((s) => (
              <li key={s.url}>
                <a className="ulink" href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title}
                </a>
                （核对：{s.accessed}）
              </li>
            ))}
          </ul>
        </details>
      )}
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
        <SumMain extra={cmpText}>
          <ul className="tl-summary" role="region" aria-label="摘要">
            <li className="tl-arrive" data-t="sum-arrive">
              <span className="k">到达{target?.nameZh ?? targetZh}</span>
              <b className="tl-num" data-time>
                {target ? `约 ${mmss(target.reachAt)}` : '—'}
              </b>
              <span className="tl-civ" data-t="sum-civ">
                {civLabel}
              </span>
              {target && rangeLabel(target.reachAt, target.errSec) && (
                <span className="s tl-num tl-range" data-t="sum-range">
                  {rangeLabel(target.reachAt, target.errSec)}
                </span>
              )}
            </li>
            <li className={`tl-bn${v.top ? ' is-bad' : ''}${isLongBottleneck(sumT.main) ? ' is-long' : ''}`} data-t="sum-bottleneck">
              {v.top ? (
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
          {civNotes.length > 0 && (
            <p className="tl-civ-note" data-t="civ-note">
              {civNotes.join('；')}
            </p>
          )}
        </SumMain>
        <div className="tl-share-slot">
          <div className="tl-share-row">
            {copyBtn}
            {shareCardBtn('desk')}
          </div>
          {shareNote('desk')}
        </div>
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
                    className={`tl-age${Math.min(span, Math.max(0, a.reachAt)) / span > 0.7 ? ' is-end' : ''}`}
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

      <details className="tl-extra-controls">
        <summary>时间线操作与村民生产</summary>
        <nav className="tl-node-list" aria-label="时间线节点">
          {bo.steps.map((_, i) => (
            <button
              type="button"
              key={i}
              data-node={i}
              aria-label={nodeLabel(i)}
              aria-pressed={q.step === i}
              onKeyDown={(e) => roam(e, i, true)}
              onClick={() => jump(i)}
            >
              {i + 1}
            </button>
          ))}
        </nav>
        <div className="tl-villagers" aria-label="村民生产分段">
          {groups
            .filter((g) => g.length > 1)
            .map((g) => (
              <details key={g[0]!.from}>
                <summary>
                  村民 <span className="nw">×{g.length}</span> ·{' '}
                  <span className="nw">
                    约 {mmss(g[0]!.from)}–{mmss(g.at(-1)!.to)}
                  </span>
                </summary>
                <ol>
                  {g.map((event, i) => (
                    <li key={event.from}>
                      <button type="button" onClick={() => jump(event.step)}>
                        村民 {i + 1} ·{' '}
                        <span className="nw">
                          约 {mmss(event.from)}–{mmss(event.to)}
                        </span>{' '}
                        · 第 {event.step + 1} 步
                      </button>
                    </li>
                  ))}
                </ol>
              </details>
            ))}
        </div>
      </details>
      <ol className="tl-steps" aria-label="步骤">
        {bo.steps.map((st, i) => {
          const s = tl.steps[i]!;
          const open = q.step === i;
          return (
            <li
              key={i}
              data-step={i}
              data-start-at={s.startAt}
              data-row-at={rowTime(s)}
              className={`${bad.has(i) ? 'is-bad' : ''}${open ? ' is-sel' : ''}`}
              aria-selected={open}
            >
              <button
                type="button"
                className="tl-step"
                onKeyDown={(e) => roam(e, i)}
                aria-label={nodeLabel(i)}
                onClick={() => set('step', open ? null : String(i + 1))}
                aria-expanded={open}
              >
                <span className="tl-num i">{i + 1}</span>
                <span className="tl-num t" data-time>
                  约 {mmss(rowTime(s))}
                </span>
                <span className="n">
                  {noteParts(st.note ?? '', st.houseText, noHouses).map((x, k) =>
                    x.skip ? (
                      <span key={k} className="tl-skip" data-t="house-skip">
                        <s>{x.text}</s>
                        <span className="tl-no-need">{noNeedZh}</span>
                      </span>
                    ) : (
                      <span key={k}>{x.text}</span>
                    ),
                  )}
                  {st.siteAdded && (
                    <span className="tl-site-added" data-t="site-added">
                      本站补充，来源未列
                    </span>
                  )}
                </span>
                {s.anomalies.length > 0 && (
                  <span className="r">
                    <RowSegs segs={rowSegments(s.anomalies, s.researchAt !== undefined ? { from: s.startAt, to: s.researchAt } : undefined)} tOut={v.tOut} />
                  </span>
                )}
              </button>
              {open && sel && (
                <div role="region" aria-label="步骤详情" className="tl-detail">
                  {hint && (
                    <div className="tl-followup" role="status">
                      <span>{hint}</span>
                      <button
                        type="button"
                        onClick={() => {
                          sessionStorage.setItem('tl-followup-off', '1');
                          setHintOff(true);
                        }}
                      >
                        知道了
                      </button>
                    </div>
                  )}
                  <div className="tl-entities">
                    {stepEntities(st).map((ref) => (
                      <Link className="ulink" key={`${ref.kind}-${ref.id}`} to={`/${ref.kind}/${ref.id}`}>
                        {(ref.kind === 'unit' ? core?.unitById[ref.id] : ref.kind === 'tech' ? core?.techById[ref.id] : core?.buildingById[ref.id])?.zh ??
                          `${ref.kind === 'unit' ? '单位' : ref.kind === 'tech' ? '科技' : '建筑'} ${ref.id}`}
                      </Link>
                    ))}
                  </div>
                  {rowSegments(s.anomalies, s.researchAt !== undefined ? { from: s.startAt, to: s.researchAt } : undefined).length > ROW_SEG_MAX && (
                    <span className="note" data-t="seg-all">
                      {rowSegments(s.anomalies, s.researchAt !== undefined ? { from: s.startAt, to: s.researchAt } : undefined)
                        .map((x) => segLabel(x, v.tOut))
                        .join('；')}
                    </span>
                  )}
                  {s.anomalies
                    .filter((a) => a.type === 'prereq_wait')
                    .map((a, k) => (
                      <span key={'pre' + k} className="note" data-t="prereq-detail">
                        {prereqDetail(a)}
                      </span>
                    ))}
                  {sel.cost && (
                    <span data-t="step-cost">
                      费用{' '}
                      {(['food', 'wood', 'gold', 'stone'] as const)
                        .filter((r) => sel.cost![r] > 0)
                        .map((r, i) => (
                          <span key={r}>
                            {i > 0 && ' · '}
                            {RES_ZH[r]} <b className="tl-num">{fmtCost(sel.cost![r])}</b>
                          </span>
                        ))}
                    </span>
                  )}
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
      <div className="tl-share-sticky">
        <div className="tl-share-row">
          {copyBtn}
          {shareCardBtn('mob')}
        </div>
        {shareNote('mob')}
      </div>
      {copied && (
        <div className="tl-toast" role="status" data-t="toast-copied">
          <Check size={16} strokeWidth={2} aria-hidden />
          链接已复制
        </div>
      )}
      {cardOpen && (
        <div className="tl-scrim" onClick={closeCard}>
          <div ref={cardDlg} className="tl-sheet tl-cardsheet" role="dialog" aria-modal="true" aria-label="分享卡" onClick={(e) => e.stopPropagation()}>
            <div className="tl-sheet-head">
              <b>分享卡</b>
              <button type="button" className="tl-x" onClick={closeCard} aria-label="关闭">
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="tl-sheet-body">
              <figure className="tl-cardprev" data-t="share-card">
                <p className="tl-cardprev-title" data-t="card-title">
                  {card.title}
                </p>
                <ul>
                  {card.cells.map((c, i) => (
                    <li key={i} data-t={`card-cell-${i}`}>
                      <span className="k">{c.label}</span>
                      <b className={`tl-num tl-v${c.accent ? ' is-accent' : ''}`}>
                        {c.valueParts
                          ? c.valueParts.map((p, k) => [
                              k > 0 ? ' ' : null,
                              <span key={k} className={k === 0 && p.includes('（') ? 'is-wrap' : undefined}>
                                {k === 0 && p.includes('（') ? (
                                  <>
                                    <span>{p.slice(0, p.indexOf('（'))}</span>
                                    <span>{p.slice(p.indexOf('（'))}</span>
                                  </>
                                ) : (
                                  p
                                )}
                              </span>,
                            ])
                          : c.value}
                      </b>
                      {c.sub && <span className="s">{c.sub}</span>}
                    </li>
                  ))}
                </ul>
                <figcaption data-t="card-basis">{card.basis}</figcaption>
                <span className="tl-cardprev-url" data-t="card-url">
                  {card.url}
                </span>
              </figure>
            </div>
            <div className="tl-sheet-foot">
              {cardUrl && (
                <a className="tl-ghost tl-dl" href={cardUrl} download={fileName} data-t="card-download">
                  <Download size={16} aria-hidden /> 下载图片
                </a>
              )}
              {canSysShare && cardUrl && (
                <button type="button" className="tl-primary" onClick={sysShare}>
                  <Share2 size={16} aria-hidden /> 分享图片
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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

/** 摘要四格总包一层，对比行（#42）和文明附注都在结构上排在四格下面，不参与外层 flex */
function SumMain({ extra, children }: { extra: string | null; children: React.ReactNode }) {
  return (
    <div className="tl-sum-main">
      {children}
      {extra && (
        <p className="tl-cmp" data-t="sum-compare">
          {extra.split(/(?<=·)\s*/).flatMap((x, i) => [...(i ? [' '] : []), <span key={i}>{x}</span>])}
        </p>
      )}
    </div>
  );
}
