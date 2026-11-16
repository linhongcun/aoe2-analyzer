import { useLocation, useNavigate } from 'react-router-dom';
import { civByEn } from '../../data';
import { DEFAULT_PRODUCTION_COUNT } from '../../domain/production';
import { AGE_ZH } from '../../domain/ratings';
import { readProductionTransfer, withoutProductionTransfer } from '../utils/productionTransferState';
import { Icon } from './Icon';
import './productionTransfer.css';

export function ProductionTransferBanner() {
  const location = useLocation();
  const navigate = useNavigate();
  const value = readProductionTransfer(location.state);
  if (!value) return null;
  return (
    <aside className="production-transfer" role="status" data-testid="production-transfer">
      <Icon name="info" />
      <div className="production-transfer-copy">
        <strong>
          {value.source === 'duel' ? (
            <>已带入单位 PK 的 {value.side.toUpperCase()} 方</>
          ) : value.count ? (
            <>
              已带入{value.source === 'total' ? '训练总价' : '持续生产'}的 <span className="num nw">{value.count} 种兵种</span>
            </>
          ) : (
            <>{value.source === 'total' ? '训练总价' : '持续生产'}的兵种没有带入</>
          )}
        </strong>
        {value.source === 'duel' ? (
          <p>
            {civByEn(value.civ)?.zh ?? value.civ}、{AGE_ZH[value.age]}、{value.unit} <span className="num nw">× {value.qty}</span>
            ，以及影响训练单价的已选科技。另一方、对战模式和战斗结果没有带入。
          </p>
        ) : (
          <>
            {value.count > 0 && (
              <p>
                {value.source === 'total' ? (
                  <>
                    建筑数量是默认的 <span className="num nw">{DEFAULT_PRODUCTION_COUNT} 座</span>，没有按训练数量换算。请按实际的生产建筑数填写。
                  </>
                ) : (
                  <>训练数量需要填写：建筑数量不会换算成训练数量。填好后显示合计。</>
                )}
              </p>
            )}
            {value.skipped.length > 0 && (
              <p className="production-transfer-skipped">
                有 <span className="num nw">{value.skipped.length} 行</span>没有带入：
                {value.skipped.map((row, index) => (
                  <span key={index}>
                    {index > 0 ? '、' : ''}
                    {row.reason === 'pending'
                      ? '待选行'
                      : `${row.name}（${row.reason === 'current' ? '当前不可用' : `${value.source === 'total' ? '持续生产' : '训练总价'}不可选`}）`}
                  </span>
                ))}
                。{value.source === 'total' && !value.count ? '下面是默认方案。' : ''}
              </p>
            )}
          </>
        )}
      </div>
      <button
        className="btn"
        type="button"
        onClick={() =>
          navigate(
            { pathname: location.pathname, search: location.search, hash: location.hash },
            { replace: true, state: withoutProductionTransfer(location.state) },
          )
        }
      >
        知道了
      </button>
    </aside>
  );
}
