import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { FormationEntityView } from '../../../domain/civFormations';
import { AGE_ZH } from '../../../domain/ratings';
import { BuildingIcon, TechIcon, UnitIcon } from '../../../shared/ui/art';
import { FormationCost, FormationDecisionText, FormationText } from './FormationPresentation';

export type RememberEntity = (event: MouseEvent<HTMLAnchorElement>, routeId: string, scenarioId: string | null, to: string) => void;

export function FormationEntityLine({
  row,
  civ,
  routeId,
  scenarioId,
  id,
  remember,
  showAge,
}: {
  row: FormationEntityView;
  civ: string;
  routeId: string;
  scenarioId: string | null;
  id: string;
  remember: RememberEntity;
  showAge: boolean;
}) {
  const to = `/${row.kind}/${row.entity.id}?civ=${encodeURIComponent(civ)}`;
  const link = (
    <Link id={id} className="formation-entity" to={to} onClick={(event) => remember(event, routeId, scenarioId, to)}>
      {row.kind === 'unit' && <UnitIcon u={row.entity} />}
      {row.kind === 'building' && <BuildingIcon b={row.entity} />}
      {row.kind === 'tech' && <TechIcon t={row.entity} />}
      <span>
        <b>
          <FormationText text={row.entity.zh} />
        </b>
        <small>
          <FormationText text={row.role} />
          {showAge && (
            <>
              {' '}
              · <span className="formation-age">{AGE_ZH[row.age]}</span>
            </>
          )}
        </small>
      </span>
    </Link>
  );
  if (row.kind !== 'unit' || !row.research) return link;

  const { tech, effect, caveat, decision, optional, trainingPrice } = row.research;
  const researchTo = `/tech/${tech.id}?civ=${encodeURIComponent(civ)}`;
  const label = optional ? '可选科技' : tech.type === 'UniqueTech' ? '独特科技' : '科技';
  const standaloneEffect = optional || trainingPrice || decision;
  const effectLine = decision ? (
    <FormationDecisionText action={effect} decision={decision} />
  ) : (
    <p className="formation-research-effect">
      <FormationText text={effect} />
    </p>
  );
  return (
    <div className="formation-research">
      {standaloneEffect ? (
        link
      ) : (
        <div className="formation-research-unit">
          {link}
          {effectLine}
        </div>
      )}
      <Link id={`${id}-research-${tech.id}`} className="formation-entity" to={researchTo} onClick={(event) => remember(event, routeId, scenarioId, researchTo)}>
        <TechIcon t={tech} />
        <span>
          <b>{tech.zh}</b> <span className="formation-meta">{label}</span>
          <small>
            {AGE_ZH[tech.age]} · {tech.bz}
            {optional && '研究'}
          </small>
          <span className="formation-research-cost">
            <span>{trainingPrice ? '一次性研究' : '研究投入'}</span>
            <FormationCost cost={tech.cost} />
            <span className="num nw">{tech.rt} 游戏秒</span>
          </span>
        </span>
      </Link>
      {trainingPrice && (
        <div className="formation-training-price">
          <h5>训练单价（每名{row.entity.zh}）</h5>
          <dl>
            <div>
              <dt>研究前</dt>
              <dd>
                <FormationCost cost={trainingPrice.before} showZero />
              </dd>
            </div>
            <div>
              <dt>研究后</dt>
              <dd>
                <FormationCost cost={trainingPrice.after} showZero />
              </dd>
            </div>
          </dl>
        </div>
      )}
      {standaloneEffect && effectLine}
      {caveat && (
        <p className="formation-research-note formation-meta">
          <FormationText text={caveat} />
        </p>
      )}
    </div>
  );
}
