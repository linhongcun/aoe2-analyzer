import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { AGE_SHORT_ZH, AGE_ZH } from '../../../domain/ratings';
import type { Unit } from '../../../domain/types';
import { formatAutoStatDelta, formatAutoStatValue, unitAgeChanges, type UnitAgeChangeRow } from '../../../domain/unitAgeChanges';
import { DetailSection } from '../../../shared/ui/DetailBlocks';
import { Icon } from '../../../shared/ui/Icon';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';
import './unit-age-changes.css';

function ChangeArrow() {
  return (
    <span className="ud-age-arrow" role="img" aria-label="至">
      <Icon name="arrow-right" />
    </span>
  );
}

function ValueTransition({ row }: { row: UnitAgeChangeRow }) {
  return (
    <span className="ud-age-val">
      <span className="num nw" data-age-before>
        {formatAutoStatValue(row.before, row.key)}
      </span>
      <ChangeArrow />
      <strong className="num nw" data-age-after>
        {formatAutoStatValue(row.after, row.key)}
      </strong>
    </span>
  );
}

export function UnitAgeChanges({ unit, civ }: { unit: Unit; civ?: string }) {
  const result = unitAgeChanges(unit, civ);
  if (!result) return null;

  return (
    <DetailSection title="升时代自动变化" className="ud-age-changes">
      {result.state === 'pending' ? (
        <p className="ud-age-pending">自动变化数据待确认</p>
      ) : (
        <>
          <p className="note ud-age-intro">无需研究科技，进入对应时代即自动生效；不含文明加成和其他科技。</p>
          {result.layout === 'compact' ? (
            result.activeRows.length === 1 ? (
              (() => {
                const row = result.activeRows[0]!;
                const sources = row.sources ?? [];
                return (
                  <div className="ud-age-compact" data-age-compact="active" data-age={result.earliestAge}>
                    <p className="ud-age-compact-main" data-age-stat={row.key}>
                      <strong className="ud-age-compact-title">{AGE_ZH[result.earliestAge]}出现时已生效</strong>
                      <span className="ud-age-compact-stat">
                        <span className="ud-age-label">{row.label}</span>
                        <ValueTransition row={row} />
                      </span>
                    </p>
                    <p className="ud-age-compact-sub">
                      目录记录 <span className="num nw">{formatAutoStatValue(row.before, row.key)}</span>，含
                      {sources.length === 1 ? (
                        <>
                          {AGE_ZH[sources[0]!.age]}自动{' '}
                          <span className="num nw" data-age-delta>
                            {formatAutoStatDelta(sources[0]!.delta, row.key)}
                          </span>
                        </>
                      ) : (
                        sources.map((src, index) => (
                          <Fragment key={src.age}>
                            {index > 0 && '；'}
                            <span className="nw">
                              {AGE_SHORT_ZH[src.age]}{' '}
                              <span className="num nw" data-age-delta>
                                {formatAutoStatDelta(src.delta, row.key)}
                              </span>
                            </span>
                          </Fragment>
                        ))
                      )}
                    </p>
                  </div>
                );
              })()
            ) : (
              (() => {
                const stage = result.upgradeStages[0]!;
                const row = stage.rows[0]!;
                return (
                  <div className="ud-age-compact" data-age-compact="upgrade" data-age={stage.age}>
                    <p className="ud-age-compact-main" data-age-stat={row.key}>
                      <strong className="ud-age-compact-title">进入{AGE_ZH[stage.age]}</strong>
                      <span className="ud-age-compact-stat">
                        <span className="ud-age-label">{row.label}</span>
                        <ValueTransition row={row} />
                      </span>
                      <span className="ud-age-compact-delta num nw" data-age-delta>
                        {formatAutoStatDelta(row.delta, row.key)}
                      </span>
                    </p>
                  </div>
                );
              })()
            )
          ) : (
            <div className="ud-age-grid">
              {result.activeRows.length > 0 && (
                <article className="ud-age-card ud-age-card-active" data-age-card="active" data-age={result.earliestAge}>
                  <h3>{AGE_ZH[result.earliestAge]}出现时已生效</h3>
                  <p className="ud-age-card-sub">最早在{AGE_ZH[result.earliestAge]}出现。目录记录不含下列变化，出现时即为右侧数值。</p>
                  <ul className="ud-age-rows">
                    {result.activeRows.map((row) => (
                      <li key={row.key} className="ud-age-row" data-age-stat={row.key}>
                        <span className="ud-age-label">{row.label}</span>
                        <ValueTransition row={row} />
                        <span className="ud-age-source" data-age-delta>
                          {(row.sources ?? []).map((src, index) => (
                            <Fragment key={src.age}>
                              {index > 0 && '；'}
                              <span className="nw">
                                {AGE_SHORT_ZH[src.age]} <span className="num nw">{formatAutoStatDelta(src.delta, row.key)}</span>
                              </span>
                            </Fragment>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              )}
              {result.upgradeStages.map((stage) => (
                <article key={stage.age} className="ud-age-card ud-age-card-upgrade" data-age-card="upgrade" data-age={stage.age}>
                  <h3>进入{AGE_ZH[stage.age]}</h3>
                  <p className="ud-age-card-sub">
                    {AGE_ZH[stage.fromAge]} <ChangeArrow /> {AGE_ZH[stage.age]}
                  </p>
                  <ul className="ud-age-rows">
                    {stage.rows.map((row) => (
                      <li key={row.key} className="ud-age-row" data-age-stat={row.key}>
                        <span className="ud-age-label">{row.label}</span>
                        <ValueTransition row={row} />
                        <span className="ud-age-delta num nw" data-age-delta>
                          {formatAutoStatDelta(row.delta, row.key)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
          <p className="note ud-age-footnote">
            来源：DE <span className="num nw">{DATA_SOURCES.patch.build}</span> 固定数据中的升时代自动规则。
          </p>
        </>
      )}
      <Link className="community-tool-entry" to="/about-data">
        数据说明
      </Link>
    </DetailSection>
  );
}
