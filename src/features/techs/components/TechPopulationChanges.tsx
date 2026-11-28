import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  TechPopulationBuildingGroup,
  TechPopulationChangeView,
  TechPopulationRuleGroup,
  TechPopulationUnitItem,
} from '../../../domain/techDetailPopulation';
import type { Building, Unit } from '../../../domain/types';
import { BuildingIcon, UnitIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';

function UnitCard({ item, unit, showBuilding }: { item: TechPopulationUnitItem; unit?: Unit; showBuilding: boolean }) {
  return (
    <Link className="td-pop-unit" data-t="pop-unit-card" data-unit-id={item.id} to={item.href}>
      {unit && <UnitIcon u={unit} />}
      <span>{item.zh}</span>
      {showBuilding && <span className="td-pop-unit-place">{item.buildingZh}</span>}
    </Link>
  );
}

function BuildingSubgroup({
  subgroup,
  unitById,
  buildingById,
}: {
  subgroup: TechPopulationBuildingGroup;
  unitById: Readonly<Record<number, Unit>>;
  buildingById: Readonly<Record<number, Building>>;
}) {
  const building = buildingById[subgroup.buildingId];
  return (
    <div className="td-pop-subgroup" data-t="pop-building-group" data-building-id={subgroup.buildingId}>
      <h3 className="td-pop-subhead">
        {building && <BuildingIcon b={building} />}
        <span>
          {subgroup.buildingZh}
          <span className="td-pop-subcount">
            （<span className="num nw">{subgroup.units.length} 个</span>）
          </span>
        </span>
      </h3>
      <div className="td-pop-units">
        {subgroup.units.map((item) => (
          <UnitCard key={item.id} item={item} unit={unitById[item.id]} showBuilding={false} />
        ))}
      </div>
    </div>
  );
}

function PopulationRuleCard({
  group,
  unitById,
  buildingById,
}: {
  group: TechPopulationRuleGroup;
  unitById: Readonly<Record<number, Unit>>;
  buildingById: Readonly<Record<number, Building>>;
}) {
  const [expanded, setExpanded] = useState(false);
  const extraCount = group.layout === 'grouped' ? group.extraSubgroups.reduce((sum, sub) => sum + sub.units.length, 0) : group.extraUnits.length;

  return (
    <div className="td-pop-rule" data-t="pop-rule-group">
      <div className="td-pop-rule-head">
        <span className="td-pop-rule-caption">
          <Icon name="users" />
          <span>每名单位研究后占用</span>
        </span>
        <div className="td-cost-pair">
          <span className="td-cost-amount num nw">1 人口</span>
          <span className="td-cost-arrow" aria-label="改为">
            <Icon name="arrow-right" />
          </span>
          <span className="td-cost-amount is-after num nw">{group.popText}</span>
        </div>
      </div>

      {group.layout === 'grouped' ? (
        <div className="td-pop-subgroups">
          {group.previewSubgroups.map((sub) => (
            <BuildingSubgroup key={sub.buildingId} subgroup={sub} unitById={unitById} buildingById={buildingById} />
          ))}
        </div>
      ) : (
        <div className="td-pop-units">
          {group.previewUnits.map((item) => (
            <UnitCard key={item.id} item={item} unit={unitById[item.id]} showBuilding />
          ))}
        </div>
      )}

      {extraCount > 0 && (
        <details
          className="td-cost-more"
          data-t="pop-extra-details"
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
              <span className="num nw">{extraCount} 个</span>受影响单位
            </span>
          </summary>
          {group.layout === 'grouped' ? (
            <div className="td-pop-subgroups">
              {group.extraSubgroups.map((sub) => (
                <BuildingSubgroup key={sub.buildingId} subgroup={sub} unitById={unitById} buildingById={buildingById} />
              ))}
            </div>
          ) : (
            <div className="td-pop-units">
              {group.extraUnits.map((item) => (
                <UnitCard key={item.id} item={item} unit={unitById[item.id]} showBuilding />
              ))}
            </div>
          )}
        </details>
      )}
    </div>
  );
}

export function TechPopulationChanges({
  view,
  unitById,
  buildingById,
}: {
  view: TechPopulationChangeView;
  unitById: Readonly<Record<number, Unit>>;
  buildingById: Readonly<Record<number, Building>>;
}) {
  return (
    <section className="td-section td-pop-changes" id="tech-population-changes" aria-label="人口空间变化" data-t="tech-population-changes">
      <h2>人口空间变化</h2>
      <p className="td-kicker">{view.introText}</p>

      <div className="td-cost-pills" data-t="pop-summary-pills">
        <span className="td-cost-pill">
          <span>
            <span className="num nw">{view.totalUnits} 个</span>受影响单位
          </span>
        </span>
        {view.groups.map((group) => (
          <Fragment key={group.value}>
            <span className="td-cost-pill">
              <span>
                每名占 <span className="num nw">{group.popText}</span>
              </span>
            </span>
            <span className="td-cost-delta" data-t="pop-delta">
              <span>
                相对 <span className="num nw">1 人口</span> <span className="num nw">{group.deltaText}</span>
              </span>
            </span>
          </Fragment>
        ))}
      </div>

      <div className="td-pop-groups">
        {view.groups.map((group) => (
          <PopulationRuleCard key={group.value} group={group} unitById={unitById} buildingById={buildingById} />
        ))}
      </div>

      {view.action && (
        <div className="td-cost-actions" data-t="pop-actions">
          <Link className="td-cost-action" data-action={view.action.kind} to={view.action.to}>
            {view.action.label}
          </Link>
        </div>
      )}

      <p className="td-kicker td-cost-boundary" data-t="pop-boundary">
        数值源自固定游戏数据的单名单位人口占用设定（基准均为 <span className="num nw">1 人口</span>
        ）；多人编队的小数人口累计与取整未做游戏内实测，本站不模拟人口上限或房屋供给。入口自动带入所属文明与代表单位，仅用于试算研究与训练费用，不推荐研究时机或兵种数量。
      </p>
    </section>
  );
}
