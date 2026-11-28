/** 文明/团队加成的效果说明：中英原文、适用时代、数值示例（之前→之后）、作用对象（与模拟器同一判定） */
import { Link } from 'react-router-dom';
import { civByEn } from '../../data';
import { useCore } from '../../data/hooks';
import {
  bonusAffects,
  bonusExample,
  bonusUnavailableTechs,
  buildTechByEn,
  datEntryUnavailableTechs,
  type BonusAffectGroup,
  type CivBonusEnt,
} from '../../domain/civBonus';
import { bonusLevel, bonusUsage, LEVEL_ZH, showEcoSourceTag } from '../../domain/bonusUsage';
import { ecoText } from '../../domain/datEffects';
import { collapse } from '../../domain/family';
import { linkify } from '../../domain/linker';
import { AGE_ZH } from '../../domain/ratings';
import type { Tech, Unit } from '../../domain/types';
import { BuildingLink, UnitLinks } from './art';
import { BonusExampleSection, RelicConditionCallout } from './BonusConditionBlocks';
import { BonusAffectList, BonusRawEvidenceEntry } from './BonusTechAffects';
import { Icon } from './Icon';
import { Linked, Loading, NumWrappedText } from './widgets';

const SRC_TAG: Record<string, [string, string]> = {
  dat: ['ok', '数值来自游戏数据'],
  manual: ['txt', '数值为本站手工规则（游戏数据缺少该项）'],
  eco: ['ok', '游戏数据含经济/费用效果（仅文字展示）'],
  text: ['txt', '游戏数据无对应记录'],
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

function usageFootnote(b: CivBonusEnt): string {
  if (b.id === 'Sicilians-4')
    return '普通开局已有首座城镇中心，施工加成从起点计入；新城镇中心按实际施工形态计算。农田储量和续种未模拟，各工具沿用各自的计算口径。';
  if (b.id === 'Mayans-1') return '开局按连续采集估算，资源储量和耗尽未模拟；其它工具沿用各自的计算口径。';
  if (!b.encoded) return `单位模拟器属性面板不计算经济/费用类效果${b.dat.length + b.eco.length > 0 ? '，结构化数值见下方「游戏数据原始效果」' : ''}。`;
  const hasEcoData = b.eco.length > 0 || b.dat.some((e) => e.eco.length > 0);
  return hasEcoData
    ? '已编码的单位/建筑属性计入模拟器；经济/费用类效果不进模拟器属性面板，结构化数值见下方「游戏数据原始效果」。'
    : '已编码的单位/建筑属性计入模拟器；以上列出其他工具的计入情况，各工具沿用各自的计算口径。';
}

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
const USAGE_NUM_RE = /([+-]?\d+(?:\/\d+)*(?:\.\d+)?\s*(?:%|项|个?村民|人口|[个套]模板|套开局))/g;
const formatUsageNote = (text: string) =>
  text.split(USAGE_NUM_RE).map((part, index) =>
    index % 2 ? (
      <span className="num nw" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  );
export function BonusText({ b, linked = true }: { b: CivBonusEnt; linked?: boolean }) {
  if (b.id === 'Bengalis-0') return bengaliQuantity(b.zh, linked);
  if (b.civ !== 'Sicilians' && (b.civ !== 'Tatars' || b.idx !== 2)) return linked ? <Linked text={b.zh} wrapNums /> : <NumWrappedText text={b.zh} />;
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

function BonusUsageList({ b, usage }: { b: CivBonusEnt; usage: ReturnType<typeof bonusUsage> }) {
  return (
    <>
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
            ：{formatUsageNote(item.note)}
          </li>
        ))}
      </ul>
      <p>{usageFootnote(b)}</p>
    </>
  );
}

function TextOnlyWarning({ b }: { b: CivBonusEnt }) {
  return (
    <p className="note">
      <Icon name="triangle-alert" className="ic warn" />
      仅文本，未计入数值：
      {b.src === 'eco'
        ? '经济/费用类效果，结构化数值见下方「游戏数据原始效果」；模拟器属性面板不计算。'
        : b.cats.includes('经济') || b.cats.includes('费用')
          ? '这是经济/费用类效果（采集、造价、研究等），以游戏原文为准，模拟器不计算。'
          : '该效果尚未编码进模拟器，以游戏原文为准。'}
    </p>
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
  const groups = bonusAffects(b, core.units, core.buildings, true, core.techs);
  const unavailTechs = bonusUnavailableTechs(b, core.techs);
  const techByEn = buildTechByEn(core.techs);
  const usage = bonusUsage(b);
  const ex = bonusExample(b, core.units, core.buildings, b.civ === 'Franks' && b.idx === 2 ? 'Paladin' : undefined, core.techs);
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
  const hasUnownedMention = !b.team && (mu.some((u) => !u.civs.includes(b.civ)) || mb.some((x) => !x.civs.includes(b.civ)));
  const mentionNote = hasUnownedMention
    ? '根据说明文字推断，仅列出说明中提及的词条（含本文明不可建造或训练的对象），非结构化作用名单。'
    : '根据说明文字推断，非结构化对象名单。';
  const rawCount = b.dat.length + (b.eco.length ? 1 : 0);
  if (variant === 'evidence')
    return (
      <BonusEvidenceSections
        b={b}
        core={core}
        compact={compact}
        groups={groups}
        unavailTechs={unavailTechs}
        techByEn={techByEn}
        usage={usage}
        ex={ex}
        mu={mu}
        mb={mb}
        mentionNote={mentionNote}
      />
    );
  return (
    <div className={'bonusbody' + (compact ? ' compact' : '')}>
      {head && (
        <>
          <p className="bz">
            <BonusText b={b} />
          </p>
          <p className="note">{b.en ? <NumWrappedText text={b.en} /> : ''}</p>
          <p>
            <BonusTags b={b} />
          </p>
        </>
      )}
      {b.team && <p className="note">团队加成对你和所有盟友生效（包括你自己）。</p>}
      {b.relicFx && <RelicConditionCallout relicFx={b.relicFx} />}
      {ex && <BonusExampleSection b={b} ex={ex} variant="default" />}
      {usage.length > 0 && (
        <div className="note busage">
          <p>各工具计入情况：</p>
          <BonusUsageList b={b} usage={usage} />
        </div>
      )}
      {!b.encoded && usage.length === 0 && <TextOnlyWarning b={b} />}
      <p className="note">
        措辞帮助：<Link to="/glossary/rate-and-time">速率与耗时</Link> · <Link to="/glossary/stronger-effect">科技效果更强</Link>
      </p>
      {groups.length > 0 ? (
        <h4>作用对象{b.team ? '（所有拥有该单位的文明）' : `（${civByEn(b.civ)?.zh} 拥有的）`}</h4>
      ) : !b.encoded && mu.length + mb.length > 0 ? (
        <h4>作用对象</h4>
      ) : null}
      <BonusAffectList b={b} core={core} groups={groups} unavailTechs={unavailTechs} />
      {!b.encoded && mu.length + mb.length > 0 && (
        <>
          <p className="note">{mentionNote}</p>
          <div className="uchips">
            <UnitLinks list={collapse(mu, core.fam)} />
            {mb.map((x) => (
              <BuildingLink key={x.id} b={x} />
            ))}
          </div>
        </>
      )}
      {(b.dat.length > 0 || b.eco.length > 0) && (
        <details className="datfx">
          <summary>
            游戏数据原始效果（<span className="num nw">{rawCount} 条</span>）
          </summary>
          <ul>
            {b.dat.map((e) => {
              const fxCount = e.rules.reduce((n, r) => n + r.fx.length, 0);
              const unavailReqs = datEntryUnavailableTechs(e.req, b, techByEn);
              const rulesNote = e.rulesUnowned
                ? '（仅指向本文明不可用对象，未计入战斗属性）'
                : unavailReqs.length > 0
                  ? `（前置科技${unavailReqs.map((t) => `「${t.zh}」`).join('、')}本文明无法研究，未计入上方对象明细）`
                  : '（见上方作用对象）';
              return (
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
                  {e.rules.length > 0 && (
                    <small className="note">
                      {' '}
                      · 属性命令 <span className="num nw">{fxCount} 条</span>
                      {rulesNote}
                    </small>
                  )}
                  {e.eco.length > 0 && (
                    <ul>
                      {e.eco.map((x, i) => (
                        <li key={i}>{ecoText(x, (id) => core.unitById[id]?.zh ?? core.buildingById[id]?.zh)}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
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
    </div>
  );
}

type EvidenceProps = {
  b: CivBonusEnt;
  core: CoreData;
  compact?: boolean;
  groups: readonly BonusAffectGroup[];
  unavailTechs: readonly Tech[];
  techByEn: ReadonlyMap<string, Tech>;
  usage: ReturnType<typeof bonusUsage>;
  ex: ReturnType<typeof bonusExample>;
  mu: Unit[];
  mb: NonNullable<CoreData['buildingById'][number]>[];
  mentionNote: string;
};

function BonusEvidenceSections({ b, core, compact, groups, unavailTechs, techByEn, usage, ex, mu, mb, mentionNote }: EvidenceProps) {
  const rawPresent = b.dat.length > 0 || b.eco.length > 0;
  return (
    <div className={'bonusbody' + (compact ? ' compact' : '')}>
      <section className="bonus-evidence-section">
        <h4>作用对象</h4>
        <BonusAffectList b={b} core={core} groups={groups} unavailTechs={unavailTechs} />
        {!b.encoded && mu.length + mb.length > 0 && <p className="note">{mentionNote}</p>}
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
      {ex && <BonusExampleSection b={b} ex={ex} variant="evidence" />}
      <section className="bonus-evidence-section">
        <h4>本站工具计入情况</h4>
        {usage.length ? (
          <div className="note busage">
            <BonusUsageList b={b} usage={usage} />
          </div>
        ) : (
          <p className="note">暂无逐工具明细；以各工具的实际说明为准。</p>
        )}
        {!b.encoded && !usage.length && <TextOnlyWarning b={b} />}
      </section>
      <section className="bonus-evidence-section">
        <h4>来源与原文</h4>
        <p className="note">{b.en ? <NumWrappedText text={b.en} /> : '暂无英文说明。'}</p>
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
            <summary>
              展开原始记录（<span className="num nw">{b.dat.length + (b.eco.length ? 1 : 0)} 条</span>）
            </summary>
            {b.dat.map((entry) => (
              <BonusRawEvidenceEntry key={entry.tech} b={b} core={core} entry={entry} techByEn={techByEn} />
            ))}
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
