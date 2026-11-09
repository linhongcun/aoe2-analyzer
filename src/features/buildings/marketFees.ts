/**
 * issue 745：市场交易费与进贡税。
 * 提取逻辑已下沉 `src/domain/marketFeeFacts.ts`；本文件只保留页面锚点并转出 domain facts。
 */
export {
  BANKING_TECH_ID,
  COINAGE_TECH_ID,
  GUILDS_TECH_ID,
  MARKET_BUILDING_ID,
  MARKET_FEE_TECH_IDS,
  SARACEN_MARKET_TECH,
  SARACENS_EN,
  TRADE_FEE_RES,
  TRIBUTE_TAX_RES,
  UGC_DEFAULT_RATE,
  UGC_MARKET_CHECKED,
  UGC_MARKET_HREF,
  exportHasMarketBaseline,
  formatMarketPercent,
  formatMarketRate,
  marketFeeFacts,
  type MarketDefault,
  type MarketEco,
  type MarketFeeFacts,
  type MarketRate,
} from '../../domain/marketFeeFacts';

export const MARKET_FEE_ANCHOR = 'market-fees';
