/** 文明/团队加成的效果说明：中英原文、适用时代、数值示例（之前→之后）、作用对象（与模拟器同一判定） */
import { Link } from 'react-router-dom';
import { civByEn } from '../../data';
import { useCore } from '../../data/hooks';
import { bonusAffects, bonusExample, type CivBonusEnt } from '../../domain/civBonus';
import { groupLines } from '../../domain/family';
import { linkify } from '../../domain/linker';
import { AGE_ZH } from '../../domain/ratings';
import { BuildingLink, StatIcon, UnitLinks } from './art';
import { BonusExampleTable, RelicConditionCallout } from './BonusConditionBlocks';
import { Icon } from './Icon';
import { Linked, Loading } from './widgets';
import { LineChip } from './LineChip';
import type { Unit } from '../../domain/types';
import { collapse } from '../../domain/family';
import { ecoText } from '../../domain/datEffects';
import { bonusLevel, bonusUsage, LEVEL_ZH, showEcoSourceTag } from '../../domain/bonusUsage';

const SRC_TAG: Record<string, [string, string]> = {
  dat: ['ok', '数值来自游戏数据'],
  manual: ['txt', '数值为本站手工规则（游戏数据缺少该项）'],
  eco: ['ok', '游戏数据含经济/费用效果（仅文字展示）'],
  text: ['txt', '游戏数据无对应记录'],
};

const STAT_ZH: Record<string, [string, string]> = {
  hp: ['生命值', 'hp'],
  atk: ['攻击', 'atk'],
  ma: ['近战护甲', 'marm'],
  pa: ['穿刺护甲', 'parm'],
  rng: ['射程', 'range'],
  spd: ['移动速度', 'speed'],
  los: ['视野', ''],
  rof: ['攻击间隔', 'rof'],
  gar: ['驻扎容量', ''],
  bt: ['建造/生产时间', 'time'],
  minr: ['最小射程', ''],
};
const ageTxt = (a: number[]) => a.map((x) => AGE_ZH[x]!.slice(0, 2)).join('/');

export function BonusTags({ b, includeTeam = true, includeFresh = true }: { b: CivBonusEnt; includeTeam?: boolean; includeFresh?: boolean }) {
  const lv = bonusLevel(b);
  // 已有工具计入的经济/费用类加成不显示来源标签，见 showEcoSourceTag。逐工具明细在正文「各工具计入情况」。
  const src = SRC_TAG[b.src] && showEcoSourceTag(b) ? SRC_TAG[b.src] : undefined;
  return (
    <>
      {includeTeam && b.team && <span className="tag team">团队加成 · 作用于盟友</span>}
      {b.cats.map((c) => (
        <span key={c} className="tag">
          {c}
        </span>
      ))}
      {b.ages && <span className="tag">{ageTxt(b.ages)}时代</span>}
      <span className={'tag ' + (lv === 'none' ? 'txt' : 'ok')}>{LEVEL_ZH[lv]}</span>
      {src && <span className={'tag ' + src[0]}>{src[1]}</span>}
      {includeFresh && b.fresh === false && <span className="tag txt">游戏说明文字与游戏数据数值不一致（以游戏数据为准）</span>}
    </>
  );
}
const USAGE_ICON = { true: 'check', false: 'x', null: 'circle-help' } as const;

/** Keep the scoped sourced quantity phrases together in both detail and sidebar text. */
const bengaliQuantity = (text: string, linked: boolean) =>
  text.split(/(\d+\s*(?:个村民|人口|个模板))/g).map((part, index) =>
    index % 2 ? (
      <span className="num nw" key={index}>
        {linked ? <Linked text={part} /> : part}
      </span>
    ) : linked ? (
      <Linked text={part} key={index} />
    ) : (
      part
    ),
  );
export function BonusText({ b, linked = true }: { b: CivBonusEnt; linked?: boolean }) {
  if (b.id === 'Bengalis-0') return bengaliQuantity(b.zh, linked);
  if (b.civ !== 'Sicilians' && (b.civ !== 'Tatars' || b.idx !== 2)) return linked ? <Linked text={b.zh} /> : b.zh;
  const parts = b.zh.split(b.civ === 'Sicilians' ? /([+−-]?\d+(?:\.\d+)?\s*%?)/g : /(\d+(?:\.\d+)?\s*头绵羊)/g);
  return parts.map((part, index) =>
    index % 2 ? (
      <span className="num nw" key={index}>
        {linked ? <Linked text={part} /> : part}
      </span>
    ) : linked ? (
      <Linked text={part} key={index} />
    ) : (
      part
    ),
  );
}

type CoreData = NonNullable<ReturnType<typeof useCore>>;

export default function BonusBody({ b, compact, head = true }: { b: CivBonusEnt; compact?: boolean; head?: boolean }) {
  const core = useCore();
  if (!core) return <Loading />;
  return <BonusBodyContent b={b} core={core} compact={compact} head={head} />;
}

export function BonusBodyContent({
  b,
  core,
  compact,
  head = true,
  variant = 'default',
}: {
  b: CivBonusEnt;
  core: CoreData;
  compact?: boolean;
  head?: boolean;
  variant?: 'default' | 'evidence';
}) {
  const groups = bonusAffects(b, core.units, core.buildings);
  const mayanTimeline = b.id === 'Mayans-1';
  const sicilianConstruction = b.id === 'Sicilians-4';
  const usage =
    b.encoded &&
    !mayanTimeline &&
    !sicilianConstruction &&
    b.id !== 'Chinese-2' &&
    b.id !== 'Mapuche-1' &&
    b.id !== 'Gurjaras-0' &&
    b.id !== 'Gurjaras-1' &&
    b.id !== 'Poles-0' &&
    b.id !== 'Poles-2'
      ? []
      : bonusUsage(b);
  const ex = bonusExample(b, core.units, core.buildings, b.civ === 'Franks' && b.idx === 2 ? 'Paladin' : undefined);
  // 未编码：根据文字识别出的单位/建筑（不计入数值）
  const mentions = !b.encoded
    ? linkify(b.zh, core.linker).flatMap((s) => (s.href !== undefined && (s.kind === 'unit' || s.kind === 'building') ? [{ kind: s.kind, href: s.href }] : []))
    : [];
  const mu = mentions
    .filter((s) => s.kind === 'unit')
    .map((s) => core.unitById[+s.href.replace(/\D/g, '')])
    .filter((u): u is Unit => !!u);
  const mb = mentions
    .filter((s) => s.kind === 'building')
    .map((s) => core.buildingById[+s.href.replace(/\D/g, '')]!)
    .filter(Boolean);
  if (variant === 'evidence') return <BonusEvidenceSections b={b} core={core} compact={compact} groups={groups} usage={usage} ex={ex} mu={mu} mb={mb} />;
  return (
    <div className={'bonusbody' + (compact ? ' compact' : '')}>
      {head && (
        <>
          <p className="bz">
            <BonusText b={b} />
          </p>
          <p className="note">{b.en}</p>
          <p>
            <BonusTags b={b} />
          </p>
        </>
      )}
      {b.team && <p className="note">团队加成对你和所有盟友生效（包括你自己）。</p>}
      {b.relicFx && <RelicConditionCallout relicFx={b.relicFx} />}
      {ex && (
        <div className="bex">
          <h4>
            数值示例：
            <Link className="ulink" to={ex.kind === 'unit' ? `/unit/${ex.id}` : `/building/${ex.id}`}>
              {ex.name}
            </Link>
            <small className="note">{ex.relicRows?.length ? '（基础值，仅计这一条加成；按驻守圣物件数，城堡时代起）' : '（基础值，仅计这一条加成）'}</small>
          </h4>
          <BonusExampleTable b={b} ex={ex} />
        </div>
      )}
      {usage.length > 0 && (
        <div className="note busage">
          <p>各工具计入情况：</p>
          {b.team && usage.every((l) => l.on === false) && <p>各工具均未计入：本文明自己的和队友给的这条团队加成都不计，逐项如下。</p>}
          <ul>
            {usage.map((l) => (
              <li key={l.tool} data-usage={l.tool} data-on={String(l.on)}>
                <Icon name={USAGE_ICON[String(l.on) as keyof typeof USAGE_ICON]} className={'ic' + (l.on === false ? ' warn' : '')} />
                <b>
                  {l.href ? (
                    <Link className="ulink" to={l.href}>
                      {l.name}
                    </Link>
                  ) : (
                    l.name
                  )}
                </b>
                ：{b.id === 'Bengalis-0' || b.civ === 'Poles' ? bengaliQuantity(l.note, false) : l.note}
              </li>
            ))}
          </ul>
          {sicilianConstruction ? (
            <p>普通开局已有首座城镇中心，施工加成从起点计入；新城镇中心按实际施工形态计算。农田储量和续种未模拟，各工具沿用各自的计算口径。</p>
          ) : mayanTimeline ? (
            <p>开局按连续采集估算，资源储量和耗尽未模拟；其它工具沿用各自的计算口径。</p>
          ) : (
            <p>单位模拟器属性面板不计算经济/费用类效果{b.dat.length + b.eco.length > 0 ? '，结构化数值见下方「游戏数据原始效果」' : ''}。</p>
          )}
        </div>
      )}
      {!b.encoded && usage.length === 0 && (
        <p className="note">
          <Icon name="triangle-alert" className="ic warn" />
          仅文本，未计入数值：
          {b.src === 'eco'
            ? '经济/费用类效果，结构化数值见下方「游戏数据原始效果」；模拟器属性面板不计算。'
            : b.cats.includes('经济') || b.cats.includes('费用')
              ? '这是经济/费用类效果（采集、造价、研究等），以游戏原文为准，模拟器不计算。'
              : '该效果尚未编码进模拟器，以游戏原文为准。'}
        </p>
      )}
      <p className="note">
        措辞帮助：<Link to="/glossary/rate-and-time">速率与耗时</Link> · <Link to="/glossary/stronger-effect">科技效果更强</Link>
      </p>
      {(groups.length > 0 || mu.length + mb.length > 0) && <h4>作用对象{b.team ? '（所有拥有该单位的文明）' : `（${civByEn(b.civ)?.zh} 拥有的）`}</h4>}
      {groups.map((g) => (
        <div className="affg" key={g.group}>
          <h5>{g.group}</h5>
          {g.rows.map((r) => (
            <div className="affrow" key={r.effect}>
              <div className="affef">
                {r.parts.map((p, i) => (
                  <span key={i} className="tag">
                    {p.icon && <StatIcon k={p.icon} t={p.text} />}
                    {p.text}
                  </span>
                ))}
                {!b.team && b.ages && b.ages.length > 1 && <small className="note">（帝王时代数值）</small>}
              </div>
              <div className="uchips">
                {groupLines(r.units, core.units, core.unitById, core.fam).map((l) => (
                  <LineChip key={'l' + l.members[0]!.u.id} g={l} />
                ))}
                {r.buildings.map((x) => (
                  <BuildingLink key={'b' + x.id} b={x} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
      {(b.dat.length > 0 || b.eco.length > 0) && (
        <details className="datfx">
          <summary>游戏数据原始效果（{b.dat.length + (b.eco.length ? 1 : 0)} 条）</summary>
          <ul>
            {b.dat.map((e) => (
              <li key={e.tech}>
                <code>
                  #{e.tech} {e.name}
                </code>
                {e.age > 1 && <small className="note"> · {AGE_ZH[e.age]}</small>}
                {e.req.length > 0 && <small className="note"> · 需 {e.req.join(' + ')}</small>}
                {'condition' in e && e.condition.kind === 'relics' && (
                  <small className="note">
                    {' '}
                    · 条件：驻守圣物 ≥ <span className="num nw">{e.condition.min} 件</span>
                  </small>
                )}
                {e.rules.length > 0 && <small className="note"> · 属性命令 {e.rules.reduce((n, r) => n + r.fx.length, 0)} 条（见上方作用对象）</small>}
                {e.eco.length > 0 && (
                  <ul>
                    {e.eco.map((x, i) => (
                      <li key={i}>{ecoText(x, (id) => core.unitById[id]?.zh ?? core.buildingById[id]?.zh)}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            {b.eco.length > 0 && (
              <li>
                团队加成经济项
                <ul>
                  {b.eco.map((x, i) => (
                    <li key={i}>{ecoText(x, (id) => core.unitById[id]?.zh ?? core.buildingById[id]?.zh)}</li>
                  ))}
                </ul>
              </li>
            )}
          </ul>
        </details>
      )}
      {!b.encoded && mu.length + mb.length > 0 && (
        <>
          <p className="note">根据说明文字推断：</p>
          <div className="uchips">
            <UnitLinks list={collapse(mu, core.fam)} />
            {mb.map((x) => (
              <BuildingLink key={x.id} b={x} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type EvidenceProps = {
  b: CivBonusEnt;
  core: CoreData;
  compact?: boolean;
  groups: ReturnType<typeof bonusAffects>;
  usage: ReturnType<typeof bonusUsage>;
  ex: ReturnType<typeof bonusExample>;
  mu: Unit[];
  mb: NonNullable<CoreData['buildingById'][number]>[];
};

function BonusEvidenceSections({ b, core, compact, groups, usage, ex, mu, mb }: EvidenceProps) {
  const rawEntry = (entry: (typeof b.dat)[number]) => {
    return (
      <article className="bonus-raw-entry" key={entry.tech}>
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
        {entry.rules.length > 0 && (
          <ul className="bonus-raw-rules">
            {entry.rules.map((rule, ruleIndex) => (
              <li key={ruleIndex} data-raw-rule-index={ruleIndex} data-raw-target-count={rule.t.length}>
                {rule.fx.map((fx, fxIndex) => (
                  <div className="bonus-raw-fx" key={fxIndex}>
                    <strong>
                      {STAT_ZH[fx.s]?.[0] ?? (fx.s === 'bonus' ? '额外伤害倍率' : fx.s === 'armc' ? '护甲类别效果' : fx.s)} ·{' '}
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
  };
  const rawPresent = b.dat.length > 0 || b.eco.length > 0;
  return (
    <div className={'bonusbody' + (compact ? ' compact' : '')}>
      <section className="bonus-evidence-section">
        <h4>作用对象</h4>
        {groups.map((group) => (
          <div className="affg" key={group.group}>
            <h5>{group.group}</h5>
            {group.rows.map((row) => (
              <div className="affrow" key={row.effect}>
                <div className="affef">
                  {row.parts.map((part, index) => (
                    <span key={index} className="tag">
                      {part.icon && <StatIcon k={part.icon} t={part.text} />}
                      {part.text}
                    </span>
                  ))}
                  {!b.team && b.ages && b.ages.length > 1 && <small className="note">（帝王时代数值）</small>}
                </div>
                <div className="uchips">
                  {groupLines(row.units, core.units, core.unitById, core.fam).map((line) => (
                    <LineChip key={'l' + line.members[0]!.u.id} g={line} />
                  ))}
                  {row.buildings.map((building) => (
                    <BuildingLink key={'b' + building.id} b={building} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
        {!b.encoded && mu.length + mb.length > 0 && <p className="note">根据说明文字推断，非结构化对象名单。</p>}
        {!groups.length && !mu.length && !mb.length && <p className="note">暂无结构化对象明细。不代表这条加成没有效果。</p>}
        {!b.encoded && mu.length + mb.length > 0 && (
          <div className="uchips">
            <UnitLinks list={collapse(mu, core.fam)} />
            {mb.map((building) => (
              <BuildingLink key={building.id} b={building} />
            ))}
          </div>
        )}
      </section>
      {b.relicFx && <RelicConditionCallout relicFx={b.relicFx} />}
      {ex && (
        <section className="bonus-evidence-section">
          <h4>数值示例</h4>
          <div className="bex">
            <h5>
              <Link className="ulink" to={ex.kind === 'unit' ? `/unit/${ex.id}` : `/building/${ex.id}`}>
                {ex.name}
              </Link>
              <small className="note">{ex.relicRows?.length ? '（基础值，仅计这一条加成；按驻守圣物件数，城堡时代起）' : '（基础值，仅计这一条加成）'}</small>
            </h5>
            <BonusExampleTable b={b} ex={ex} />
          </div>
        </section>
      )}
      <section className="bonus-evidence-section">
        <h4>本站工具计入情况</h4>
        {usage.length ? (
          <div className="note busage">
            {b.team && usage.every((item) => item.on === false) && <p>各工具均未计入：本文明自己的和队友给的这条团队加成都不计，逐项如下。</p>}
            <ul>
              {usage.map((item) => (
                <li key={item.tool} data-usage={item.tool} data-on={String(item.on)}>
                  <Icon name={USAGE_ICON[String(item.on) as keyof typeof USAGE_ICON]} className={'ic' + (item.on === false ? ' warn' : '')} />
                  <b>
                    {item.href ? (
                      <Link className="ulink" to={item.href}>
                        {item.name}
                      </Link>
                    ) : (
                      item.name
                    )}
                  </b>
                  ：{b.id === 'Bengalis-0' || b.civ === 'Poles' ? bengaliQuantity(item.note, false) : item.note}
                </li>
              ))}
            </ul>
            {b.id === 'Sicilians-4' ? (
              <p>普通开局已有首座城镇中心，施工加成从起点计入；新城镇中心按实际施工形态计算。农田储量和续种未模拟，各工具沿用各自的计算口径。</p>
            ) : b.id === 'Mayans-1' ? (
              <p>开局按连续采集估算，资源储量和耗尽未模拟；其它工具沿用各自的计算口径。</p>
            ) : (
              <p>单位模拟器属性面板不计算经济/费用类效果{b.dat.length + b.eco.length ? '，结构化数值见下方「游戏数据原始效果」' : ''}。</p>
            )}
          </div>
        ) : (
          <p className="note">暂无逐工具明细；以各工具的实际说明为准。</p>
        )}
        {!b.encoded && !usage.length && (
          <p className="note">
            <Icon name="triangle-alert" className="ic warn" />
            仅文本，未计入数值：
            {b.src === 'eco'
              ? '经济/费用类效果，结构化数值见下方「游戏数据原始效果」；模拟器属性面板不计算。'
              : b.cats.includes('经济') || b.cats.includes('费用')
                ? '这是经济/费用类效果（采集、造价、研究等），以游戏原文为准，模拟器不计算。'
                : '该效果尚未编码进模拟器，以游戏原文为准。'}
          </p>
        )}
      </section>
      <section className="bonus-evidence-section">
        <h4>来源与原文</h4>
        <p className="note">{b.en || '暂无英文说明。'}</p>
        <p>
          <BonusTags b={b} includeTeam={false} includeFresh={false} />
        </p>
        {b.fresh === false && (
          <div className="civ-bonus-dialog-warning">
            <strong>游戏说明文字与游戏数据数值不一致（以游戏数据为准）</strong>
            <p>保留两边的原记录；本工具沿用现有回退规则，不以本弹层重新裁定游戏数值。</p>
          </div>
        )}
      </section>
      <section className="bonus-evidence-section">
        <h4>游戏数据原始效果</h4>
        {rawPresent ? (
          <details className="datfx">
            <summary>展开原始记录（{b.dat.length + (b.eco.length ? 1 : 0)} 条）</summary>
            {b.dat.map(rawEntry)}
            {b.eco.length > 0 && (
              <section>
                <h5>团队加成经济项</h5>
                <ul>
                  {b.eco.map((item, index) => (
                    <li key={index}>{ecoText(item, (id) => core.unitById[id]?.zh ?? core.buildingById[id]?.zh)}</li>
                  ))}
                </ul>
              </section>
            )}
          </details>
        ) : (
          <p className="note">暂无本条对应的原始数据记录；英文说明仍可阅读。</p>
        )}
      </section>
      <p className="note">
        措辞帮助：<Link to="/glossary/rate-and-time">速率与耗时</Link> · <Link to="/glossary/stronger-effect">科技效果更强</Link>
      </p>
    </div>
  );
}
