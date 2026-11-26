import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCostDeltaParts, orderedCostEntries, type TechCostChangeView, type TechCostRow, type TechSubCostRow } from '../../../domain/techDetailCost';
import { RES_ZH } from '../../../domain/ratings';
import type { Building, Cost, Tech, Unit } from '../../../domain/types';
import { BuildingIcon, RK, StatIcon, TechIcon, UnitIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';

const COST_NUM_UNIT_RE = /((?:[+-]|×)?\d+(?:\.\d+)?(?:\s*(?:%|个|座|项|食|木|金|石))?)/g;

/** 包裹数字与「数字+量词/百分比/乘号」，确保 360/390 窄屏不拆行。 */
function CostWrappedText({ text }: { text: string }) {
  return (
    <>
      {text.split(COST_NUM_UNIT_RE).map((part, index) =>
        index % 2 ? (
          <span className="num nw" key={index}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

function CostAmount({ cost, emphasis = false }: { cost: Cost; emphasis?: boolean }) {
  const entries = orderedCostEntries(cost);
  if (!entries.length) return <span className="num nw">0</span>;
  return (
    <span className={`td-cost-amount${emphasis ? ' is-after' : ''}`}>
      {entries.map(({ key, value }) => (
        <span className="res num nw" key={key}>
          <StatIcon k={RK[key]!} t={RES_ZH[key]} />
          <span>{value}</span>
        </span>
      ))}
    </span>
  );
}

function DeltaPill({ row }: { row: Pick<TechCostRow | TechSubCostRow, 'deltas'> }) {
  const parts = formatCostDeltaParts(row.deltas);
  return (
    <span className="td-cost-delta" data-t="cost-delta">
      {parts.map((part, index) => (
        <Fragment key={part}>
          {index > 0 && <span className="td-cost-sep"> / </span>}
          <span className="num nw">{part}</span>
        </Fragment>
      ))}
    </span>
  );
}

function EntityCostRow({
  row,
  unitById,
  buildingById,
}: {
  row: TechCostRow;
  unitById: Readonly<Record<number, Unit>>;
  buildingById: Readonly<Record<number, Building>>;
}) {
  const unit = row.entityKind === 'unit' ? unitById[row.id] : undefined;
  const building = row.entityKind === 'building' ? buildingById[row.id] : undefined;
  return (
    <div className="td-cost-row" data-t="cost-change-row" data-entity-kind={row.entityKind} data-entity-id={row.id}>
      <Link className="td-cost-entity" to={row.href}>
        {building ? <BuildingIcon b={building} /> : unit ? <UnitIcon u={unit} /> : null}
        <span>{row.zh}</span>
      </Link>
      <div className="td-cost-values">
        <div className="td-cost-pair">
          <CostAmount cost={row.base} />
          <span className="td-cost-arrow" aria-label="改为">
            <Icon name="arrow-right" />
          </span>
          <CostAmount cost={row.after} emphasis />
        </div>
        <DeltaPill row={row} />
      </div>
    </div>
  );
}

function SubTechCostRow({ row, techById }: { row: TechSubCostRow; techById: Readonly<Record<number, Tech>> }) {
  const tech = techById[row.id];
  return (
    <div className="td-cost-row" data-t="cost-tech-row" data-tech-id={row.id}>
      <Link className="td-cost-entity" to={row.href}>
        {tech && <TechIcon t={tech} />}
        <span>{row.zh}</span>
      </Link>
      <div className="td-cost-values">
        <div className="td-cost-pair">
          <CostAmount cost={row.base} />
          <span className="td-cost-arrow" aria-label="改为">
            <Icon name="arrow-right" />
          </span>
          <CostAmount cost={row.after} emphasis />
        </div>
        <DeltaPill row={row} />
      </div>
    </div>
  );
}

export function TechCostChanges({
  view,
  unitById,
  buildingById,
  techById,
}: {
  view: TechCostChangeView;
  unitById: Readonly<Record<number, Unit>>;
  buildingById: Readonly<Record<number, Building>>;
  techById: Readonly<Record<number, Tech>>;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="td-section td-cost-changes" id="tech-cost-changes" aria-label="费用变化" data-t="tech-cost-changes">
      <h2>费用变化</h2>
      <p className="td-kicker">
        <CostWrappedText text={view.introText} />
      </p>

      <div className="td-cost-pills" data-t="cost-summary-pills">
        <span className="td-cost-pill">
          <CostWrappedText text={view.countPill} />
        </span>
        {view.rulePills.map((pill) => (
          <span className={`td-cost-pill${pill === '含未解码效果' ? ' is-warn' : ''}`} key={pill}>
            <CostWrappedText text={pill} />
          </span>
        ))}
        {view.extraRows.length > 0 && (
          <span className="td-cost-pill" data-t="cost-collapse-state">
            {expanded ? '明细已展开' : '默认收起明细'}
          </span>
        )}
      </div>

      <div className="td-cost-list">
        {view.previewRows.map((row) => (
          <EntityCostRow key={`${row.entityKind}-${row.id}`} row={row} unitById={unitById} buildingById={buildingById} />
        ))}
      </div>

      {view.extraRows.length > 0 && (
        <details
          className="td-cost-more"
          data-t="cost-extra-details"
          open={expanded}
          onToggle={(event) => {
            if (event.currentTarget.open === expanded) return;
            setExpanded(event.currentTarget.open);
          }}
        >
          <summary>
            <Icon name="chevron-right" />
            <span>
              {expanded ? '收起其余 ' : '展开其余 '}
              <span className="num nw">{view.extraRows.length} 个</span>
              受影响单位明细
            </span>
          </summary>
          <div className="td-cost-list">
            {view.extraRows.map((row) => (
              <EntityCostRow key={`${row.entityKind}-${row.id}`} row={row} unitById={unitById} buildingById={buildingById} />
            ))}
          </div>
        </details>
      )}

      {view.techRows.length > 0 && (
        <details className="td-cost-more" data-t="cost-tech-details">
          <summary>
            <Icon name="chevron-right" />
            <span>
              同步改费的 <span className="num nw">{view.techRows.length} 项</span>科技研究费用明细
            </span>
          </summary>
          <div className="td-cost-list">
            {view.techRows.map((row) => (
              <SubTechCostRow key={row.id} row={row} techById={techById} />
            ))}
          </div>
        </details>
      )}

      {view.actions.length > 0 && (
        <div className="td-cost-actions" data-t="cost-actions">
          {view.actions.map((action) => (
            <Link key={`${action.kind}-${action.to}`} className="td-cost-action" data-action={action.kind} to={action.to}>
              {action.label}
            </Link>
          ))}
        </div>
      )}

      <p className="td-kicker td-cost-boundary" data-t="cost-boundary">
        <CostWrappedText text={view.boundaryNote} />
      </p>
    </section>
  );
}
