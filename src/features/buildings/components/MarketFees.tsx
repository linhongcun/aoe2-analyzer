import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { civByEn } from '../../../data';
import { useCore } from '../../../data/hooks';
import { DetailSection } from '../../../shared/ui/DetailBlocks';
import {
  BANKING_TECH_ID,
  COINAGE_TECH_ID,
  GUILDS_TECH_ID,
  MARKET_BUILDING_ID,
  MARKET_FEE_ANCHOR,
  SARACENS_EN,
  UGC_MARKET_CHECKED,
  UGC_MARKET_HREF,
  formatMarketRate,
  marketFeeFacts,
  type MarketFeeFacts,
  type MarketRate,
} from '../marketFees';

function Rate({ rate }: { rate: MarketRate | null }) {
  return (
    <span className="detail-number num nw" data-field="rate">
      {rate ? rate.percent : '待确认'}
    </span>
  );
}

function TechName({ id }: { id: number }) {
  const core = useCore();
  return <>{core?.techById[id]?.zh ?? String(id)}</>;
}

function SetClause({ before, rate }: { before: ReactNode; rate: MarketRate | null }) {
  if (!rate) return <span>{before}待确认。</span>;
  // 保持「）把资源」之间没有换行空格。
  // prettier-ignore
  return <span>{before}把资源 <span className="detail-number num nw">{rate.res}</span> 设为 <span className="detail-number num nw">{formatMarketRate(rate.value)}。</span></span>;
}

/**
 * 只在市场详情挂出。用既有 detail-cost-grid，不新增 table。
 * issue 338 里市场页的表格基准是空列表。
 */
export function MarketFees({ buildingId, facts }: { buildingId: number; facts?: MarketFeeFacts }) {
  const location = useLocation();
  const shown = buildingId === MARKET_BUILDING_ID;
  useEffect(() => {
    if (!shown || location.hash !== `#${MARKET_FEE_ANCHOR}`) return;
    const timer = window.setTimeout(() => document.getElementById(MARKET_FEE_ANCHOR)?.scrollIntoView({ block: 'start' }), 0);
    return () => window.clearTimeout(timer);
  }, [location.hash, shown]);
  if (!shown) return null;
  const data = facts ?? marketFeeFacts();
  const civ = civByEn(SARACENS_EN)?.zh ?? SARACENS_EN;
  return (
    <div id={MARKET_FEE_ANCHOR}>
      <DetailSection title="交易费与进贡税">
        <div data-t="market-fees">
          <p>市场买卖按交易费扣黄金，向其他玩家进贡按进贡税扣资源。下面只对照这两项被设成多少。</p>
          <p className="note">这里只对照费率，不写买卖顺序，也不写进贡节奏。</p>
          <h3>交易费</h3>
          <dl className="detail-cost-grid" data-t="market-fee-trade">
            <div data-step="trade-default">
              <dt>默认</dt>
              <dd>
                <Rate rate={data.tradeDefault} />
              </dd>
            </div>
            <div data-step="guilds">
              <dt>
                <TechName id={GUILDS_TECH_ID} />
              </dt>
              <dd>
                <Rate rate={data.guilds} />
              </dd>
            </div>
            <div data-step="saracens">
              <dt>{civ}</dt>
              <dd>
                <Rate rate={data.saracens} />
              </dd>
            </div>
          </dl>
          <h3>进贡税</h3>
          <dl className="detail-cost-grid" data-t="market-fee-tribute">
            <div data-step="tribute-default">
              <dt>默认</dt>
              <dd>
                <Rate rate={data.tributeDefault} />
              </dd>
            </div>
            <div data-step="coinage">
              <dt>
                <TechName id={COINAGE_TECH_ID} />
              </dt>
              <dd>
                <Rate rate={data.coinage} />
              </dd>
            </div>
            <div data-step="banking">
              <dt>
                <TechName id={BANKING_TECH_ID} />
              </dt>
              <dd>
                <Rate rate={data.banking} />
              </dd>
            </div>
          </dl>
          {data.baselineExported ? (
            <p className="note" data-t="market-fee-ugc">
              effects 或 civEco 里已经有资源 <span className="detail-number num nw">78</span> 或 <span className="detail-number num nw">46</span> 的设置与 UGC
              默认相同，默认交易费和进贡税改为待确认。
            </p>
          ) : (
            <p className="note" data-t="market-fee-ugc">
              默认交易费、默认进贡税 <Rate rate={data.tradeDefault} /> 的出处是 UGC #78 / #46（核对{' '}
              <span className="detail-number num nw">{UGC_MARKET_CHECKED}）。</span>
              站内 effects 与 civEco 没有这条基准 set，这不是 DE 导出。
            </p>
          )}
          <p className="note" data-t="market-fee-export">
            <SetClause before="行会" rate={data.guilds} />
            <SetClause before="铸币术" rate={data.coinage} />
            <SetClause before="银行业" rate={data.banking} />
            {data.saracens ? (
              // prettier-ignore
              <SetClause before={<>{civ}市场文明奖（civEco tech <span className="detail-number num nw">{data.saracens.tech}）</span></>} rate={data.saracens} />
            ) : (
              <>{civ}市场文明奖待确认。</>
            )}
            {data.patch ? (
              <>
                来源：effects.json 与 eco.json civEco · <span className="detail-number num nw">{data.patch}。</span>
              </>
            ) : (
              <>版本待确认。</>
            )}
          </p>
          <div className="community-tool-row">
            <Link className="community-tool-entry" to={`/tech/${GUILDS_TECH_ID}`}>
              <TechName id={GUILDS_TECH_ID} />
            </Link>
            <Link className="community-tool-entry" to={`/tech/${COINAGE_TECH_ID}`}>
              <TechName id={COINAGE_TECH_ID} />
            </Link>
            <Link className="community-tool-entry" to={`/tech/${BANKING_TECH_ID}`}>
              <TechName id={BANKING_TECH_ID} />
            </Link>
            <Link className="community-tool-entry" to={`/civ/${SARACENS_EN}`}>
              {civ}
            </Link>
            <a className="community-tool-entry" href={UGC_MARKET_HREF} target="_blank" rel="noreferrer">
              UGC 资源表
            </a>
          </div>
        </div>
      </DetailSection>
    </div>
  );
}
