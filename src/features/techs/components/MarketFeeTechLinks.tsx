import { Link } from 'react-router-dom';
import { useCore } from '../../../data/hooks';

/** 行会、铸币术、银行业与市场页的交易费 / 进贡税互链。issue 745。正文数字只在市场页。 */
const MARKET_FEE_TECH_IDS = [15, 23, 17] as const;
const MARKET_FEE_HREF = '/building/84#market-fees';

function isMarketFeeTech(id: number): id is (typeof MARKET_FEE_TECH_IDS)[number] {
  return (MARKET_FEE_TECH_IDS as readonly number[]).includes(id);
}

export function MarketFeeTechLinks({ techId }: { techId: number }) {
  const core = useCore();
  if (!isMarketFeeTech(techId)) return null;
  return (
    <div className="community-tool-row" data-t="market-fee-tech-links">
      <Link className="community-tool-entry" to={MARKET_FEE_HREF}>
        查看市场交易费与进贡税
      </Link>
      {MARKET_FEE_TECH_IDS.filter((id) => id !== techId).map((id) => (
        <Link key={id} className="community-tool-entry" to={`/tech/${id}`}>
          {core?.techById[id]?.zh ?? String(id)}
        </Link>
      ))}
    </div>
  );
}
