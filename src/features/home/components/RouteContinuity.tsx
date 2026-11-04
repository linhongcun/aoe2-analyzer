import { useMemo, useState } from 'react';
import { civByEn } from '../../../data';
import { ageRoutes, DEFAULT_ROUTE, type AgeRoute, type RouteConfig } from '../../../domain/ageRoutes';
import { routeSources, routeWork } from '../../../domain/routeProfiles';
import type { SceneContext } from '../../../domain/positionScenarios';
import type { Lane, StartState } from '../../../domain/startGame';
import { sceneSupported } from '../../../domain/startGameInputs';
import type { Update } from './startGameEarly';
import type { Cost } from '../../../domain/types';

function N({ n, unit = '' }: { n: number; unit?: string }) {
  return (
    <span className="num nw">
      {Number(n.toFixed(3))}
      {unit}
    </span>
  );
}
function Resources({ cost }: { cost: Cost }) {
  const entries = Object.entries(cost).filter(([, v]) => v !== 0);
  return entries.length ? (
    entries.map(([key, value]) => (
      <span className="nw" key={key}>
        {({ Food: '食物', Wood: '木材', Gold: '黄金', Stone: '石头' } as Record<string, string>)[key]} <N n={value} />；
      </span>
    ))
  ) : (
    <>无支出</>
  );
}
export default function RouteContinuity({ context, state, onChange }: { context: SceneContext; state: StartState; onChange: Update }) {
  const lane = state.choice.lane!;
  const [open, setOpen] = useState(false);
  const cfg = state.routeConfig ?? DEFAULT_ROUTE;
  const setCfg = (change: (cfg: RouteConfig) => RouteConfig) =>
    onChange((current) =>
      sceneSupported(current.choice) && current.choice.lane === lane ? { ...current, routeConfig: change(current.routeConfig ?? DEFAULT_ROUTE) } : current,
    );
  const rows = useMemo(() => (open ? ageRoutes(context, lane, cfg) : []), [context, lane, cfg, open]);
  const numberControl = (key: Exclude<keyof RouteConfig, 'husbandry'>, label: string, options: number[]) => (
    <label key={key}>
      {label}
      <select aria-label={label} value={cfg[key]} onChange={(e) => setCfg((c) => ({ ...c, [key]: +e.target.value }))}>
        {options.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </label>
  );
  const version = routeSources();
  return (
    <details className="start-scene-details" data-testid="route-continuity" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>封建到城堡：路线衔接</summary>
      {open ? (
        <>
          <h3>{lane === 'flank' ? '步弓存量升级为弩手' : '侦骑保留，骑士另行生产'}</h3>
          <p className="start-hint">这是另一份两阶段军事账本，不使用上方城堡快照额度。封建已花投入继续记账，城堡额度是追加投入；封建余额不结转，损失不退款。</p>
          <p className="start-hint">
            统一从封建建筑与人口就绪、没有部队和军事科技开始。手动指定幸存数量，视为满生命；不模拟升城时间、经济发展、初始侦骑或升时代赠送资源。
          </p>
          <div className="start-scene-controls">
            {numberControl('feudalBudget', '封建军事额度（工秒）', [0, 600, 2000, 3000, 6000, 12000])}
            {numberControl('castleBudget', '城堡追加额度（工秒）', [0, 600, 2000, 3000, 6000, 12000])}
            {numberControl('survivors', '计划保留封建兵数', [0, 6, 12])}
            {numberControl('newLimit', '城堡新增上限', [0, 6, 12])}
            {numberControl('distance', '路线支援距离（格）', [0, 10, 30, 60])}
            {numberControl('deadline', '路线观察窗口（秒）', [0, 60, 120, 1200])}
            {lane === 'pocket' ? (
              <label>
                骑士接力时的畜牧
                <select aria-label="路线畜牧" value={String(cfg.husbandry)} onChange={(e) => setCfg((c) => ({ ...c, husbandry: e.target.value === 'true' }))}>
                  <option value="true">补研究并付费</option>
                  <option value="false">不研究</option>
                </select>
              </label>
            ) : null}
          </div>
          <p className="start-hint">
            工秒只是统一资源计价，不是游戏经过时间。每个到场窗口都从所需科技完成、资金到位、单建筑空闲时另起计时，未含研究或升时代时间。
          </p>
          {rows.map((row) => (
            <article className="start-scene-card" key={row.civ} data-testid={`route-ledger-${row.civ}`}>
              <h4>
                {civByEn(row.civ)?.zh ?? row.civ}
                {row.ok && row.reference ? ' · 参考样本' : ' · 机制样本'}
              </h4>
              {row.ok ? <RouteEvidence row={row} lane={lane} cfg={cfg} /> : <p role="status">{row.reason}。不将缺机制当成弱势，也不影响上方独立城堡场景。</p>}
            </article>
          ))}
          <details className="start-scene-details">
            <summary>两阶段规则与数据来源</summary>
            <p className="start-hint">
              共同包：{lane === 'flank' ? '封建箭羽、射手软甲；城堡锥子箭及弩手升级。' : '封建锻造、骑兵鳞甲；城堡按开关补畜牧。'}
              已付款的科技继承，不重复收费；未付款前置需在城堡补齐。只有整包付得起才执行转型，不买最优科技包。
            </p>
            <p className="start-hint">
              封建先付科技，余额尽量买兵；保留数量不超过实际购买数。城堡新增受上限与追加余额共同限制。零存量且零新增不买转型包；侦骑没有新增骑士请求时不额外买畜牧。
            </p>
            <p className="start-hint">
              使用两时代合法属性、文明效果和自身团队一次。两阶段同用中性无经济科技、步行距离三格的标准采集率。未计升时代与建筑费用、住房、真实采集、战斗损失、敌军、寻路和操作；不相加跨时代总分，不预测整局胜负。
            </p>
            <p className="start-hint">
              模型 {version.model} · 核验 {version.review}。机制结构变化会阻断相应两阶段样本；数值变化重算。帝王时代与更多文明待核验。
            </p>
            {version.sources.map((s) => (
              <p className="start-hint" key={s.id}>
                {s.patch} · {s.repo} · {s.commit.slice(0, 8)}
              </p>
            ))}
          </details>
        </>
      ) : null}
    </details>
  );
}
export function RouteEvidence({ row, lane, cfg }: { row: AgeRoute; lane: Lane; cfg: RouteConfig }) {
  const { feudal, castle, retained, feudalLedger: f, castleLedger: c } = row;
  return (
    <>
      <p>
        <strong>封建阶段：</strong>可负担 <N n={f.count} unit=" 兵" /> {feudal.unit.zh}。
        {f.count > 0 ? (
          <>
            {lane === 'flank' ? (
              <>
                射程 <N n={feudal.stats.rng} unit=" 格" />
                ，攻击周期 <N n={feudal.stats.rof} unit=" 秒" />。
              </>
            ) : (
              <>
                生命 <N n={feudal.stats.hp} />
                ，速度 <N n={feudal.stats.spd} />。
              </>
            )}
            单建筑每 <N n={feudal.cycle} unit=" 秒" />
            训练一兵。
          </>
        ) : f.packagePaid ? (
          '已付科技包，剩余额度不足一兵。'
        ) : (
          '科技包未完成，当前没有部队。'
        )}
      </p>
      <p>
        <strong>{lane === 'flank' ? '存量升级：' : '骑士接力：'}</strong>
        {lane === 'flank' ? (
          <>
            {c.packagePaid ? (
              <>
                保留的 <N n={row.survivors} unit=" 步弓" />
                升级为 <N n={row.upgraded} unit=" 弩手" />
                ，存量不重新购买。
              </>
            ) : (
              <>
                保留 <N n={row.survivors} unit=" 步弓" />
                ，没有完成弩手升级。
              </>
            )}
            新产 <N n={row.newCount} unit=" 弩手" />。
          </>
        ) : (
          <>
            保留 <N n={row.survivors} unit=" 侦骑" />
            ，另行新产 <N n={row.newCount} unit=" 骑士" />
            。侦骑不会升级成骑士。
          </>
        )}
        {row.survivors < cfg.survivors ? (
          <>
            计划保留 <N n={cfg.survivors} unit=" 兵" />
            ，已按封建实际购买数限制。
          </>
        ) : null}
      </p>
      {row.survivors > 0 ? (
        <p className="start-hint">
          城堡保留部队（{retained.unit.zh}）：
          {lane === 'flank' ? (
            <>
              射程 <N n={feudal.stats.rng} /> 到 <N n={retained.stats.rng} />
              ；攻击 <N n={feudal.stats.atk} /> 到 <N n={retained.stats.atk} />。
            </>
          ) : (
            <>
              生命 <N n={retained.stats.hp} />
              ，速度 <N n={retained.stats.spd} />；{c.packagePaid && cfg.husbandry ? '已计入本次付费畜牧。' : '未额外计入畜牧。'}
            </>
          )}
        </p>
      ) : null}
      {row.newCount > 0 ? (
        <p className="start-hint">
          城堡新产{castle.unit.zh}：生命 <N n={castle.stats.hp} />
          ，攻击 <N n={castle.stats.atk} />，
          {lane === 'flank' ? (
            <>
              射程 <N n={castle.stats.rng} unit=" 格" />
            </>
          ) : (
            <>
              速度 <N n={castle.stats.spd} />
            </>
          )}
          ；每 <N n={castle.cycle} unit=" 秒" />
          训练一兵。
        </p>
      ) : null}
      <p>
        <strong>追加支出：</strong>
        <N n={c.spentWork} unit=" 工秒" />
        ；两阶段累计 <N n={row.cumulativeWork} unit=" 工秒" />。
        {c.shortfall > 0 ? (
          <>
            转型包尚缺 <N n={c.shortfall} unit=" 工秒" />
            ，没有部分购买或虚构升级。
          </>
        ) : row.newCount < cfg.newLimit ? (
          <>剩余额度不足计划新增数量。</>
        ) : null}
      </p>
      <p className="start-hint">
        <strong>支援条件：</strong>观察 <N n={cfg.deadline} unit=" 秒" />
        、距离 <N n={cfg.distance} unit=" 格" />。
        {lane === 'pocket' ? (
          <>
            独立封建窗口到场 <N n={row.earlySupport.count} unit=" 侦骑" />；
          </>
        ) : null}
        城堡窗口内保留部队到场 <N n={row.retainedSupport.count} unit=" 兵" />
        ，新产到场 <N n={row.newSupport.count} unit=" 兵" />。 新产首兵
        {row.newSupport.first == null ? (
          '无可用部队'
        ) : (
          <>
            <N n={row.newSupport.first} unit=" 秒" />
            到场
          </>
        )}
        ，必须经历首个训练周期。
      </p>
      <p className="start-hint">
        <strong>主要短板：</strong>
        {lane === 'flank' ? (
          <>存量越少，固定升级投入分摊到的兵越少；射程或射速变化不等于实际伤害。</>
        ) : (
          <>侦骑投入不会抵扣骑士购买费；新骑士仍需马厩周期，不能把两种兵合成同等战力。</>
        )}
        不计升城耗时与真实经济，不能据此判断谁先升城或必胜。
      </p>
      <details className="start-scene-details">
        <summary>查看两阶段账本</summary>
        <p className="start-hint">
          封建实际支出：
          <Resources cost={f.spent} />
          等值 <N n={f.spentWork} unit=" 工秒" />
          ；未用额度 <N n={f.unused} unit=" 工秒" />
          （不结转）。
        </p>
        <p className="start-hint">
          城堡实际支出：
          <Resources cost={c.spent} />
          未用追加额度 <N n={c.unused} unit=" 工秒" />
          。累计资源：
          <Resources cost={row.cumulative} />
        </p>
        <p className="start-hint">
          城堡所需固定包：
          <Resources cost={c.required} />
          等值 <N n={c.fixedWork} unit=" 工秒" />
          。单位现价：封建 <Resources cost={feudal.cost} />
          城堡新产 <Resources cost={castle.cost} />
          ；每兵分别 <N n={routeWork(feudal.cost)} /> / <N n={routeWork(castle.cost)} unit=" 工秒" />。
        </p>
        <p className="start-hint">
          封建科技：{f.packagePaid ? feudal.techs.map((t) => t.zh).join('、') : '未付款，不继承'}。城堡新付科技：
          {row.newTechs.map((t) => t.zh).join('、') || '无'}。
          {lane === 'flank' ? `弩手升级${c.packagePaid ? '已付款一次' : '未付款'}。` : '没有侦骑升级为骑士的费用项目。'}
        </p>
        <p className="start-hint">
          数据基础研究耗时（不计文明建筑效率，不相加为真实等待时间）：
          {castle.techs.map((t) => (
            <span className="nw" key={t.id}>
              {t.zh} <N n={t.rt} unit=" 秒" />；
            </span>
          ))}
          {lane === 'flank' ? (
            <>
              弩手升级 <N n={castle.upgradeSeconds} unit=" 秒" />。
            </>
          ) : null}
          研究、训练与真实经济时间分开。
        </p>
        <p className="start-hint">输入摘要 {row.signature}</p>
      </details>
    </>
  );
}
