import { Link } from 'react-router-dom';
import { gameClockHref } from '../../domain/gameClock';

/** 只带入模型原始游戏秒；倍率在换算页由用户填写。 */
export function GameClockLink({ seconds, label }: { seconds: number; label: string }) {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 100000000) return null;
  const href = gameClockHref(seconds);
  if (!href) return null;
  return (
    <Link className="community-tool-entry" to={href}>
      {label}
    </Link>
  );
}
