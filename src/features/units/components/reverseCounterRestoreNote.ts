import { startTransition, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { ReverseCounterSession } from '../reverseCounterSession';

export interface RestoreNoteState {
  sessionIdentity: object;
  generation: number;
  note: string;
}

interface RestoreEffectOptions {
  currentSession: {
    identity: object;
    restorePending: boolean;
    record: ReverseCounterSession | null;
    markRestored: () => void;
  };
  sessionIdentityRef: { current: object };
  sessionStateReady: boolean;
  treesPending: boolean;
  corePending: boolean;
  coreError: boolean;
  hasBasePkRow: boolean;
  state: RestoreNoteState;
  setNoteState: Dispatch<SetStateAction<RestoreNoteState>>;
  setOriginButton: Dispatch<SetStateAction<string>>;
  pkButtonId: (category: string, id: number) => string;
}

export function useRestoreNoteState(sessionIdentity: object) {
  const [state, setState] = useState<RestoreNoteState>(() => ({ sessionIdentity, generation: 0, note: '' }));
  const sessionIdentityRef = useRef(sessionIdentity);
  useLayoutEffect(() => {
    sessionIdentityRef.current = sessionIdentity;
    return () => {
      if (sessionIdentityRef.current === sessionIdentity) sessionIdentityRef.current = {};
    };
  }, [sessionIdentity]);
  return { state, setState, note: state.sessionIdentity === sessionIdentity ? state.note : '', sessionIdentityRef };
}

export function useRestoreNoteEffect(options: RestoreEffectOptions) {
  const {
    currentSession,
    sessionIdentityRef,
    sessionStateReady,
    treesPending,
    corePending,
    coreError,
    hasBasePkRow,
    state,
    setNoteState,
    setOriginButton,
    pkButtonId,
  } = options;
  const { identity: sessionIdentity, restorePending, record, markRestored } = currentSession;
  useEffect(() => {
    if (!sessionStateReady || !restorePending || !record || treesPending || corePending || coreError) return;
    const exact = record.anchor ? document.getElementById(record.anchor) : null;
    const fallback = record.fallbackAnchor ? document.getElementById(record.fallbackAnchor) : null;
    const destination = record.anchor || record.fallbackAnchor ? (exact ?? fallback ?? document.getElementById('unit-reverse-counters')) : null;
    const note = restoreNoteForRecord(record, !!exact, hasBasePkRow);
    if (state.sessionIdentity !== sessionIdentity || state.note !== note) return scheduleRestoreNote(state, setNoteState, sessionIdentity, note);
    const frame = requestAnimationFrame(() => {
      if (sessionIdentityRef.current !== sessionIdentity) return;
      if (destination) window.scrollTo({ top: window.scrollY + destination.getBoundingClientRect().top - record.offset, behavior: 'auto' });
      const focus =
        (record.focus ? document.getElementById(record.focus) : null) ??
        (record.openPk ? document.getElementById(pkButtonId(record.openPk.category, record.openPk.id)) : null);
      if (record.focus || (record.openPk && destination)) (focus ?? destination)?.focus({ preventScroll: true });
      if (record.openPk) setOriginButton(pkButtonId(record.openPk.category, record.openPk.id));
      markRestored();
    });
    return () => cancelAnimationFrame(frame);
  }, [
    sessionIdentity,
    sessionIdentityRef,
    sessionStateReady,
    restorePending,
    record,
    treesPending,
    corePending,
    coreError,
    hasBasePkRow,
    state,
    setNoteState,
    markRestored,
    setOriginButton,
    pkButtonId,
  ]);
}

export function clearRestoreNote(sessionIdentity: object, setNoteState: Dispatch<SetStateAction<RestoreNoteState>>) {
  setNoteState((current) => ({ sessionIdentity, generation: current.generation + 1, note: '' }));
}

export function invalidateRestoreNote(state: RestoreNoteState, sessionIdentity: object, setNoteState: Dispatch<SetStateAction<RestoreNoteState>>) {
  const committedNote = state.sessionIdentity === sessionIdentity ? state.note : '';
  setNoteState((current) => (current.sessionIdentity === sessionIdentity ? { ...current, generation: current.generation + 1, note: committedNote } : current));
}

export function replaceRestoreNote(sessionIdentity: object, setNoteState: Dispatch<SetStateAction<RestoreNoteState>>, note: string) {
  setNoteState((current) => ({ sessionIdentity, generation: current.generation + 1, note }));
}

export function restoreNoteForRecord(record: ReverseCounterSession, hasExactAnchor: boolean, hasBasePkRow: boolean) {
  if (record.openPk && !hasBasePkRow) return '所选 PK 形态已不在当前正贡献目录中或无法核实，已关闭核对。';
  if (!record.anchor && !record.fallbackAnchor) return '已恢复上次筛选与展开状态；保持当前阅读位置。';
  return hasExactAnchor ? '已恢复上次筛选与阅读位置。' : '已恢复本单位、敌方筛选与阅读位置；原结果行已变化，已定位到本类或查询区。';
}

export function scheduleRestoreNote(state: RestoreNoteState, setNoteState: Dispatch<SetStateAction<RestoreNoteState>>, sessionIdentity: object, note: string) {
  const scheduledGeneration = state.generation;
  startTransition(() =>
    setNoteState((current) => (current.sessionIdentity === sessionIdentity && current.generation === scheduledGeneration ? { ...current, note } : current)),
  );
}
