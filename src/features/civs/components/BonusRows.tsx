/** 文明页的加成列表：每条可点击展开效果（与科技同等），并可进入独立详情页 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { civBonuses } from '../../../domain/civBonus';
import type { Civ } from '../../../domain/types';
import { Icon } from '../../../shared/ui/Icon';
import BonusBody from '../../bonuses/components/BonusBody';

export function BonusRows({ c }: { c: Civ }) {
  const list = civBonuses(c);
  const [open, setOpen] = useState<string | null>(null);
  const row = (b: (typeof list)[number]) => {
    const on = open === b.id;
    return (
      <li key={b.id} className={'brow' + (on ? ' open' : '')} data-bonus={b.idx}>
        <button type="button" className="brow-h" aria-expanded={on} aria-controls={'bb-' + b.id} onClick={() => setOpen(on ? null : b.id)}>
          <Icon name="chevron-right" className={'ic chev' + (on ? ' rot' : '')} />
          <span className="brow-t">{b.zh}</span>
          {b.encoded ? <span className="tag ok">已计入</span> : <span className="tag txt">仅文本</span>}
        </button>
        {on && (
          <div id={'bb-' + b.id} className="brow-b">
            <BonusBody b={b} compact />
            <Link className="ulink" to={`/civ/${c.en}/bonus/${b.idx}`}>
              查看详情页 <Icon name="arrow-right" />
            </Link>
          </div>
        )}
      </li>
    );
  };
  return (
    <>
      <ul className="blrows">{list.filter((b) => !b.team).map(row)}</ul>
      <p>
        <b>团队加成：</b>
      </p>
      <ul className="blrows">{list.filter((b) => b.team).map(row)}</ul>
    </>
  );
}
