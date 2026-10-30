import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { civByEn } from '../../data';
import { contextPath, navigationLabel, readNavigation } from '../nav/context';
import { Icon } from './Icon';
import { CivIcon } from './art';
import './contextLinks.css';

export function NavigationContext({
  search,
  currentCiv,
  children,
  label = '当前分析情境',
  showMatchup = true,
}: {
  search?: string;
  currentCiv?: string;
  children?: ReactNode;
  label?: string;
  showMatchup?: boolean;
}) {
  const location = useLocation();
  const input = search ?? location.search;
  const context = readNavigation(input);
  const civ = civByEn(currentCiv ?? new URLSearchParams(input).get('civ') ?? '');
  const me = civByEn(context.me ?? ''),
    opp = civByEn(context.opp ?? '');
  const hasMatchup = showMatchup && me && opp;
  const backIsMatchup = !!hasMatchup && context.back?.split('?')[0] === '/matchup';
  if (!context.back && !context.invalid && !civ && !hasMatchup && !children) return null;
  return (
    <>
      <nav className="ctx-bar integration-context" aria-label={label}>
        {context.back && !backIsMatchup && (
          <Link className="community-tool-entry" to={context.back}>
            <Icon name="arrow-left" />回{navigationLabel(context.back)}
          </Link>
        )}
        {civ && (
          <Link className="ctx-civ-link ulink" aria-label={civ.zh} to={contextPath(`/civ/${civ.en}`, input, location.pathname + location.search)}>
            <CivIcon c={civ} />
            当前文明：{civ.zh}
          </Link>
        )}
        {hasMatchup && (
          <Link
            className="community-tool-entry"
            aria-label="回对局助手"
            to={backIsMatchup ? context.back! : `/matchup?${new URLSearchParams({ me: me.en, opp: opp.en })}`}
          >
            <Icon name="swords" />
            <span>
              回对局助手
              <span className="note integration-origin">
                原对局：{me.zh} 对 {opp.zh}
              </span>
            </span>
          </Link>
        )}
        {children}
      </nav>
      {context.invalid && (
        <p className="note" role="status">
          来源链接不可用，当前设置已保留。
        </p>
      )}
    </>
  );
}
