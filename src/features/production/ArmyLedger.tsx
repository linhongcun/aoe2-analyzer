import { ARMY_RESEARCH } from '../../data/armyResearch';
import { hasDecimalCost, type ResearchEntry } from '../../domain/armyCost';
import type { ArmyCostConfig } from '../../domain/armyCostConfig';
import { armyResearchConditions, ARMY_RESEARCH_STATES as STATES } from '../../domain/armyResearchEvidence';
import { AGE_ZH, RES_ZH } from '../../domain/ratings';
import { CostView } from '../../shared/ui/art';

const dataLink = (path: string) => `https://github.com/linhongcun/aoe2-analyzer/blob/${__BUILD__}/${path}`;
const ORIGINS = { done: '你标记已完成', target: '你选择的本次目标', shape: '目标形态或宿主必需', prerequisite: '确定必要前置／完成历史推导' };
const RES_ID: Record<number, string> = { 0: 'Food', 1: 'Wood', 2: 'Stone', 3: 'Gold' };

export function ArmyLedger({
  entry,
  entries,
  config,
  onRemove,
}: {
  entry: ResearchEntry;
  entries: ResearchEntry[];
  config: ArmyCostConfig;
  onRemove: () => void;
}) {
  const node = entry.id === null ? undefined : ARMY_RESEARCH.nodes[entry.id];
  const conditions = armyResearchConditions(ARMY_RESEARCH, config, entries, entry.id);
  return (
    <article className="army-ledger-entry">
      <div className="army-section-heading">
        <h3>{entry.name}</h3>
        <span>{STATES[entry.status]}</span>
      </div>
      <p className="note">
        {entry.beneficiaries.length > 1 && '共享 · '}
        {entry.beneficiaries.map((i, index) => (
          <span key={i}>
            {index > 0 && '、'}
            <span className="nw">
              第 <span className="num">{i + 1}</span> 行
            </span>
          </span>
        ))}
        {entry.reason && ' · ' + entry.reason}
        {['done', 'inferred-done'].includes(entry.status) && ' · 历史研究费用不重复计入。'}
        {entry.status === 'planned' && hasDecimalCost(entry.cost) && (
          <>
            {' · '}
            <span className="nw">折后价含小数，</span>
            <span className="nw">保留至多两位</span>
          </>
        )}
      </p>
      {entry.cost && <CostView c={entry.cost} />}
      <details>
        <summary>依据与来源</summary>
        <p>
          实际研究动作：<span className="num">{entry.key}</span>；{config.civ}／{AGE_ZH[Number(config.age)] ?? config.age}。
        </p>
        <h4>全部加入原因</h4>
        <ul>
          {entry.origins.map((o, i) => (
            <li key={i}>
              {ORIGINS[o.kind]}：<span className="num">{o.key}</span>
              {o.row !== undefined && (
                <>
                  ，
                  <span className="nw">
                    第 <span className="num">{o.row + 1}</span> 行
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
        <h4>前置与条件</h4>
        {node && (
          <p>
            直接候选中需满足 <span className="num">{node.count}</span> 项；下方包含未采用的替代分支，不将其自动记为已完成。
          </p>
        )}
        {conditions.length ? (
          <ul>
            {conditions.map((c) => (
              <li key={`${c.parent}-${c.id}`}>
                <span className="num">t:{c.parent}</span> 的候选 <span className="num">t:{c.id}</span>（{c.name}）：{c.state}。
                {!!c.requires.length && (
                  <>
                    {' '}
                    其下级候选需满足 <span className="num">{c.count}</span> 项。
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>{node ? '无列出的研究前置。' : '身份未核实，不能提供前置证明。'}</p>
        )}
        <p>研究宿主和必要前置建筑按已具备的外部假设处理，不核实建筑存量，不计建筑投资。</p>
        <h4>研究原价与当前有效价</h4>
        {entry.quote?.baseCost ? (
          <>
            <p>固定数据原价：</p>
            <CostView c={entry.quote.baseCost} />
          </>
        ) : (
          <p>原价尚未核实。</p>
        )}
        {entry.quote?.cost ? (
          <>
            <p>当前条件参考价（历史研究不据此补收）：</p>
            <CostView c={entry.quote.cost} />
            {hasDecimalCost(entry.quote.cost) && <p>按折扣比例计算，保留至多两位小数；游戏内实际是否取整未核实。</p>}
          </>
        ) : (
          <p>{entry.quote?.reason || entry.reason || '有效价尚未核实。'}</p>
        )}
        {entry.quote?.modifiers.length ? (
          <ul>
            {entry.quote.modifiers.map((m, i) => (
              <li key={i}>
                {m.source}：{m.command.Type === 103 ? '研究时间' : m.command.B === -1 ? '四种资源' : (RES_ZH[RES_ID[m.command.B]!] ?? '全局／未识别资源')}
                {m.command.C === 0 ? '设为' : m.command.C === 2 ? '乘以' : '加上'} <span className="num">{Math.round(m.command.D * 1e4) / 1e4 || 0}</span>。
                {m.applied ? '已计入' : '未计入'}
                ；生效依据：{m.condition}。
                <span className="nw">
                  类型 <span className="num">{m.command.Type}</span>
                </span>
                ，
                <span className="nw">
                  操作 <span className="num">{m.command.C}</span>
                </span>
                。
              </li>
            ))}
          </ul>
        ) : (
          <p>没有已计入的额外研究价修正；未核实原因另行列明，不回落为基础价。</p>
        )}
        <h4>固定数据与身份映射证据</h4>
        <p>
          <a href={dataLink('data/game/army_research.json')} target="_blank" rel="noreferrer">
            本构建的研究图与动作映射
          </a>{' '}
          ·{' '}
          <a href={dataLink('scripts/army_research_build.py')} target="_blank" rel="noreferrer">
            映射生成规则
          </a>{' '}
          ·{' '}
          <a href={dataLink('data/sources/data_sources.json')} target="_blank" rel="noreferrer">
            固定来源及校验指纹
          </a>
        </p>
        <p>
          <a href={`https://github.com/SiegeEngineers/auto-mods/blob/${ARMY_RESEARCH.meta.commit}/dat/empires2_x2_p1.dat`} target="_blank" rel="noreferrer">
            原始固定 .dat
          </a>
          ；{ARMY_RESEARCH.meta.patch}。研究图保留真实动作、完整 count、升级／启用映射、文明修正和建筑触发；未核实项不能据此报价。
        </p>
      </details>
      {entry.status === 'invalid' && entry.manual && (
        <button type="button" className="btn" onClick={onRemove}>
          移除无效研究
        </button>
      )}
    </article>
  );
}
