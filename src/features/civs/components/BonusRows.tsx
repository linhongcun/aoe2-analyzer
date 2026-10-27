/** 文明页的加成列表：每条可点击展开效果（与科技同等），并可进入独立详情页 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { civBonuses } from '../../../domain/civBonus';
import { bonusUsage, usageLevel } from '../../../domain/bonusUsage';
import type { Civ } from '../../../domain/types';
import { Icon } from '../../../shared/ui/Icon';
import BonusBody, { BonusText } from '../../../shared/ui/BonusBody';

/** issue 317：经济/费用类加成看各工具是否真的计入（bonusUsage），不再一律标「仅文本」 */
function RowTag({ b }: { b: ReturnType<typeof civBonuses>[number] }) {
  const lv = b.encoded ? 'all' : usageLevel(bonusUsage(b));
  if (lv === 'none') return <span className="tag txt">仅文本</span>;
  return <span className="tag ok">{lv === 'all' ? '已计入' : '部分计入'}</span>;
}

export function BonusRows({ c }: { c: Civ }) {
  const list = civBonuses(c);
  const [open, setOpen] = useState<string | null>(null);
  const row = (b: (typeof list)[number]) => {
    const on = open === b.id;
    return (
      <li key={b.id} className={'brow' + (on ? ' open' : '')} data-bonus={b.idx}>
        <button type="button" className="brow-h" aria-expanded={on} aria-controls={'bb-' + b.id} onClick={() => setOpen(on ? null : b.id)}>
          <Icon name="chevron-right" className={'ic chev' + (on ? ' rot' : '')} />
          <span className="brow-t">{b.civ === 'Sicilians' ? <BonusText b={b} linked={false} /> : b.zh}</span>
          <RowTag b={b} />
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
      <p className="note">
        标签说明：已计入表示有可计算的效果，展开可查看适用单位或科技；部分计入表示只有部分工具计入，展开可查看各工具的计入情况；仅文本表示只展示游戏说明。各工具实际支持范围以工具内的提示为准。
      </p>
      <ul className="blrows">{list.filter((b) => !b.team).map(row)}</ul>
      <p>
        <b>团队加成：</b>
      </p>
      <ul className="blrows">{list.filter((b) => b.team).map(row)}</ul>
    </>
  );
}
