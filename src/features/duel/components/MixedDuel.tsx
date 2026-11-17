import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fmtSide, type Mode } from '../../../domain/duelState';
import { decodeMixedDuel, emptyMixedDuel, encodeMixedDuel, mixedDataVersion, type MixedDuelInput } from '../../../domain/mixedDuelParams';
import { mixedFight, MIXED_RULE_LABEL, type MixedFightResult } from '../../../domain/mixedFight';
import { makeSimContext } from '../../../domain/simulator';
import { Icon } from '../../../shared/ui/Icon';
import { ListHead } from '../../../shared/ui/layout';
import { Loading } from '../../../shared/ui/widgets';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';
import type { CoreTreesResources } from '../../../shared/utils/useCoreTrees';
import { resolveMixedSide } from '../logic/mixedDuel';
import { MixedSideEditor } from './MixedSideEditor';
import { MixedResult, MixedRules } from './MixedResult';
import { radioKeyboard } from './radioKeyboard';
import '../mixed-duel.css';

const DATA_VERSION = mixedDataVersion(DATA_SOURCES);
type ExitMode = Exclude<Mode, 't'>;
type Notice = { kind: 'status' | 'error'; text: string };

export function MixedDuel({ resources }: { resources: CoreTreesResources }) {
  const [params, setParams] = useSearchParams();
  const raw = params.toString();
  const { input, errors: protocolErrors } = useMemo(() => decodeMixedDuel(params), [params]);
  const core = resources.core.data,
    trees = resources.trees.data;
  const ctx = useMemo(() => (core && trees ? makeSimContext(core.techs, trees) : null), [core, trees]);
  const view = useMemo(() => {
    if (!core || !ctx) return null;
    try {
      return { a: resolveMixedSide(ctx, core, input.a, 'a'), b: resolveMixedSide(ctx, core, input.b, 'b'), error: '' };
    } catch {
      return { a: null, b: null, error: '资料或属性解析异常，未生成战果。请重试资料，或更换单位后再计算。' };
    }
  }, [core, ctx, input]);
  const fields = [...(view?.a?.errors ?? []), ...(view?.b?.errors ?? [])];
  const dataMismatch = input.data !== DATA_VERSION;
  const loadError = resources.core.error || resources.trees.error;
  const ready = !!core && !!ctx && !loadError;
  const canCompute = ready && !protocolErrors.length && !dataMismatch && !view?.error && !!view?.a?.army && !!view.b?.army;
  const [outcome, setOutcome] = useState<{ signature: string; result: MixedFightResult } | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [shareFallback, setShareFallback] = useState('');
  const [exitMode, setExitMode] = useState<ExitMode | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const shareRequest = useRef(0);
  const originFocus = useRef<HTMLElement | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const [scope, setScope] = useState({ raw, core, trees, loadError });
  if (scope.raw !== raw || scope.core !== core || scope.trees !== trees || scope.loadError !== loadError) {
    setScope({ raw, core, trees, loadError });
    setOutcome(null);
    setBusy(false);
    setExitMode(null);
    setShareFallback('');
    setNotice(null);
  }
  useLayoutEffect(
    () => () => {
      clearTimeout(timer.current);
      shareRequest.current++;
    },
    [raw, core, trees, loadError],
  );
  const update = (next: MixedDuelInput) => {
    setNotice(null);
    setParams(encodeMixedDuel(next), { replace: true });
  };
  const focusField = (id: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    const details = element.closest('details');
    if (details) details.open = true;
    element.focus();
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const compute = () => {
    if (!canCompute || !view?.a?.army || !view.b?.army) return;
    const a = view.a.army,
      b = view.b.army;
    setBusy(true);
    setHasRun(true);
    setOutcome(null);
    timer.current = setTimeout(() => {
      let result: MixedFightResult;
      try {
        result = mixedFight(a, b);
      } catch {
        result = { status: 'error', reason: '运算异常，未生成有效结果；请更换配置后重试' };
      }
      setOutcome({ signature: raw, result });
      setBusy(false);
      requestAnimationFrame(() => resultHeading.current?.focus());
    }, 30);
  };
  const exit = (mode: ExitMode) => {
    const a = input.a.rows[0],
      b = input.b.rows[0];
    if (!a || !b || !view?.a?.army || !view.b?.army || protocolErrors.length || dataMismatch) {
      setNotice({ kind: 'error', text: '无法恢复单兵种：请先为双方配置有效的第一行与共享上下文，再切换模式。' });
      return;
    }
    const side = (key: 'a' | 'b') => {
      const s = input[key];
      return fmtSide({ uid: +s.rows[0]!.uid, civ: s.civ, age: +s.age, ageSet: true, techs: s.techs.map(Number), team: s.team.map(Number) });
    };
    setParams(new URLSearchParams({ m: mode, a: side('a'), b: side('b'), ...(mode === 'n' ? { na: a.qty, nb: b.qty } : {}) }));
  };
  const requestExit = (mode: ExitMode, trigger: HTMLElement) => {
    originFocus.current = trigger;
    if (!input.a.rows[0] || !input.b.rows[0]) {
      setNotice({ kind: 'error', text: '无法恢复单兵种：空军队没有可保留的第一行，请先添加单位。' });
      return;
    }
    if (input.a.rows.length > 1 || input.b.rows.length > 1) setExitMode(mode);
    else exit(mode);
  };
  const closeConfirm = () => {
    setExitMode(null);
    requestAnimationFrame(() => originFocus.current?.focus());
  };
  const share = async () => {
    if (!canCompute) return;
    const url = window.location.href;
    const request = ++shareRequest.current;
    const current = () => request === shareRequest.current && window.location.href === url;
    try {
      await navigator.clipboard.writeText(url);
      if (!current()) return;
      setNotice({ kind: 'status', text: '混编配置链接已复制；打开链接后请重新计算。' });
      setShareFallback('');
    } catch {
      if (!current()) return;
      setNotice({ kind: 'error', text: '复制失败，请选择下方完整链接后手动复制。' });
      setShareFallback(url);
    }
  };
  const result = canCompute && outcome?.signature === raw ? outcome.result : null;
  const stale = !result && !busy && hasRun;
  return (
    <section id="duel" className="pane mixed-duel" data-testid="mixed-duel">
      <ListHead level={1} title="混编对战" desc="按数量配置两支军队，在指定理想规则下比较结果。" />
      <span className="tag mix-ideal">理想模型</span>
      <div className="bar fbar" role="radiogroup" aria-label="模式" onKeyDown={radioKeyboard}>
        {(
          [
            ['1', '1v1'],
            ['n', 'N vs M'],
            ['r', '等资源'],
          ] as const
        ).map(([mode, label]) => (
          <button
            type="button"
            key={mode}
            role="radio"
            aria-checked={mode === 'n'}
            tabIndex={mode === 'n' ? 0 : -1}
            className={mode === 'n' ? 'on' : undefined}
            onClick={(e) => {
              if (mode !== 'n') requestExit(mode, e.currentTarget);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="bar mix-mode" role="radiogroup" aria-label="军队配置" onKeyDown={radioKeyboard}>
        <button type="button" role="radio" aria-checked="false" tabIndex={-1} onClick={(e) => requestExit('n', e.currentTarget)}>
          单兵种
        </button>
        <button type="button" role="radio" aria-checked="true" className="on">
          混编
        </button>
      </div>
      <MixedRules />
      {notice && (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={notice.kind === 'error' ? 'mix-error' : 'mix-info'}>
          {notice.text}
        </p>
      )}
      {!!protocolErrors.length && (
        <section className="mix-error" role="alert" aria-label="链接失效">
          <h2>混编链接失效，未回退为默认对决</h2>
          <ul>
            {protocolErrors.map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
          <details>
            <summary>查看保留的原始链接</summary>
            <textarea aria-label="原始混编链接" readOnly value={window.location.href} rows={5} />
          </details>
          <button type="button" onClick={() => update(emptyMixedDuel(DATA_VERSION))}>
            重新配置双方（清空损坏方案）
          </button>
        </section>
      )}
      {dataMismatch && !protocolErrors.length && (
        <section className="mix-warning" role="alert">
          <h2>链接数据版本与当前站点不同</h2>
          <p>不能回放旧数据战果。确认后保留输入，并使用当前固定数据重新校验和计算。</p>
          <details>
            <summary>查看双方数据标识</summary>
            <p className="mix-pin">链接：{input.data}</p>
            <p className="mix-pin">当前：{DATA_VERSION}</p>
          </details>
          <button type="button" onClick={() => update({ ...input, data: DATA_VERSION })}>
            确认使用当前数据重新校验
          </button>
        </section>
      )}
      {!ready &&
        (loadError ? (
          <p role="alert" className="mix-error">
            资料加载失败，链接与输入均保留。
            <button type="button" onClick={resources.retry}>
              重试资料
            </button>
          </p>
        ) : (
          <Loading />
        ))}
      {view?.error && (
        <p role="alert" className="mix-error">
          {view.error}
          <button type="button" onClick={resources.retry}>
            重试资料
          </button>
        </p>
      )}
      {!!fields.length && ready && (
        <section className="mix-error" aria-label="配置错误" role="alert">
          <h2>请修正配置后再计算</h2>
          <ul>
            {fields.map((error, i) => (
              <li key={`${error.field}-${i}`}>
                <button type="button" className="mix-error-link" onClick={() => focusField(error.field)}>
                  {error.message}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {core && view?.a && view.b && (
        <fieldset disabled={!ready || !!protocolErrors.length || busy} className="mix-editor-fieldset">
          <legend className="sr-only">双方混编配置</legend>
          <div className="mix-sides">
            {(['a', 'b'] as const).map((key) => (
              <MixedSideEditor
                key={key}
                side={key}
                input={input[key]}
                view={view[key]!}
                core={core}
                ctx={ctx!}
                onChange={(value, message) => {
                  update({ ...input, [key]: value });
                  if (message) requestAnimationFrame(() => setNotice({ kind: 'status', text: message }));
                }}
              />
            ))}
          </div>
        </fieldset>
      )}
      <div className="mix-calculate">
        <div>
          <strong>{canCompute ? '双方配置已就绪' : '配置尚未就绪'}</strong>
          <p className="note">占比由数量派生，仅用于阅读，不参与伤害分配。</p>
        </div>
        <button type="button" className="pri" disabled={!canCompute || busy} onClick={compute}>
          <Icon name="calculator" />
          {busy ? '正在计算…' : '计算混编结果'}
        </button>
        <button type="button" data-testid="mix-share" disabled={!canCompute || busy} onClick={share}>
          <Icon name="copy" />
          复制当前配置链接
        </button>
      </div>
      {!canCompute && <p className="note">配置尚未有效，修正上述字段、资料或版本问题后才能分享。</p>}
      {shareFallback && canCompute && (
        <label className="mix-share-fallback">
          完整混编配置链接（可选择复制）
          <textarea readOnly rows={4} value={shareFallback} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
      <div className="mix-result-anchor" aria-live="polite" aria-atomic="true">
        {!result && (
          <p className="mix-info" role="status">
            {busy ? '正在计算，结果尚未生成。' : stale ? '配置已变化，请重新计算。' : '尚未计算；修改配置后旧结果立即失效，请重新计算。'}
          </p>
        )}
        {result?.status === 'error' && (
          <div role="alert" className="mix-error">
            <h2 ref={resultHeading} tabIndex={-1}>
              结果未生成
            </h2>
            <p>{result.reason}</p>
          </div>
        )}
      </div>
      {result && result.status !== 'error' && view?.a && view.b && (
        <MixedResult result={result} input={input} a={view.a} b={view.b} headingRef={resultHeading} onEdit={() => focusField('mix-a-civ')} onShare={share} />
      )}
      <p className="note mix-footer">混编不提供拐点、盈亏平衡、训练总价或单兵种回放；需要这些功能时请返回单兵种。</p>
      <p className="note mix-footer">
        固定数据 <span className="num nw">DE {DATA_SOURCES.patch?.build ?? '未知'}</span> · {MIXED_RULE_LABEL} · 不等同于实战结果
      </p>
      {exitMode && (
        <ExitConfirm
          onCancel={closeConfirm}
          onConfirm={() => {
            const target = exitMode;
            closeConfirm();
            exit(target);
          }}
        />
      )}
    </section>
  );
}

function ExitConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      className="mix-dialog"
      ref={dialog}
      aria-labelledby="mix-switch-title"
      aria-describedby="mix-switch-desc"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id="mix-switch-title">切回单兵种？</h2>
      <p id="mix-switch-desc">仅保留双方当前第一行、数量和共享上下文；其余行与本次混编结果将丢弃。取消可继续编辑。</p>
      <div className="bar">
        <button type="button" autoFocus onClick={onCancel}>
          取消，继续混编
        </button>
        <button type="button" className="pri" onClick={onConfirm}>
          确认，仅保留各第一行
        </button>
      </div>
    </dialog>
  );
}
