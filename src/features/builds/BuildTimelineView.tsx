import { sharePageUrl } from '../../domain/sharePage';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, Download, TriangleAlert as Warn, Link2, Settings2, Share2, X } from 'lucide-react';
import eco from '../../data/raw/eco';
import units from '../../data/raw/units';
import { buildOrders } from '../../data/buildOrders';
import { civByEn } from '../../data';
import type { BuildOrder } from '../../domain/buildOrder';
import { visibleSources } from './sources';
import { followupHint } from './timelineFollowups';
import { simSupport } from '../../domain/simSupport';
import { useTimelineSettings } from './useTimelineSettings';
import { TimelineSettings } from './TimelineSettings';
import { TimelineChart } from './TimelineChart';
import { TimelineSteps } from './TimelineSteps';
import { TimelineSummary } from './TimelineSummary';
import { civSimNotes, noHouseCompare, simulateBuild, WALK, type EcoData, type UpgradeData } from '../../domain/buildSim';
import { Breadcrumbs } from '../../shared/ui/layout';
import { useShareLink } from '../../shared/ui/useShareLink';
import { SHARE_DISABLED_NOTE, buildShareCard } from './shareCard';
import { shareCardBlob } from './shareCardImage';
import { NumUnitText } from './NumUnitText';
import BuildPracticeView, { buildPracticeUrl } from './BuildPracticeView';
import { buildView, rowTime, mmss, rangeLabel, summaryText, isLongBottleneck, noHouseCompareText } from './timelineModel';

const UPS = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const UNIT_ZH = Object.fromEntries((units as { id: number; zh: string }[]).map((u) => [String(u.id), u.zh]));
const AGE_ZH = ['', '黑暗', '封建', '城堡', '帝王'];
/** #/builds?bo=…：开局时间线；布局与控件保留原状态和DOM。 */
export default function BuildTimelineView({ orders = buildOrders }: { orders?: BuildOrder[] }) {
  const { sp, q, bo, patch, set, warnOff, hideWarning, hintOff, hideHint, showAssume, setShowAssume, drawer, setDrawer, setBtn, sheet, close } =
    useTimelineSettings(orders);

  // #42：链接里的文明加成还没计入 → 保留 URL 里的 civ，按通用计算并提示
  const unsupported = !!q.civ && !simSupport(q.civ);
  const simCiv = q.civ && !unsupported ? q.civ : 'Generic';
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
  const {
    copy: copyLink,
    copied,
    status,
    manualLink,
    reset: resetShare,
    statusProps,
  } = useShareLink({
    stateKey: sp.toString(),
    successMessage: '链接已复制',
    failureMessage: '自动复制失败，请手动复制下方完整链接。',
  });
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(resetShare, 2000);
    return () => clearTimeout(timer);
  }, [copied, resetShare]);
  const target = v.ages.find((a) => a.age === (['', '', 'feudal', 'castle', 'imperial'] as const)[bo.target.age]) ?? v.ages[v.ages.length - 1];
  const targetZh = AGE_ZH[bo.target.age]!;
  const civLabel = simCiv !== 'Generic' ? `按${civByEn(simCiv)?.zh ?? simCiv}计` : '按通用计';
  const civNotes = useMemo(() => (simCiv !== 'Generic' ? civSimNotes(eco as unknown as EcoData, simCiv, bo.id) : []), [simCiv, bo.id]);
  const sel = q.step !== null ? tl.steps[q.step] : undefined;
  const sumT = summaryText(v.top, targetZh);
  const cmp = genericTl
    ? noHouseCompare(tl, genericTl, eco as unknown as EcoData, simCiv, (['', '', 'feudal', 'castle', 'imperial'] as const)[bo.target.age]!)
    : null;
  const cmpText = cmp ? noHouseCompareText(cmp, targetZh) : null;
  const changed = (q.civ ? 1 : 0) + (q.dist !== WALK.default ? 1 : 0) + (q.house ? 0 : 1);
  const source = visibleSources(bo.sources)[0]?.title;
  const hint = sel && !hintOff ? followupHint(sel, noHouses) : null;
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

  const jump = (step: number) => {
    set('step', String(step + 1));
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-step="${step}"] .tl-step`);
      el?.scrollIntoView({ block: 'center' });
      el?.focus({ preventScroll: true });
    });
  };

  const copy = () => copyLink(() => sharePageUrl('/builds', sp.toString(), document.baseURI));

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

  const settings = <TimelineSettings q={q} unsupported={unsupported} noHouses={noHouses} noNeedZh={noNeedZh} set={set} />;

  const mode = sp.get('view');
  if (mode === 'practice' || mode === 'print')
    return (
      <BuildPracticeView
        key={`${bo.id}:${q.civ}:${q.dist}:${q.house}`}
        order={bo}
        timeline={tl}
        query={q}
        params={sp}
        mode={mode}
        onChange={patch}
        civNotes={civNotes}
      />
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

      <nav className="bp-entry" aria-label="开局跟练与打印">
        <Link className="bp-button" to={buildPracticeUrl(sp, 'practice')}>
          专注跟练
        </Link>
        <Link className="bp-button" to={buildPracticeUrl(sp, 'print')}>
          打印步骤单
        </Link>
      </nav>

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
          <button type="button" aria-label="关闭提示" onClick={hideWarning}>
            <X size={16} aria-hidden />
          </button>
        </div>
      )}
      <div className="tl-summary-card">
        <TimelineSummary extra={cmpText}>
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
              {tl.civ === 'Bengalis' ? <NumUnitText text={civNotes.join('；')} /> : civNotes.join('；')}
            </p>
          )}
        </TimelineSummary>
        <div className="tl-share-slot">
          <div className="tl-share-row">
            {copyBtn}
            {shareCardBtn('desk')}
          </div>
          {shareNote('desk')}
        </div>
      </div>

      <TimelineChart v={v} selectedStep={q.step} tl={tl} showAssume={showAssume} setShowAssume={setShowAssume} />

      <TimelineSteps
        bo={bo}
        tl={tl}
        v={v}
        q={q}
        noHouses={noHouses}
        noNeedZh={noNeedZh}
        hint={hint}
        hideHint={hideHint}
        nodeLabel={nodeLabel}
        roam={roam}
        jump={jump}
        set={set}
      />
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
        <div className="tl-toast" {...statusProps} data-t="toast-copied">
          <Check size={16} strokeWidth={2} aria-hidden />
          链接已复制
        </div>
      )}
      {manualLink && (
        <div>
          <p className="note" {...statusProps}>
            {status}
          </p>
          <label className="note share-link-manual">
            手动复制开局链接
            <textarea aria-label="手动复制开局链接" readOnly value={manualLink} rows={3} onFocus={(e) => e.currentTarget.select()} />
          </label>
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
                <figcaption data-t="card-basis">{tl.civ === 'Bengalis' ? <NumUnitText text={card.basis} /> : card.basis}</figcaption>
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
