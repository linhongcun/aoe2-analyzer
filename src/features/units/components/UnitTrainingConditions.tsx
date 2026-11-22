import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { civByEn, type Core } from '../../../data';
import { entityCivLink } from '../../../domain/civRoute';
import { formatProductionNumber } from '../../../domain/formatTime';
import { mapucheSettlementUnitTimes } from '../../../domain/production';
import { AGE_ZH } from '../../../domain/ratings';
import type { Unit } from '../../../domain/types';
import { MAPUCHE_CIV, SETTLEMENT, type trainingSites } from '../../../domain/unitTrainingSites';
import { TechIcon } from '../../../shared/ui/art';
import { BuildingTag } from './unitDetailParts';

export function UnitTrainingConditions({
  training,
  core,
  unit,
  civ,
}: {
  training: ReturnType<typeof trainingSites>;
  core: Core;
  unit: Pick<Unit, 'id' | 'age'>;
  civ?: string;
}) {
  if (!training) return null;
  if (training.kind === 'unavailable') return <p className="ud-kicker">当前文明无法训练这个单位。</p>;

  const { conditional, exceptions, additional } = training;
  const tech = conditional && core.techById[conditional.tech];
  const alternate = conditional && core.buildingById[conditional.building];
  return (
    <>
      {exceptions?.map(({ civ: owner, building }) => {
        const row = core.buildingById[building];
        if (!row || !owner) return null;
        return (
          <p className="ud-training-condition" key={owner}>
            <span>{civByEn(owner)?.zh ?? owner}：</span>
            <BuildingTag building={row} id={row.id} zh={row.zh} civ={owner} />
          </p>
        );
      })}
      {conditional && (
        <p className="ud-training-condition">
          <span className="ud-training-requirement">
            研究
            {tech ? (
              <Link className="ud-tag" to={entityCivLink('tech', tech.id, conditional.civ)}>
                <TechIcon t={tech} />
                {tech.zh}
              </Link>
            ) : (
              <span>相应科技</span>
            )}
            后：
          </span>
          <BuildingTag building={alternate} id={conditional.building} zh={alternate?.zh ?? '资料待核'} civ={conditional.civ} />
        </p>
      )}
      {additional?.map(({ civ: owner, building }) => {
        const row = core.buildingById[building];
        if (!row) return null;
        const prefix = civ === owner ? '另可在：' : `${civByEn(owner)?.zh ?? owner}另可在：`;
        const schedule = owner === MAPUCHE_CIV && building === SETTLEMENT ? mapucheSettlementUnitTimes(unit) : [];
        return (
          <Fragment key={`${owner}-${building}`}>
            <p className="ud-training-condition">
              <span>{prefix}</span>
              <BuildingTag building={row} id={row.id} zh={row.zh} civ={owner} />
            </p>
            {schedule.length > 0 && (
              <p className="ud-kicker">
                聚落训练较慢，时间随时代缩短：
                {schedule.map((item, idx) => (
                  <Fragment key={item.age}>
                    {idx > 0 && ' · '}
                    {AGE_ZH[item.age]} <span className="num nw">{formatProductionNumber(item.seconds)} 秒</span>
                  </Fragment>
                ))}
                。不含科技；征招不作用于聚落。
              </p>
            )}
          </Fragment>
        );
      })}
    </>
  );
}
