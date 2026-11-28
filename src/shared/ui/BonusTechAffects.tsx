/**
 * 文明加成详情页与文明页「作用与依据」弹层共用的作用对象列表（含科技触发与不可研究前置提示）及弹层原始记录卡片（issue 1513）。
 */
import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { civByEn } from '../../data';
import type { Core } from '../../data/core';
import { datEntryUnavailableTechs, type BonusAffectGroup, type CivBonusEnt, type TechTriggerMeta } from '../../domain/civBonus';
import { ecoText } from '../../domain/datEffects';
import { groupLines } from '../../domain/family';
import { AGE_ZH } from '../../domain/ratings';
import type { Tech } from '../../domain/types';
import { BuildingLink, StatIcon, TechIcon } from './art';
import { Icon } from './Icon';
import { LineChip } from './LineChip';
import { NumWrappedText } from './widgets';

const TECH_COLLAPSE_LIMIT = 4;

const STAT_ZH_RAW: Record<string, string> = {
  hp: '生命值',
  atk: '攻击',
  ma: '近战护甲',
  pa: '穿刺护甲',
  rng: '射程',
  spd: '移动速度',
  los: '视野',
  rof: '攻击间隔',
  gar: '驻扎容量',
  bt: '建造/生产时间',
  minr: '最小射程',
};

const triggerRelation = (meta: TechTriggerMeta): string => {
  const multi = meta.techs.length > 1;
  return multi ? (meta.enhances ? '每项研究后额外' : '每项研究后') : meta.enhances ? '研究后额外' : '研究后';
};

function TechTriggerHead({ meta, parts }: { meta: TechTriggerMeta; parts: BonusAffectGroup['rows'][number]['parts'] }) {
  const collapsed = meta.techs.length > TECH_COLLAPSE_LIMIT;
  return (
    <div className="affef affef-tech">
      {collapsed ? (
        <span className="bonus-tech-summary-pill" data-t="bonus-tech-summary">
          <Icon name="flask-conical" className="ic" />
          <span>
            以下任意 <span className="num nw">1 项</span>科技（共 <span className="num nw">{meta.techs.length} 项</span>）· {triggerRelation(meta)}
          </span>
        </span>
      ) : (
        <>
          {meta.techs.map(({ tech, delayAge }) => (
            <span className="bonus-tech-trigger-item" key={tech.id}>
              <Link className="ulink tlink bonus-tech-chip" to={`/tech/${tech.id}`}>
                <TechIcon t={tech} />
                <span>{tech.zh}</span>
              </Link>
              {delayAge && <span className="bonus-tech-delay">{AGE_ZH[delayAge]!.slice(0, 2)}起</span>}
            </span>
          ))}
          <span className="bonus-tech-rel">{triggerRelation(meta)}</span>
        </>
      )}
      {parts.map((part, index) => (
        <span key={index} className="tag">
          {part.icon && <StatIcon k={part.icon} t={part.text} />}
          <NumWrappedText text={part.text} />
        </span>
      ))}
      {collapsed && meta.totalAddText && (
        <span className="tag ok" data-t="bonus-tech-total-add">
          全研额外 <span className="num nw">{meta.totalAddText}</span>
        </span>
      )}
    </div>
  );
}

function TechTriggerDetails({ meta }: { meta: TechTriggerMeta }) {
  if (meta.techs.length <= TECH_COLLAPSE_LIMIT) return null;
  return (
    <details className="bonus-tech-list" data-t="bonus-tech-list">
      <summary>
        <Icon name="chevron-right" className="ic bonus-tech-chev" />
        <span>
          查看全部 <span className="num nw">{meta.techs.length} 项</span>触发科技（
          {meta.ageCounts.map((item, idx) => (
            <Fragment key={item.age}>
              {idx > 0 && ' · '}
              {AGE_ZH[item.age]!.slice(0, 2)} <span className="num nw">{item.count} 项</span>
            </Fragment>
          ))}
          ）
        </span>
      </summary>
      <div className="bonus-tech-list-grid">
        {meta.techs.map(({ tech, delayAge }) => (
          <span className="bonus-tech-trigger-item" key={tech.id}>
            <Link className="ulink tlink bonus-tech-chip" to={`/tech/${tech.id}`}>
              <TechIcon t={tech} />
              <span>{tech.zh}</span>
            </Link>
            {delayAge && <span className="bonus-tech-delay">{AGE_ZH[delayAge]!.slice(0, 2)}起</span>}
          </span>
        ))}
      </div>
    </details>
  );
}

/** 作用对象分组列表 + 不可研究前置透明提示（详情页与文明页证据弹层共用）。 */
export function BonusAffectList({
  b,
  core,
  groups,
  unavailTechs,
}: {
  b: CivBonusEnt;
  core: Core;
  groups: readonly BonusAffectGroup[];
  unavailTechs: readonly Tech[];
}) {
  const civZh = civByEn(b.civ)?.zh ?? b.civ;
  return (
    <>
      {groups.map((group) => (
        <div className="affg" key={group.group}>
          <h5>{group.group}</h5>
          {group.rows.map((row, rowIndex) => (
            <div className={row.techTrigger ? 'affrow affrow-tech' : 'affrow'} key={`${row.effect}-${rowIndex}`}>
              {row.techTrigger ? (
                <TechTriggerHead meta={row.techTrigger} parts={row.parts} />
              ) : (
                <div className="affef">
                  {row.parts.map((part, index) => (
                    <span key={index} className="tag">
                      {part.icon && <StatIcon k={part.icon} t={part.text} />}
                      <NumWrappedText text={part.text} />
                    </span>
                  ))}
                  {!b.team && b.ages && b.ages.length > 1 && <small className="note">（帝王时代数值）</small>}
                </div>
              )}
              <div className="uchips">
                {groupLines(row.units, core.units, core.unitById, core.fam).map((line) => (
                  <LineChip key={'l' + line.members[0]!.u.id} g={line} />
                ))}
                {row.buildings.map((building) => (
                  <BuildingLink key={'b' + building.id} b={building} />
                ))}
              </div>
              {row.techTrigger && <TechTriggerDetails meta={row.techTrigger} />}
            </div>
          ))}
        </div>
      ))}
      {unavailTechs.length > 0 && (
        <p className="bonus-tech-unavail" data-t="bonus-tech-unavail">
          <Icon name="info" className="ic" />
          <span>
            {civZh}无法研究
            {unavailTechs.map((t, index) => (
              <Fragment key={t.id}>
                {index > 0 && '、'}
                <Link className="ulink tlink" to={`/tech/${t.id}`}>
                  {t.zh}
                </Link>
              </Fragment>
            ))}
            ，未计入作用对象与数值示例。
          </span>
        </p>
      )}
    </>
  );
}

/** 文明页「作用与依据」弹层内的单条 .dat 原始记录卡片（含不可研究前置提示）。 */
export function BonusRawEvidenceEntry({
  b,
  core,
  entry,
  techByEn,
}: {
  b: CivBonusEnt;
  core: Core;
  entry: CivBonusEnt['dat'][number];
  techByEn: ReadonlyMap<string, Tech>;
}) {
  const unavailReqs = datEntryUnavailableTechs(entry.req, b, techByEn);
  return (
    <article className="bonus-raw-entry">
      <h5>{entry.name}</h5>
      <dl className="bonus-raw-meta">
        <div>
          <dt>科技 ID</dt>
          <dd>
            <code>{entry.tech}</code>
          </dd>
        </div>
        <div>
          <dt>时代</dt>
          <dd>
            {AGE_ZH[entry.age] ?? `时代 ${entry.age}`} <code>age={entry.age}</code>
          </dd>
        </div>
        <div>
          <dt>前置</dt>
          <dd>
            {entry.req.length ? entry.req.join(' + ') : '无'} <code>req={JSON.stringify(entry.req)}</code>
          </dd>
        </div>
        {'condition' in entry && entry.condition.kind === 'relics' && (
          <div>
            <dt>条件</dt>
            <dd>
              驻守圣物 ≥ <span className="num nw">{entry.condition.min} 件</span>
            </dd>
          </div>
        )}
      </dl>
      {entry.rules.length > 0 && entry.rulesUnowned && (
        <p className="bonus-raw-unowned" data-t="bonus-raw-unowned-note">
          <Icon name="info" className="ic" />
          <span>以下属性命令仅指向本文明不可用对象，未计入战斗属性；原始记录保留供核查。</span>
        </p>
      )}
      {entry.rules.length > 0 && !entry.rulesUnowned && unavailReqs.length > 0 && (
        <p className="bonus-raw-unowned" data-t="bonus-raw-unavail-tech-note">
          <Icon name="info" className="ic" />
          <span>前置科技{unavailReqs.map((t) => `「${t.zh}」`).join('、')}本文明无法研究，已排除出上方作用对象与数值示例；原始记录保留供核查。</span>
        </p>
      )}
      {entry.rules.length > 0 && (
        <ul className="bonus-raw-rules">
          {entry.rules.map((rule, ruleIndex) => (
            <li key={ruleIndex} data-raw-rule-index={ruleIndex} data-raw-target-count={rule.t.length}>
              {rule.fx.map((fx, fxIndex) => (
                <div className="bonus-raw-fx" key={fxIndex}>
                  <strong>
                    {STAT_ZH_RAW[fx.s] ?? (fx.s === 'bonus' ? '额外伤害倍率' : fx.s === 'armc' ? '护甲类别效果' : fx.s)} ·{' '}
                    {fx.op === 'mul' ? '乘算' : fx.op === 'set' ? '设定' : fx.op === 'add' ? '加值' : '运算未标记'}
                  </strong>
                  <span>
                    {fx.op === 'mul' ? `×${fx.v}` : fx.v}
                    {fx.vs ? ` · 对象类别 ${fx.vs}` : ''}
                  </span>
                  <small>
                    <code>
                      s={fx.s} · op={fx.op ?? '（未记录）'} · v={fx.v} · vs={fx.vs ?? '（未记录）'} · b={rule.b ?? '（未记录）'}
                    </code>
                  </small>
                </div>
              ))}
              <p className="bonus-raw-target-title">
                原始规则 {ruleIndex + 1} · b={rule.b ?? '（未记录）'} · 关联对象 ID（t，共 {rule.t.length} 项）
                {rule.b ? ' · 建筑目标（b=1）' : ''}
              </p>
              {rule.t.slice(0, 12).map((id, targetIndex) => {
                const target = rule.b ? core.buildingById[id] : core.unitById[id];
                return (
                  <Link className="bonus-raw-target" key={`${id}-${targetIndex}`} data-raw-target-id={id} to={`${rule.b ? '/building' : '/unit'}/${id}`}>
                    {target?.zh ?? '对象'} <code>#{id}</code>
                  </Link>
                );
              })}
              {rule.t.length > 12 && (
                <details className="bonus-raw-more-targets">
                  <summary>其余 {rule.t.length - 12} 个对象 ID</summary>
                  {rule.t.slice(12).map((id, targetIndex) => (
                    <span key={`${id}-${targetIndex + 12}`} data-raw-target-id={id}>
                      <code>#{id}</code>{' '}
                    </span>
                  ))}
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      {entry.eco.length > 0 && (
        <ul>
          {entry.eco.map((item, index) => (
            <li key={index}>{ecoText(item, (id) => core.unitById[id]?.zh ?? core.buildingById[id]?.zh)}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
