import { Link } from 'react-router-dom';
import { DetailSection } from '../../../shared/ui/DetailBlocks';
import { formatGatherNumber, VILLAGER_UNIT_ID, villagerGatherBaseline, type VillagerEcoSlice, type VillagerGatherRow } from '../villagerGather';

function RateCell({ field, value }: { field: 'workRate' | 'carry' | 'femaleWorkRate' | 'femaleCarry'; value: number | null }) {
  return (
    <td data-field={field}>
      <span className="detail-number nw">{value == null ? '待确认' : formatGatherNumber(value)}</span>
    </td>
  );
}

function GatherRow({ row, femaleSame }: { row: VillagerGatherRow; femaleSame: boolean }) {
  return (
    <tr data-task={row.key}>
      <th scope="row">{row.label}</th>
      <RateCell field="workRate" value={row.workRate} />
      <RateCell field="carry" value={row.carry} />
      {!femaleSame && <RateCell field="femaleWorkRate" value={row.femaleWorkRate} />}
      {!femaleSame && <RateCell field="femaleCarry" value={row.femaleCarry} />}
    </tr>
  );
}

/** 村民页只读基准表。女村民没有单独资料页，同页对照 villager.female。 */
export function VillagerGather({ unitId, source }: { unitId: number; source?: VillagerEcoSlice }) {
  if (unitId !== VILLAGER_UNIT_ID) return null;
  const data = villagerGatherBaseline(source);
  return (
    <DetailSection title="基准采集">
      <p>各任务的基准 workRate（资源/秒）和携带量。纯采集，不含往返行走与放下资源。不含文明加成。含往返的收入见持续生产和经济科技收益。</p>
      {data.rows.length ? (
        <table className="stat" data-t="villager-gather">
          <thead>
            <tr>
              <th scope="col">任务</th>
              <th scope="col">速率（资源/秒）</th>
              <th scope="col">携带量</th>
              {!data.femaleSame && <th scope="col">女村民速率</th>}
              {!data.femaleSame && <th scope="col">女村民携带量</th>}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <GatherRow key={row.key} row={row} femaleSame={data.femaleSame} />
            ))}
          </tbody>
        </table>
      ) : (
        <p>采集任务待确认</p>
      )}
      {data.rows.some((row) => row.key === 'build') && <p className="note">建造一行沿用同一 workRate 字段，表示施工，不是资源采集。</p>}
      <p className="note" data-t="villager-gather-female">
        {!data.rows.length
          ? '女村民任务形态待确认。'
          : data.femaleSame
            ? '没有单独的女村民资料页。女村民各任务形态的基准速率与携带量与上表相同。'
            : '没有单独的女村民资料页。女村民任务形态与男村民不一致的项目分列在表中；缺数字为待确认。'}
      </p>
      <p className="note" data-t="villager-gather-source">
        来源：eco.json villager.tasks
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
        <Link className="community-tool-entry" to="/production">
          持续生产
        </Link>
        <Link className="community-tool-entry" to="/eco-payoff">
          经济科技收益
        </Link>
      </div>
    </DetailSection>
  );
}
