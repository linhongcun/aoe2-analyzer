import { Link } from 'react-router-dom';
import { DetailSection } from '../../../shared/ui/DetailBlocks';
import {
  FISHING_LINES_TECH_ID,
  FISHING_SHIP_UNIT_ID,
  GILLNETS_TECH_ID,
  fishingShipGatherBaseline,
  formatCarryValue,
  formatGatherNumber,
  formatGatherRate,
  splitPatchSource,
  type FishingEcoSlice,
  type FishingGatherBaseline,
  type FishingGatherTier,
} from '../fishingGather';
import './fishing-gather.css';

function RateValue({ value }: { value: number | null }) {
  if (value == null) return <span className="fg-pending nw">待确认</span>;
  return <span className="fg-val num nw">{formatGatherRate(value)}</span>;
}

function CarryValue({ value }: { value: number | null }) {
  if (value == null) return <span className="fg-pending nw">待确认</span>;
  return (
    <span className="fg-carry num nw">
      <span className="fg-val">{formatCarryValue(value)}</span> <span className="fg-unit">食物</span>
    </span>
  );
}

function MultiplierValue({ value }: { value: number | null }) {
  if (value == null) return <span className="fg-pending nw">待确认</span>;
  return <span className="fg-mul-val num nw">{`×${formatGatherNumber(value)}`}</span>;
}

function TierCard({ scope, title, subtitle, tier }: { scope: string; title: string; subtitle: string; tier: FishingGatherTier }) {
  return (
    <div className="fg-card" data-t={scope}>
      <div className="fg-head">
        <h3 className="fg-tier-title">{title}</h3>
        <p className="fg-tier-sub" data-t="tier-sub">
          {subtitle}
        </p>
      </div>
      <dl className="fg-rows">
        <div className="fg-row" data-task="shore">
          <dt>岸鱼速率</dt>
          <dd data-field="workRate">
            <RateValue value={tier.shoreWorkRate} />
          </dd>
        </div>
        <div className="fg-row" data-task="deep">
          <dt>深海鱼速率</dt>
          <dd data-field="workRate">
            <RateValue value={tier.deepWorkRate} />
          </dd>
        </div>
        <div className="fg-row" data-task="trap">
          <dt>养鱼场速率</dt>
          <dd data-field="workRate">
            <RateValue value={tier.fishTrapWorkRate} />
          </dd>
        </div>
        <div className="fg-row" data-task="carry">
          <dt>携带量</dt>
          <dd data-field="carry">
            <CarryValue value={tier.carry} />
          </dd>
        </div>
      </dl>
    </div>
  );
}

function gillnetsSubtitle(data: FishingGatherBaseline): string {
  if (data.fishingLines && data.gillnets) return '已计入钓线和刺网';
  if (data.fishingLines && !data.gillnets) return '含钓线，刺网效果待确认';
  if (!data.fishingLines && data.gillnets) return '前置钓线效果待确认';
  return '钓线和刺网效果待确认';
}

function missingNotices(data: FishingGatherBaseline): string[] {
  const notices: string[] = [];
  if (data.base.shoreWorkRate == null) notices.push('渔船基础工作速率待确认，暂无法给出三档速率。');
  if (data.deepMultiplier == null) notices.push('深海倍率待确认，暂无法给出深海鱼速率。');
  if (data.fishTrapMultiplier == null) notices.push('养鱼场倍率待确认，暂无法给出养鱼场速率。');
  if (!data.fishingLines && !data.gillnets) notices.push('钓线和刺网的科技效果待确认，暂无法给出钓线后和刺网后的数值。');
  else if (!data.fishingLines) notices.push('钓线的科技效果待确认，暂无法给出钓线后和刺网后的数值。');
  else if (!data.gillnets) notices.push('刺网的科技效果待确认，暂无法给出刺网后的数值。');
  return notices;
}

/** 渔船页只读基准采集三档卡。 */
export function FishingGather({ unitId, source }: { unitId: number; source?: FishingEcoSlice }) {
  if (unitId !== FISHING_SHIP_UNIT_ID) return null;
  const data = fishingShipGatherBaseline(source);
  const notices = missingNotices(data);
  const patchParts = data.patch ? splitPatchSource(data.patch) : null;
  return (
    <DetailSection title="基准采集">
      <div className="fg" data-t="fishing-gather">
        <p className="fg-lead">理论工作速率，以食物 / 游戏秒计，不含往返、上交、等待和文明加成。</p>
        <div className="fg-tiers">
          <TierCard scope="fishing-gather-base" title="基准" subtitle="未研究钓线和刺网" tier={data.base} />
          <TierCard scope="fishing-gather-lines" title="钓线后" subtitle={data.fishingLines ? '已计入钓线' : '钓线效果待确认'} tier={data.afterFishingLines} />
          <TierCard scope="fishing-gather-gillnets" title="刺网后" subtitle={gillnetsSubtitle(data)} tier={data.afterGillnets} />
        </div>
        {notices.map((notice) => (
          <p key={notice} className="note fg-missing-note" data-t="fishing-gather-missing">
            {notice}
          </p>
        ))}
        <dl className="fg-multipliers">
          <div className="fg-mul-item" data-task="deep-multiplier">
            <dt>深海倍率</dt>
            <dd data-field="multiplier">
              <MultiplierValue value={data.deepMultiplier} />
            </dd>
          </div>
          <div className="fg-mul-item" data-task="trap-multiplier">
            <dt>养鱼场倍率</dt>
            <dd data-field="multiplier">
              <MultiplierValue value={data.fishTrapMultiplier} />
            </dd>
          </div>
        </dl>
        <p className="note fg-source" data-t="fishing-gather-source">
          来源：eco.json
          {patchParts ? (
            <>
              {' · '}
              <span className="num nw">{patchParts.label}</span>
              {patchParts.date && (
                <>
                  <wbr />
                  <span className="num nw">{patchParts.date}</span>
                </>
              )}
            </>
          ) : (
            ' · 版本待确认'
          )}
        </p>
        <div className="uchips fg-links">
          <Link className="community-tool-entry" to={`/tech/${FISHING_LINES_TECH_ID}`}>
            钓线
          </Link>
          <Link className="community-tool-entry" to={`/tech/${GILLNETS_TECH_ID}`}>
            刺网
          </Link>
        </div>
      </div>
    </DetailSection>
  );
}
