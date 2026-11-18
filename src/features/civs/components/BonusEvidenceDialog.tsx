import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type MouseEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { loadCore } from '../../../data';
import type { CivBonusEnt } from '../../../domain/civBonus';
import type { Civ } from '../../../domain/types';
import { Icon } from '../../../shared/ui/Icon';
import { CivBonusText } from './civBonusText';
import { createEvidenceLoader } from './evidenceLoader';
import './civ-bonus-evidence.css';

type CoreData = Awaited<ReturnType<typeof loadCore>>;
type EvidenceContent = ComponentType<{ b: CivBonusEnt; core: CoreData; compact?: boolean; head?: boolean; variant?: 'default' | 'evidence' }>;
type Bundle = { core: CoreData; Content: EvidenceContent };
type LoadState = { status: 'pending' } | { status: 'error' } | { status: 'ready'; bundle: Bundle };

const loadEvidenceBundle = createEvidenceLoader(loadCore, () => import('../../../shared/ui/BonusBody').then((module) => module.BonusBodyContent));

export function BonusEvidenceDialog({
  c,
  b,
  open,
  originScrollY,
  onClickCapture,
  onDismiss,
}: {
  c: Civ;
  b: CivBonusEnt;
  open: boolean;
  originScrollY: number;
  onClickCapture: (event: MouseEvent<HTMLElement>) => (() => void) | undefined;
  onDismiss: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const clickCandidate = useRef<{ nativeEvent: globalThis.MouseEvent; verify: () => void } | null>(null);
  const generation = useRef(0);
  const requestScope = useRef<{ active: boolean } | null>(null);
  const location = useLocation();
  const [openingIdentity] = useState(() => ({ key: location.key, civ: c.en, bonusId: b.id }));
  const identityChanged = openingIdentity.key !== location.key || openingIdentity.civ !== c.en || openingIdentity.bonusId !== b.id;
  const [state, setState] = useState<LoadState>({ status: 'pending' });

  const request = useCallback((scope: { active: boolean }) => {
    const current = ++generation.current;
    void loadEvidenceBundle().then(
      ({ core, renderer: Content }) => {
        if (scope.active && generation.current === current) setState({ status: 'ready', bundle: { core, Content } });
      },
      () => {
        if (scope.active && generation.current === current) setState({ status: 'error' });
      },
    );
  }, []);

  useEffect(() => {
    if (!open || identityChanged) return;
    const scope = { active: true };
    requestScope.current = scope;
    request(scope);
    return () => {
      scope.active = false;
    };
  }, [b.id, identityChanged, location.key, open, request]);

  const retry = useCallback(() => {
    const scope = requestScope.current;
    if (!scope?.active) return;
    setState({ status: 'pending' });
    request(scope);
  }, [request]);

  useEffect(
    () => () => {
      clickCandidate.current = null;
    },
    [],
  );

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    if (identityChanged) {
      onDismiss();
      return;
    }
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    const openedKey = location.key;
    const openedHref = window.location.href;
    const openedHistoryKey = window.history.state?.key;
    root.style.overflow = 'hidden';
    if (!dialog.open) dialog.showModal();
    titleRef.current?.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
      root.style.overflow = previousOverflow;
      if (window.location.href === openedHref && window.history.state?.key === openedHistoryKey && location.key === openedKey) {
        window.scrollTo(0, originScrollY);
        const trigger = document.querySelector<HTMLElement>(`[data-bonus-action="${CSS.escape(b.id)}"]`);
        (trigger ?? document.getElementById('civ-bonus-title'))?.focus({ preventScroll: true });
      }
    };
  }, [b.id, identityChanged, location.key, onDismiss, open, originScrollY]);

  const focusables = (dialog: HTMLDialogElement) =>
    Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')).filter(
      (element) => element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0,
    );

  return (
    <dialog
      ref={dialogRef}
      className="civ-bonus-dialog"
      aria-labelledby="civ-bonus-dialog-title"
      onClickCapture={(event) => {
        clickCandidate.current = null;
        const verify = onClickCapture(event);
        if (verify) clickCandidate.current = { nativeEvent: event.nativeEvent, verify };
      }}
      onClick={(event) => {
        const candidate = clickCandidate.current;
        clickCandidate.current = null;
        const sameEvent = candidate?.nativeEvent === event.nativeEvent;
        if (sameEvent) candidate.verify();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab' || !dialogRef.current) return;
        const items = focusables(dialogRef.current);
        if (!items.length) {
          event.preventDefault();
          titleRef.current?.focus({ preventScroll: true });
          return;
        }
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <header className="civ-bonus-dialog-header">
        <div>
          <p className="civ-bonus-dialog-civ">
            {c.zh} · {b.team ? '团队加成' : '文明加成'}
          </p>
          <h2 id="civ-bonus-dialog-title" ref={titleRef} tabIndex={-1}>
            作用与依据
          </h2>
        </div>
        <button type="button" className="civ-bonus-dialog-close" aria-label="关闭作用与依据" onClick={onDismiss}>
          <Icon name="x" />
        </button>
      </header>
      <div className="civ-bonus-dialog-scroll">
        <p className="civ-bonus-dialog-original">
          <CivBonusText text={b.zh} />
        </p>
        {b.team && <p className="note civ-bonus-dialog-team-note">团队加成对你和所有盟友生效（包括你自己）。</p>}
        {b.fresh === false && (
          <p className="civ-bonus-dialog-warning" role="alert">
            游戏说明与游戏数据不一致
          </p>
        )}
        {state.status === 'pending' && (
          <div className="civ-bonus-dialog-pending" role="status">
            <strong>正在加载这条加成的明细…</strong>
            <p>仍可阅读上方游戏说明，也可以关闭后继续阅读。</p>
          </div>
        )}
        {state.status === 'error' && (
          <div className="civ-bonus-dialog-error" role="alert">
            <p>这条加成的明细读取失败。仍可阅读上方游戏说明，也可以重试或查看完整详情。</p>
            <button type="button" onClick={retry}>
              重试读取明细
            </button>
          </div>
        )}
        {state.status === 'ready' && <state.bundle.Content b={b} core={state.bundle.core} head={false} variant="evidence" />}
      </div>
      <footer className="civ-bonus-dialog-footer">
        <Link className="civ-bonus-dialog-detail" to={`/civ/${c.en}/bonus/${b.idx}`}>
          查看完整详情
        </Link>
        <button type="button" className="civ-bonus-dialog-close" onClick={onDismiss}>
          关闭
        </button>
      </footer>
    </dialog>
  );
}
