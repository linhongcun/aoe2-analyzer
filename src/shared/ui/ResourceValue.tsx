import { segmentUnchanged, type ValueSegment } from '../../domain/resourceValue';
import { RES_ZH } from '../../domain/ratings';
import { RK, StatIcon } from './art';
import './resourceValue.css';

/** 已通过严格识别的一侧。不匹配的记录不要用这个组件，继续走 NumericText。 */
export function ResourceValue({
  segments,
  other,
  variant,
}: {
  segments: readonly ValueSegment[];
  other?: readonly ValueSegment[];
  variant: 'history' | 'patch';
}) {
  return (
    <span className={variant === 'patch' ? 'resource-values resource-values-patch' : 'resource-values resource-values-history'}>
      {segments.map((segment, index) => {
        const unchanged = segmentUnchanged(segment, other);
        const tone = unchanged ? 'resource-value resource-value-same' : 'resource-value resource-value-changed';
        if (segment.kind === 'time') {
          return (
            <span className={tone} key={index}>
              <span className="num nw">{segment.digits} 秒</span>
            </span>
          );
        }
        const file = RK[segment.resource];
        const label = RES_ZH[segment.resource] ?? segment.resource;
        return (
          <span className={tone} key={index}>
            {file ? <StatIcon k={file} t={label} /> : null}
            <span className="num nw">{segment.digits}</span>
          </span>
        );
      })}
    </span>
  );
}
