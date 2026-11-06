import { Link } from 'react-router-dom';
import { DetailSection } from '../../../shared/ui/DetailBlocks';
import { formatGatherNumber } from '../villagerGather';
import { FISHING_SHIP_UNIT_ID, fishingShipGatherBaseline, type FishingEcoSlice, type FishingGatherCell } from '../fishingShipGather';

function Cell({ cell, showMultiplier }: { cell: FishingGatherCell; showMultiplier: boolean }) {
  return (
    <>
      <td>
        <span className="detail-number nw" data-field="workRate">
          {cell.workRate == null ? '待确认' : formatGatherNumber(cell.workRate)}
        </span>
        {showMultiplier && cell.multiplier != null && (
          <>
            {' '}
            <span className="detail-number nw" data-field="multiplier">
              ×{formatGatherNumber(cell.multiplier)}
            </span>
          </>
        )}
      </td>
      <td>
        <span className="detail-number nw" data-field="carry">
          {cell.carry == null ? '待确认' : formatGatherNumber(cell.carry)}
        </span>
      </td>
    </>
  );
}

function GatherTable({ contrast, rows }: { contrast: 'baseline' | 'gillnets'; rows: { key: string; label: string; cell: FishingGatherCell }[] }) {
  return (
    <table className="stat" data-t={contrast === 'baseline' ? 'fishing-gather' : 'fishing-gather-gillnets'} data-contrast={contrast}>
      <thead>
        <tr>
          <th scope="col">来源</th>
          <th scope="col">速率（资源/秒）</th>
          <th scope="col">携带量</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} data-task={row.key}>
            <th scope="row">{row.label}</th>
            <Cell cell={row.cell} showMultiplier={contrast === 'baseline'} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 渔船页只读基准表。数字只来自 eco.json，不写水图开局建议。 */
export function FishingShipGather({ unitId, source, gillnetsZh = '刺网' }: { unitId: number; source?: FishingEcoSlice; gillnetsZh?: string }) {
  if (unitId !== FISHING_SHIP_UNIT_ID) return null;
  const data = fishingShipGatherBaseline(source);
  const rows = (which: 'baseline' | 'gillnets') => [
    { key: 'shore', label: '岸鱼', cell: which === 'baseline' ? data.shore : data.gillnets.shore },
    { key: 'deep', label: '深海鱼', cell: which === 'baseline' ? data.deep : data.gillnets.deep },
    { key: 'fishTrap', label: '养鱼场', cell: which === 'baseline' ? data.fishTrap : data.gillnets.fishTrap },
  ];
  return (
    <DetailSection title="基准采集">
      <p>岸鱼和深海鱼的基准 workRate（资源/秒）和携带量。纯采集，不含往返行走与放下资源。不含文明加成。</p>
      <p>未研究刺网时的基准。</p>
      <GatherTable contrast="baseline" rows={rows('baseline')} />
      <p className="note">深海鱼速率 = 岸鱼 workRate × deepFishMultiplier。倍率只作用于速率。岸鱼和深海鱼共用渔船自身携带量。</p>
      <p className="note" data-t="fishing-trap-note">
        {data.fishTrap.workRate == null ? '养鱼场采集速率没有单独字段，标待确认，不填推算值。' : '养鱼场采集速率来自 eco.json buildings.199 的 workRate。'}
        刺网后的养鱼场速率不推算。
      </p>
      <p>{data.gillnets.applied ? '刺网后只对照这一项科技对渔船类别的效果，不含其它科技和文明加成。' : '刺网效果无法对照当前渔船类别，标待确认。'}</p>
      <GatherTable contrast="gillnets" rows={rows('gillnets')} />
      <p className="note" data-t="fishing-gather-source">
        来源：eco.json meta / fishingShip
        {data.patch ? (
          <>
            {' '}
            · <span className="detail-number nw">{data.patch}</span>
          </>
        ) : (
          ' · 版本待确认'
        )}
        {data.tasksNote ? ` · ${data.tasksNote}` : ' · 口径待确认'}
      </p>
      <div className="uchips">
        <Link className="community-tool-entry" to={`/tech/${data.gillnets.techId}`}>
          {gillnetsZh}
        </Link>
      </div>
    </DetailSection>
  );
}
