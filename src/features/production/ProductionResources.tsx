import type { ProductionResult } from '../../domain/production';
import { RES_ZH } from '../../domain/ratings';

export const formatProductionNumber = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

export function ProductionResources({ resources }: { resources: ProductionResult['resources'] }) {
  return (
    <div className="production-resources">
      {resources.map((resource) => (
        <div className="production-resource" key={resource.key} data-testid={'production-resource-' + resource.key}>
          <h3>{RES_ZH[resource.key]}</h3>
          <strong className="production-number">{resource.rounded} 人</strong>
          <span>
            理论 <b className="production-number">{formatProductionNumber(resource.villagers)} 人</b>
          </span>
          <span>
            开销 <b className="production-number">{formatProductionNumber(resource.spend)} / 分钟</b>
          </span>
          <small>
            每村民 <span className="production-number">{formatProductionNumber(resource.income)} / 分钟</span>
          </small>
        </div>
      ))}
    </div>
  );
}
