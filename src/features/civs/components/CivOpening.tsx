import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { buildOrders } from '../../../data/buildOrders';
import { useCore } from '../../../data/hooks';
import type { Civ } from '../../../domain/types';
import { Icon } from '../../../shared/ui/Icon';
import { Linked } from '../../../shared/ui/widgets';
import { civOpeningDisplayText } from '../displayNames';
import { selectOpeningBuilds } from '../openingBuildChoices';
import '../openingBuildChoices.css';

function BuildName({ text }: { text: string }) {
  return text.split(/(\d+\s*(?:人口|村民))/g).map((part, index) =>
    index % 2 ? (
      <span className="num nw" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function stageLabel(index: number, text: string) {
  if (index === 0) return '黑暗至封建';
  return text.includes('帝王') ? '帝王时代' : '城堡及后续';
}

export function CivOpening({ c }: { c: Civ }) {
  const core = useCore();
  const { kind, builds } = selectOpeningBuilds(c, buildOrders);
  const stages = c.op.split('->').map((text, index) => {
    const raw = text.trim();
    return { label: stageLabel(index, raw), text: civOpeningDisplayText(raw, c.en, core) };
  });
  return (
    <div className="civ-opening">
      <p className="civ-opening-route" data-testid="civ-opening-summary">
        {stages.map((stage, index) => (
          <Fragment key={stage.label + index}>
            {index > 0 && <span className="civ-opening-arrow">{`\u2192`}</span>}
            <span className="civ-opening-era">{stage.label}</span>
            <Linked text={stage.text} />
          </Fragment>
        ))}
      </p>
      <div className="civ-opening-links">
        {builds.length === 0 ? (
          <p className="note civ-opening-empty">暂无匹配流程。</p>
        ) : (
          <div className="civ-opening-flows">
            {builds.map((b) => (
              <Link key={b.id} className="civ-opening-flow" to={`/builds?bo=${b.id}&civ=${encodeURIComponent(c.en)}`} aria-label={b.name.zh}>
                <Icon name="chevron-right" className="ic" />
                <span className="name">
                  <BuildName text={b.name.zh} />
                </span>
                {kind === 'generic' && <span className="civ-opening-generic">通用示意</span>}
              </Link>
            ))}
          </div>
        )}
        <div className="civ-opening-foot">
          <details className="civ-opening-notes" data-testid="civ-opening-notes">
            <summary>
              <Icon name="chevron-right" className="ic chev" />
              路线说明
            </summary>
            <p>黑暗时代准备经济，封建时代选择开局兵种，再按路线转型。具体分配请查看开局流程。</p>
            <p>兵种转型是路线参考；下面按资料适用名单列出流程，无明确匹配时标注通用示意。</p>
            {kind === 'generic' && <p>暂无资料标注适用的流程，请结合文明加成调整。</p>}
          </details>
          <Link className="civ-opening-all" to="/builds" data-testid="civ-opening-all">
            查看全部开局
          </Link>
        </div>
      </div>
    </div>
  );
}
