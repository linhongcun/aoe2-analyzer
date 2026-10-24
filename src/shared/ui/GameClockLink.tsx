import { Link } from 'react-router-dom';
import { gameClockHref } from '../../domain/gameClock';

/** 带入模型原始游戏秒；未指定倍率时使用换算页的标准速度（1.7）。 */
export function GameClockLink({ seconds, label, ratio }: { seconds: number; label: string; ratio?: string }) {
  const href = gameClockHref(seconds, ratio);
  if (!href) return null;
  return (
    <Link className="community-tool-entry" to={href}>
      {label}
    </Link>
  );
}
