import { useState } from 'react';
import { civByEn } from '../../../data';
import type { Lane } from '../../../domain/startGame';
import type { SceneRow } from '../../../domain/positionScenarios';
import type { SceneTechPlan } from '../../../domain/startGameInputs';
import type { Cost } from '../../../domain/types';
import '../technology-plans.css';

export interface TechnologyPlanOption {
  id: SceneTechPlan;
  label: string;
}

export const technologyPlanLabel = (options: TechnologyPlanOption[], plan: SceneTechPlan) =>
  options.find((option) => option.id === plan)?.label ?? '已选方案（名称待核验）';

export function SceneValue({ n, unit = '' }: { n: number; unit?: string }) {
  return (
    <span className="num nw">
      {Number(n.toFixed(3))}
      {unit}
    </span>
  );
}

export function SceneResources({ cost }: { cost: Cost }) {
  const entries = Object.entries(cost).filter(([, value]) => value !== 0);
  return entries.length ? (
    entries.map(([key, value]) => (
      <span className="nw" key={key}>
        {({ Food: '食', Wood: '木', Gold: '金', Stone: '石' } as Record<string, string>)[key]} <SceneValue n={value} />；
      </span>
    ))
  ) : (
    <>无资源支出</>
  );
}

export function SceneTechnologies({ row, lane }: { row: SceneRow; lane: Lane }) {
  if (!row.technologies) return <>科技名称未核实，不按缺失项视为免费。</>;
  return row.technologies.length ? (
    <>{row.technologies.map((tech) => tech.name).join('、')}</>
  ) : (
    <>{lane === 'flank' ? '无可选弓线科技' : '无锻造/鳞甲，未研究畜牧'}</>
  );
}

export function SceneCostQuote({ row, lane }: { row: SceneRow; lane: Lane }) {
  return (
    <div className="start-plan-quote">
      <div>
        方案科技：
        <SceneTechnologies row={row} lane={lane} />。
      </div>
      {lane === 'flank' && row.upgrade ? (
        <div>
          必付弩手升级报价：
          <SceneResources cost={row.upgrade} />
          {row.upgradeSeconds != null ? (
            <>
              研究 <SceneValue n={row.upgradeSeconds} unit=" 秒" />。
            </>
          ) : null}
        </div>
      ) : lane === 'pocket' && row.fixed ? (
        <div>骑士直接训练，没有侦骑升级骑士费用。</div>
      ) : null}
      {row.fixed && row.fixedSeconds != null ? (
        <div>
          固定投入：
          <SceneResources cost={row.fixed} />
          合计 <SceneValue n={row.fixedSeconds} unit=" 工秒" />。
        </div>
      ) : null}
      {row.cost && row.unitSeconds != null ? (
        <div>
          单兵费用：
          <SceneResources cost={row.cost} />
          <SceneValue n={row.unitSeconds} unit=" 工秒/兵" />。
        </div>
      ) : null}
      {row.funding === 'fixed-shortfall' ? (
        <div>
          固定投入不足
          {row.fixedShortfall != null ? (
            <>
              ，尚缺 <SceneValue n={row.fixedShortfall} unit=" 工秒" />
            </>
          ) : null}
          ；以上为待完成报价，没有已拥有的科技或升级属性。
        </div>
      ) : null}
      {row.funding === 'no-unit' ? <div>固定投入可付，但余额不足一兵；当前没有可用部队。</div> : null}
    </div>
  );
}

function ComparisonResult({ row, lane }: { row: SceneRow; lane: Lane }) {
  if (row.status !== 'ok' || !row.count || !row.stats)
    return (
      <div>
        {row.count != null ? (
          <>
            可负担 <SceneValue n={row.count} unit=" 兵" />。
          </>
        ) : (
          '可负担人数未核实。'
        )}
        {row.reason || '当前没有可用部队。'}
      </div>
    );
  return (
    <>
      <div>
        可负担 <SceneValue n={row.count} unit=" 兵" />。
      </div>
      {lane === 'flank' ? (
        <div>
          每兵理论先手机会：
          {row.opening ? (
            <>
              <SceneValue n={row.opening.opportunities} unit=" 次" />
              ；窗口 <SceneValue n={row.opening.window} unit=" 秒" />。
            </>
          ) : (
            '未核实。'
          )}
          {row.opening?.opportunities === 0 ? '本条件没有先手发射机会。' : null}
        </div>
      ) : (
        <div>
          {row.support ? (
            <>
              期限前到场 <SceneValue n={row.support.count} unit=" 兵" />
              ；首兵 {row.support.first == null ? '无到场部队' : <SceneValue n={row.support.first} unit=" 秒" />}。
            </>
          ) : (
            '到场结果未核实。'
          )}
          {row.support?.count === 0 ? '预算有可负担部队，本期限内到场为零。' : null}
        </div>
      )}
    </>
  );
}

export function SceneComparisonFacts({ row }: { row: SceneRow }) {
  if (!row.stats || !row.count || !row.facts?.length) return null;
  return (
    <div className="start-plan-facts">
      同方案解释对照（独立于战术目标）：
      {row.facts.map((fact, index) => (
        <div key={`${fact.kind}-${index}`}>
          {fact.label}：己方 <SceneValue n={fact.own} unit={fact.unit} />，{civByEn(fact.baselineCiv)?.zh ?? '参考文明'}{' '}
          <SceneValue n={fact.baseline} unit={fact.unit} />。
        </div>
      ))}
      事实差异不代表战斗胜负，未额外计入原两维分组。
    </div>
  );
}

export default function TechnologyPlans({
  rows,
  options,
  current,
  lane,
  onAdopt,
}: {
  rows: SceneRow[];
  options: TechnologyPlanOption[];
  current: SceneTechPlan;
  lane: Lane;
  onAdopt: (plan: SceneTechPlan) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details className="start-scene-details start-plan-comparison" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>比较科技方案</summary>
      <div className="start-hint">同一预算逐项计算，采用后所有文明统一使用该方案；不会选择文明。护甲、攻击等未进入原两维，人数少不表示实战更弱。</div>
      {open ? (
        <ol className="start-plan-list">
          {rows.map((row) => {
            const label = technologyPlanLabel(options, row.plan),
              selected = row.plan === current;
            return (
              <li key={row.plan} data-tech-plan={row.plan} className={selected ? 'is-current' : undefined}>
                <h4>
                  {label}
                  {selected ? <span className="start-plan-current">当前方案</span> : null}
                </h4>
                <SceneCostQuote row={row} lane={lane} />
                <div className="start-plan-result">
                  <ComparisonResult row={row} lane={lane} />
                </div>
                <button type="button" className="start-btn start-plan-adopt" aria-pressed={selected} onClick={() => onAdopt(row.plan)}>
                  将{label}用于本局比较
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
    </details>
  );
}
