import { Link } from 'react-router-dom';
import { civByEn, type Core } from '../../../data';
import { entityCivLink } from '../../../domain/civRoute';
import type { trainingSites } from '../../../domain/unitTrainingSites';
import { TechIcon } from '../../../shared/ui/art';
import { BuildingTag } from './unitDetailParts';

export function UnitTrainingConditions({ training, core }: { training: ReturnType<typeof trainingSites>; core: Core }) {
  if (!training) return null;
  if (training.kind === 'unavailable') return <p className="ud-kicker">当前文明无法训练这个单位。</p>;

  const { conditional, exceptions } = training;
  const tech = conditional && core.techById[conditional.tech];
  const alternate = conditional && core.buildingById[conditional.building];
  return (
    <>
      {exceptions?.map(({ civ, building }) => {
        const row = core.buildingById[building];
        if (!row || !civ) return null;
        return (
          <p className="ud-training-condition" key={civ}>
            <span>{civByEn(civ)?.zh ?? civ}：</span>
            <BuildingTag building={row} id={row.id} zh={row.zh} civ={civ} />
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
    </>
  );
}
