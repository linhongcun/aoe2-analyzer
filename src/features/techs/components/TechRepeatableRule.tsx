import { Link } from 'react-router-dom';
import { Icon } from '../../../shared/ui/Icon';
import { DATA_SOURCES, versionLabel } from '../../../shared/utils/dataInfo';

const mode = <span className="num nw">256 倍</span>;
const once = <span className="num nw">1 次</span>;
const states = {
  repeatable: {
    icon: 'rotate-ccw',
    label: '可重复研究',
    description: (
      <>
        普通对局仍只能研究 {once}；仅在启用 {mode}科技（going above and beyond）规则后，该科技在固定源中标记为可重复研究。
      </>
    ),
  },
  once: {
    icon: 'minus',
    label: '不可重复研究',
    description: (
      <>
        普通对局只能研究 {once}；即使启用 {mode}科技（going above and beyond）规则，该科技在固定源中也标记为不可重复研究。
      </>
    ),
  },
  unknown: {
    icon: 'triangle-alert',
    label: '暂无源值',
    description: (
      <>
        普通对局只能研究 {once}；当前版本未收录该科技的 {mode}科技重复标记，不作可／不可重复判断。
      </>
    ),
  },
} as const;

export function TechRepeatableRule({ repeatable, researchScope }: { repeatable?: unknown; researchScope?: string }) {
  const state = repeatable === true ? 'repeatable' : repeatable === false ? 'once' : 'unknown';
  const { icon, label, description } = states[state];
  return (
    <div className="td-special-rule" role="region" aria-label="256 倍科技特殊规则" data-t="tech-repeatable-rule">
      <header>
        <h3>
          <Icon name="info" />
          <span>特殊规则：{mode}科技（going above and beyond）</span>
        </h3>
        <span className={`td-rep-badge is-${state}`}>
          <Icon name={icon} />
          <span>
            {mode}模式：{label}
          </span>
        </span>
      </header>
      <p>
        {researchScope}
        {description}
      </p>
      <p className="td-special-boundary">
        仅反映固定源标记；不承诺可研究满 <span className="num nw">256 次</span>，不推算叠加后的属性、费用或研究时间，也不涵盖地图触发器。
      </p>
      <p className="td-special-source">
        来源：aoe2techtree 固定源
        {DATA_SOURCES.patch && (
          <>
            {' '}
            · <span className="num nw">{versionLabel(DATA_SOURCES)}</span>
          </>
        )}{' '}
        · <a href="https://github.com/SiegeEngineers/aoe2techtree/issues/122#issuecomment-1540319367">规则说明</a> · <Link to="/about-data">数据说明</Link>
      </p>
    </div>
  );
}
