import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { civByEn, type Core } from '../../../data';
import { analyzeChampi } from '../../../domain/champiCounters';
import { AGE_ZH } from '../../../domain/ratings';
import type { Trees } from '../../../domain/types';
import { CivIcon, UnitIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';
import '../champi-ages.css';

type Analysis = Extract<ReturnType<typeof analyzeChampi>, { state: 'ready' }>;
type AgeCard = Analysis['cards'][number];
type Candidate = AgeCard['candidates'][number];
type ReadyCandidate = Extract<Candidate, { state: 'ok' }>;

function N({ value, unit = '' }: { value: number; unit?: string }) {
  return (
    <span className="num nw">
      {Number(value.toFixed(3))}
      {unit}
    </span>
  );
}

function ContactSide({ side, label, attack }: { side: ReadyCandidate['a']; label: string; attack: ReadyCandidate['result']['ab'] }) {
  const civ = civByEn(side.civ);
  return (
    <div className="champi-age-side">
      <p className="champi-age-identity">
        <span>{label}</span>
        <UnitIcon u={side.unit} />
        <strong>{side.unit.zh}</strong>
        {civ ? (
          <>
            <CivIcon c={civ} alt="" />
            {civ.zh}
          </>
        ) : (
          '文明资料未核实'
        )}
      </p>
      <p>
        预计击杀对方 <N value={attack.hits} unit=" 次攻击" /> · {attack.time == null ? '用时未核实' : <N value={attack.time} unit=" 秒" />}。
      </p>
      <p className="champi-age-note">
        近甲 <N value={side.stats.ma} /> · 穿甲 <N value={side.stats.pa} /> · 速度 <N value={side.stats.spd} unit=" 格/秒" />。
      </p>
    </div>
  );
}

function CandidateResult({ candidate, candidateSide, core, main = false }: { candidate: Candidate; candidateSide: 'a' | 'b'; core: Core; main?: boolean }) {
  const candidateRole = candidateSide === 'a' ? '我方候选' : '对手候选';
  const rawName = core.unitById[candidate.unitId]?.zh;
  const candidateName = typeof rawName === 'string' && rawName.trim() ? rawName : '单位资料未核实';
  if (candidate.state !== 'ok')
    return (
      <div className="champi-age-candidate" data-champi-candidate={candidate.unitId}>
        <h5>
          {candidateRole}：{candidateName} · {civByEn(candidate.civ)?.zh ?? '文明资料未核实'}
        </h5>
        <p className="champi-age-note">
          {candidate.state === 'unavailable' ? '本时代不可用' : '暂不能计算'}：{candidate.reason}
        </p>
      </div>
    );
  const ownCandidate = candidate[candidateSide],
    champi = candidate[candidateSide === 'a' ? 'b' : 'a'];
  const ranged = candidate.a.unit.rng > 1 || candidate.b.unit.rng > 1;
  const slower = ownCandidate.stats.spd < champi.stats.spd;
  const outcome =
    candidate.candidateOutcome === 'win' ? '本组接触对照有优势' : candidate.candidateOutcome === 'draw' ? '接触对照：同时击杀' : '接触对照：未占优';
  return (
    <div className="champi-age-candidate" data-champi-candidate={candidate.unitId} data-outcome={candidate.candidateOutcome}>
      <h5>
        {main ? '近身应对参考 · ' : ''}
        {candidateRole}：{ownCandidate.unit.zh}
      </h5>
      <p className="champi-age-outcome">
        {candidateRole} · {outcome}
      </p>
      <ContactSide side={candidate.a} label="我方 A" attack={candidate.result.ab} />
      <ContactSide side={candidate.b} label="对手 B" attack={candidate.result.ba} />
      <p className="champi-age-note">{ranged ? '未模拟射程先手与风筝。' : slower ? '候选速度较慢，接触优势不代表能追上。' : '从近身接触开始，不模拟追击。'}</p>
      <Link className="champi-age-link" to={candidate.pkPath}>
        <Icon name="swords" />
        打开本时代 PK
      </Link>
    </div>
  );
}

function ChampiAgeCard({ card, analysis, core }: { card: AgeCard; analysis: Analysis; core: Core }) {
  const champi = core.unitById[card.champiUnitId],
    civ = civByEn(card.champiCiv);
  const others = card.candidates.filter((candidate) => !card.main || candidate.unitId !== card.main.unitId);
  return (
    <article className="champi-age-card" data-testid={`champi-age-${card.age}`}>
      <h4>{AGE_ZH[card.age]}</h4>
      <p className="champi-age-identity">
        {champi ? (
          <>
            <UnitIcon u={champi} />
            <strong>{champi.zh}</strong>
          </>
        ) : (
          '蔷琵形态资料未核实'
        )}
        {civ ? (
          <>
            <CivIcon c={civ} alt="" />
            {civ.zh}
          </>
        ) : (
          '文明资料未核实'
        )}{' '}
        · {analysis.champiSide === 'a' ? '我方蔷琵线' : '对手蔷琵线'}
      </p>
      {card.main ? (
        <CandidateResult candidate={card.main} candidateSide={analysis.candidateSide} core={core} main />
      ) : (
        <div className="champi-age-empty" role="status">
          <p>本卡三条候选中暂无本文明可用的已核对路线，不代表没有其他应对。</p>
          {card.reason && card.reason !== '本卡三条候选中暂无本文明可用的已核对路线，不代表没有其他应对。' ? (
            <p className="champi-age-note">{card.reason}</p>
          ) : null}
        </div>
      )}
      <details className="champi-age-more">
        <summary>查看本时代其余对照</summary>
        {others.map((candidate) => (
          <CandidateResult key={candidate.unitId} candidate={candidate} candidateSide={analysis.candidateSide} core={core} />
        ))}
      </details>
    </article>
  );
}

export default function ChampiAges({ core, trees, me, opp }: { core: Core; trees: Trees; me: string; opp: string }) {
  const build = DATA_SOURCES?.patch?.build;
  const analysis = useMemo(() => analyzeChampi({ core, trees }, me, opp, build), [core, trees, me, opp, build]);
  if (analysis.state === 'hidden') return null;
  if (analysis.state === 'unverified')
    return (
      <section className="champi-ages" aria-label="蔷琵时代对照">
        <h3>蔷琵时代对照</h3>
        <p role="status">当前资料尚未核对，暂不生成蔷琵时代对照。</p>
        {analysis.reason !== '当前资料尚未核对，暂不生成蔷琵时代对照。' ? <p className="champi-age-note">{analysis.reason}</p> : null}
      </section>
    );
  const title = analysis.champiSide === 'b' ? '应对对手的蔷琵线' : '我方蔷琵线：查看对手接触对照';
  return (
    <section className="champi-ages" aria-label={title}>
      <h3>{title}</h3>
      <p>本页按当前数据名称展示蔷琵线，对应需求所称的战酋勇士。</p>
      <p className="champi-age-note">
        只核对三条常见路线；同数量不等于同资源投入。{analysis.candidateSide === 'b' ? '下方优势标签描述对手候选，不是给我方的推荐。' : null}
      </p>
      <p className="champi-age-note">
        双方当前时代已建模科技全选，无团队加成；同数量接触 <span className="num nw">1v1</span>。远程按命中率取期望伤害，首次攻击在{' '}
        <span className="num nw">t=0</span>。
      </p>
      <div className="champi-age-grid">
        {analysis.cards.map((card) => (
          <ChampiAgeCard key={card.age} card={card} analysis={analysis} core={core} />
        ))}
      </div>
      <p className="champi-age-note">
        未计入射程先手、追击与风筝、地形、抬手、阵型和包围、聚落治疗、招降、未建模特殊能力；不比较经济与到场时间，不是胜率或实战保证。
      </p>
      <p className="champi-age-note">
        数据 <span className="num nw">DE {build}</span>；实际文明、形态与本时代科技按当前资料核对。
      </p>
    </section>
  );
}
