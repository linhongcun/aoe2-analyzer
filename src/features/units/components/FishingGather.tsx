import { Link } from 'react-router-dom';
import { DetailSection } from '../../../shared/ui/DetailBlocks';
import { FISHING_SHIP_UNIT_ID, fishingShipGatherBaseline, formatGatherNumber, type FishingEcoSlice, type FishingGatherBaseline } from '../fishingGather';

function Rate({ value, prefix = '' }: { value: number | null; prefix?: string }) {
  return <span className="detail-number nw">{value == null ? '待确认' : `${prefix}${formatGatherNumber(value)}`}</span>;
}

function Multiplier({ value }: { value: number | null }) {
  return <span className="detail-number nw">{value == null ? '待确认' : `×${formatGatherNumber(value)}`}</span>;
}

function GatherCells({ data, after }: { data: FishingGatherBaseline; after?: boolean }) {
  return (
    <dl className="detail-cost-grid" data-t={after ? 'fishing-gather-after' : 'fishing-gather-base'}>
      <div data-task="shore">
        <dt>岸鱼速率（资源/秒）</dt>
        <dd data-field="workRate">
          <Rate value={after ? data.shoreAfter : data.shoreWorkRate} />
        </dd>
      </div>
      {!after && (
        <div data-task="deep-multiplier">
          <dt>深海倍率</dt>
          <dd data-field="multiplier">
            <Multiplier value={data.deepMultiplier} />
          </dd>
        </div>
      )}
      <div data-task="deep">
        <dt>深海速率（资源/秒）</dt>
        <dd data-field="workRate">
          <Rate value={after ? data.deepAfter : data.deepWorkRate} />
        </dd>
      </div>
      <div data-task="carry">
        <dt>携带量</dt>
        <dd data-field="carry">
          <Rate value={after ? data.carryAfter : data.carry} />
        </dd>
      </div>
    </dl>
  );
}

/** 渔船页只读基准表。不用 table.stat，避免改动其他页面的表格样式基线。 */
export function FishingGather({ unitId, source }: { unitId: number; source?: FishingEcoSlice }) {
  if (unitId !== FISHING_SHIP_UNIT_ID) return null;
  const data = fishingShipGatherBaseline(source);
  return (
    <DetailSection title="基准采集">
      <div data-t="fishing-gather">
        <p>渔船的基准 workRate（资源/秒）和携带量。纯采集，不含往返行走与放下资源。不含文明加成。</p>
        <h3>基准</h3>
        <GatherCells data={data} />
        <h3>刺网后</h3>
        <GatherCells data={data} after />
        {data.gillnets ? (
          <p className="note" data-t="fishing-gillnets-factors">
            {'刺网对照：workRate '}
            <Rate value={data.gillnets.workMul} prefix="×" />
            {'，携带量 '}
            <Rate value={data.gillnets.carryAdd} prefix="+" />
            {'。深海速率等于当时的岸鱼 workRate 乘以深海倍率。'}
          </p>
        ) : (
          <p className="note">刺网对照待确认。</p>
        )}
        <dl className="detail-cost-grid" data-task="trap">
          <div>
            <dt>养鱼场速率（资源/秒）</dt>
            <dd data-field="workRate">
              <Rate value={data.fishTrapWorkRate} />
            </dd>
          </div>
        </dl>
        {data.fishTrapWorkRate == null && <p className="note">站内 eco 没有养鱼场专用 workRate，这里不填推算值。</p>}
        <p className="note" data-t="fishing-gather-source">
          来源：eco.json fishingShip
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
          <Link className="community-tool-entry" to="/tech/65">
            刺网
          </Link>
        </div>
      </div>
    </DetailSection>
  );
}
