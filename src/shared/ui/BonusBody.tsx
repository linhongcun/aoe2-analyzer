/** 文明/团队加成的效果说明：中英原文、适用时代、数值示例（之前→之后）、作用对象（与模拟器同一判定） */
import { Link } from 'react-router-dom';
import { civByEn } from '../../data';
import { useCore } from '../../data/hooks';
import { bonusAffects, bonusExample, type CivBonusEnt } from '../../domain/civBonus';
import { groupLines } from '../../domain/family';
import { linkify } from '../../domain/linker';
import { AGE_ZH } from '../../domain/ratings';
import { BuildingLink, StatIcon, UnitLinks } from './art';
import { Icon } from './Icon';
import { Linked, Loading } from './widgets';
import { fmtStat } from '../utils/simFormat';
import { LineChip } from './LineChip';
import type { Unit } from '../../domain/types';
import { collapse } from '../../domain/family';
import { ecoText } from '../../domain/datEffects';
import { bonusUsage, showEcoSourceTag, usageLevel, type BonusUsageLine } from '../../domain/bonusUsage';

const SRC_TAG: Record<string, [string, string]> = {
  dat: ['ok', '数值来源：游戏 .dat'],
  manual: ['txt', '数值来源：手工规则（.dat 缺少该项）'],
  eco: ['ok', '.dat 经济/费用效果（文本展示）'],
  text: ['txt', '无 .dat 数据'],
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

export function BonusTags({ b }: { b: CivBonusEnt }) {
  const usage = b.encoded ? [] : bonusUsage(b);
  // issue 317（Steve 设计审查）：已有工具计入的经济/费用类加成不显示「文本展示」来源标签，见 showEcoSourceTag
  const src = SRC_TAG[b.src] && showEcoSourceTag(b) ? SRC_TAG[b.src] : undefined;
  return (
    <>
      {b.team && <span className="tag team">团队加成 · 作用于盟友</span>}
      {b.cats.map((c) => (
        <span key={c} className="tag">
          {c}
        </span>
      ))}
      {b.ages && <span className="tag">{ageTxt(b.ages)}时代</span>}
      {b.encoded ? <span className="tag ok">已计入数值</span> : <UsageTags lines={usage} />}
      {src && <span className={'tag ' + src[0]}>{src[1]}</span>}
      {b.fresh === false && <span className="tag txt">游戏说明文字与 .dat 数值不一致（以 .dat 为准）</span>}
    </>
  );
}

const toolNames = (ls: BonusUsageLine[]) => ls.map((l) => l.name).join('、');
/** issue 317：经济/费用类加成按工具写明已计入 / 未计入；没有任何工具计入时仍为「仅文本，未计入数值」 */
function UsageTags({ lines }: { lines: BonusUsageLine[] }) {
  if (usageLevel(lines) === 'none') return <span className="tag txt">仅文本，未计入数值</span>;
  const on = lines.filter((l) => l.on === true),
    off = lines.filter((l) => l.on === false),
    unk = lines.filter((l) => l.on === null);
  return (
    <>
      <span className="tag ok">已计入：{toolNames(on)}</span>
      {off.length > 0 && <span className="tag txt">未计入：{toolNames(off)}</span>}
      {unk.length > 0 && <span className="tag txt">未逐条核对：{toolNames(unk)}</span>}
    </>
  );
}
const USAGE_ICON = { true: 'check', false: 'x', null: 'circle-help' } as const;

/** Keep the scoped sourced quantity phrases together in both detail and sidebar text. */
const bengaliQuantity = (text: string, linked: boolean) =>
  text.split(/(\d+\s*个村民)/g).map((part, index) =>
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

export default function BonusBody({ b, compact }: { b: CivBonusEnt; compact?: boolean }) {
  const core = useCore();
  if (!core) return <Loading />;
  const groups = bonusAffects(b, core.units, core.buildings);
  const mayanTimeline = b.id === 'Mayans-1';
  const sicilianConstruction = b.id === 'Sicilians-4';
  const usage = b.encoded && !mayanTimeline && !sicilianConstruction ? [] : bonusUsage(b);
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
  return (
    <div className={'bonusbody' + (compact ? ' compact' : '')}>
      <p className="bz">
        <BonusText b={b} />
      </p>
      <p className="note">{b.en}</p>
      <p>
        <BonusTags b={b} />
      </p>
      {b.team && <p className="note">团队加成对你和所有盟友生效（包括你自己）。</p>}
      {ex && (
        <div className="bex">
          <h4>
            数值示例：
            <Link className="ulink" to={ex.kind === 'unit' ? `/unit/${ex.id}` : `/building/${ex.id}`}>
              {ex.name}
            </Link>
            <small className="note">（基础值，仅计这一条加成）</small>
          </h4>
          <table className="stat bextab">
            <tbody>
              {ex.rows.map(([ages, k, a, v], i) => (
                <tr key={i}>
                  {!b.team && <td>{ageTxt(ages)}</td>}
                  <td>
                    <StatIcon k={STAT_ZH[k]?.[1] ?? ''} t={STAT_ZH[k]?.[0]} />
                    {STAT_ZH[k]?.[0] ?? k}
                  </td>
                  <td>
                    {fmtStat(k, a)} <Icon name="arrow-right" /> <b className="up">{fmtStat(k, v)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                ：{b.id === 'Bengalis-0' ? bengaliQuantity(l.note, false) : l.note}
              </li>
            ))}
          </ul>
          {sicilianConstruction ? (
            <p>普通开局已有首座城镇中心，施工加成从起点计入；新城镇中心按实际施工形态计算。农田储量和续种未模拟，各工具沿用各自的计算口径。</p>
          ) : mayanTimeline ? (
            <p>开局按连续采集估算，资源储量和耗尽未模拟；其它工具沿用各自的计算口径。</p>
          ) : (
            <p>单位模拟器属性面板不计算经济/费用类效果{b.dat.length + b.eco.length > 0 ? '，结构化数值见下方「.dat 原始效果」' : ''}。</p>
          )}
        </div>
      )}
      {!b.encoded && usage.length === 0 && (
        <p className="note">
          <Icon name="triangle-alert" className="ic warn" />
          仅文本，未计入数值：
          {b.src === 'eco'
            ? '经济/费用类效果，结构化数值见下方「.dat 原始效果」；模拟器属性面板不计算。'
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
          <summary>.dat 原始效果（{b.dat.length + (b.eco.length ? 1 : 0)} 条）</summary>
          <ul>
            {b.dat.map((e) => (
              <li key={e.tech}>
                <code>
                  #{e.tech} {e.name}
                </code>
                {e.age > 1 && <small className="note"> · {AGE_ZH[e.age]}</small>}
                {e.req.length > 0 && <small className="note"> · 需 {e.req.join(' + ')}</small>}
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
