import { startTransition, type Dispatch, type SetStateAction } from 'react';
import type { ReverseCounterSession } from '../reverseCounterSession';

export interface RestoreNoteState {
  generation: number;
  note: string;
}

export function clearRestoreNote(setNoteState: Dispatch<SetStateAction<RestoreNoteState>>) {
  setNoteState((current) => ({ generation: current.generation + 1, note: '' }));
}

export function invalidateRestoreNote(state: RestoreNoteState, setNoteState: Dispatch<SetStateAction<RestoreNoteState>>) {
  setNoteState((current) => ({ generation: current.generation + 1, note: state.note }));
}

export function replaceRestoreNote(setNoteState: Dispatch<SetStateAction<RestoreNoteState>>, note: string) {
  setNoteState((current) => ({ generation: current.generation + 1, note }));
}

export function restoreNoteForRecord(record: ReverseCounterSession, hasExactAnchor: boolean, hasBasePkRow: boolean) {
  if (record.openPk && !hasBasePkRow) return '所选 PK 形态已不在当前正贡献目录中或无法核实，已关闭核对。';
  if (!record.anchor && !record.fallbackAnchor) return '已恢复上次筛选与展开状态；保持当前阅读位置。';
  return hasExactAnchor ? '已恢复上次筛选与阅读位置。' : '已恢复本单位、敌方筛选与阅读位置；原结果行已变化，已定位到本类或查询区。';
}

export function scheduleRestoreNote(state: RestoreNoteState, setNoteState: Dispatch<SetStateAction<RestoreNoteState>>, note: string) {
  const scheduledGeneration = state.generation;
  startTransition(() => setNoteState((current) => (current.generation === scheduledGeneration ? { ...current, note } : current)));
}
