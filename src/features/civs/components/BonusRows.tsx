/** 文明页常显加成正文及按需作用依据入口 */
import { useCallback, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../../shared/ui/Icon';
import { civBonuses } from '../../../domain/civBonus';
import type { Civ } from '../../../domain/types';
import type { CivBonusEnt } from '../../../domain/civBonus';
import { CivBonusText } from './civBonusText';
import { BonusEvidenceDialog } from './BonusEvidenceDialog';

export function BonusRows({
  c,
  onCaptureLink = () => undefined,
}: {
  c: Civ;
  onCaptureLink?: (event: MouseEvent<HTMLElement>, bonusId: string, scrollY: number) => (() => void) | undefined;
}) {
  const list = civBonuses(c);
  const [selected, setSelected] = useState<CivBonusEnt | null>(null);
  const [originScrollY, setOriginScrollY] = useState(0);
  const dismiss = useCallback(() => setSelected(null), []);
  const row = (b: CivBonusEnt) => {
    return (
      <li key={b.id} className="brow" data-bonus={b.idx} data-bonus-id={b.id}>
        <div className="brow-content">
          <p className="brow-t">
            <CivBonusText text={b.zh} />
          </p>
          <button
            type="button"
            className="brow-action"
            data-bonus-action={b.id}
            aria-haspopup="dialog"
            aria-label={`作用与依据：${b.zh}`}
            onClick={(event) => {
              setOriginScrollY(window.scrollY);
              setSelected(b);
              event.currentTarget.blur();
            }}
          >
            <span className="brow-action-label">作用与依据</span>
            <Icon name="info" className="brow-action-icon" />
          </button>
        </div>
        {b.fresh === false && <p className="civ-bonus-warning">游戏说明与游戏数据不一致</p>}
      </li>
    );
  };
  const team = list.filter((b) => b.team);
  return (
    <>
      <ul className="blrows">{list.filter((b) => !b.team).map(row)}</ul>
      {team.length > 0 && (
        <div className="civ-team" data-testid="civ-team">
          <h3 className="civ-bonus-team">团队加成</h3>
          <p className="civ-team-note">团队加成对你和所有盟友生效（包括你自己）。</p>
          <ul className="blrows">{team.map(row)}</ul>
          {c.en === 'Georgians' && (
            <p className="community-tool-row">
              <Link className="community-tool-entry" to="/building/109#repair-cost">
                查看建筑修复费用
              </Link>
            </p>
          )}
        </div>
      )}
      {selected && (
        <BonusEvidenceDialog
          key={selected.id}
          c={c}
          b={selected}
          open
          originScrollY={originScrollY}
          onClickCapture={(event) => onCaptureLink(event, selected.id, originScrollY)}
          onDismiss={dismiss}
        />
      )}
    </>
  );
}
