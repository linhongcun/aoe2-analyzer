import { useMemo, useRef, useState, type ReactNode } from 'react';
import { groupFight, oneVOneFight } from '../../../domain/duel';
import { formatDuelBudgetErrorText, type DuelBudgetPart } from '../../../domain/duelBudget';
import type { KiteOptions } from '../../../domain/contactKite';
import { fmtSide, type Mode } from '../../../domain/duelState';
import { Icon } from '../../../shared/ui/Icon';
import { isUnavail, type SideState } from '../logic/duelSide';
import { summarizeGroup, summarizeOneVOne } from '../logic/duelSummary';
import { DuelStickyResult } from './DuelStickyResult';
import { Group, OneVOne } from './DuelResults';

export function DuelStage({
  A,
  B,
  mode,
  cntA,
  cntB,
  bud,
  kite,
  budgetErrorParts,
  children,
}: {
  A: SideState;
  B: SideState;
  mode: Mode;
  cntA: number | null;
  cntB: number | null;
  bud: number;
  kite?: KiteOptions;
  budgetErrorParts?: readonly DuelBudgetPart[] | null;
  children: ReactNode;
}) {
  const [resEl, setResEl] = useState<HTMLDivElement | null>(null);
  const resHeadingRef = useRef<HTMLHeadingElement>(null);
  const kA = Number(Boolean(kite?.a));
  const kB = Number(Boolean(kite?.b));
  const oneResult = useMemo(() => (mode === '1' && !isUnavail(A) && !isUnavail(B) ? oneVOneFight(A.F, B.F, kite ? { kite } : {}) : null), [mode, A, B, kite]);
  const groupResult = useMemo(() => {
    if (mode === '1' || isUnavail(A) || isUnavail(B)) return null;
    if (budgetErrorParts) return { status: 'error' as const, reason: formatDuelBudgetErrorText(budgetErrorParts), winner: null };
    return groupFight(A.F, cntA ?? 0, B.F, cntB ?? 0, { recordReplay: true, ...(kite ? { kite } : {}) });
  }, [mode, A, B, cntA, cntB, kite, budgetErrorParts]);
  const stickySummary = useMemo(() => {
    if (isUnavail(A) || isUnavail(B)) return null;
    if (mode === '1' && oneResult) return summarizeOneVOne(A, B, oneResult);
    if (mode !== '1' && groupResult && cntA !== null && cntB !== null) return summarizeGroup(A, B, groupResult, { na: cntA, nb: cntB });
    return null;
  }, [mode, A, B, cntA, cntB, oneResult, groupResult]);
  return (
    <>
      <DuelStickyResult summary={stickySummary} targetEl={resEl} headingRef={resHeadingRef} />
      {children}
      {isUnavail(A) || isUnavail(B) ? (
        <div id="duel-pending" className="posbox duel-pending">
          <p data-t="pk-pending">
            <Icon name="info" className="ic" />
            先在上面选好能造的单位或文明，再出对战结果。
          </p>
        </div>
      ) : mode === '1' ? (
        <OneVOne
          key={[fmtSide(A.spec), fmtSide(B.spec), kA, kB].join('|')}
          A={A}
          B={B}
          kite={kite}
          result={oneResult ?? undefined}
          resultElRef={setResEl}
          headingRef={resHeadingRef}
        />
      ) : (
        <Group
          key={[mode, fmtSide(A.spec), fmtSide(B.spec), cntA ?? 'null', cntB ?? 'null', kA, kB].join('|')}
          A={A}
          B={B}
          na={cntA ?? 0}
          nb={cntB ?? 0}
          bud={mode === 'r' ? bud : 0}
          kite={kite}
          result={groupResult ?? undefined}
          errorParts={budgetErrorParts ?? undefined}
          resultElRef={setResEl}
          headingRef={resHeadingRef}
        />
      )}
    </>
  );
}
