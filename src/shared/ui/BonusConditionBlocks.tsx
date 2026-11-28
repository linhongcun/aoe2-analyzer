import { Link } from 'react-router-dom';
import { civByEn } from '../../data';
import type { CivBonusEnt, Example, TechExampleBlock } from '../../domain/civBonus';
import type { CivRelicBonus } from '../../domain/effects';
import { AGE_ZH } from '../../domain/ratings';
import type { NumStat } from '../../domain/types';
import { fmtStat } from '../utils/simFormat';
import { StatIcon, UnitIcon } from './art';
import { Icon } from './Icon';
import { NumWrappedText } from './widgets';

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
const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
const isArmorPair = (stats: readonly NumStat[]) => stats.length === 2 && stats[0] === 'ma' && stats[1] === 'pa';
const wrapCountUnits = (text: string) =>
  text.split(/(\d+\s*项)/g).map((part, index) =>
    index % 2 ? (
      <span className="num nw" key={index}>
        {part}
      </span>
    ) : (
      <NumWrappedText key={index} text={part} />
    ),
  );

function formatStatGroup(stats: readonly NumStat[], values: readonly number[]): string {
  return stats.map((k, i) => fmtStat(k, values[i]!)).join('/');
}

function formatDeltaGroup(stats: readonly NumStat[], base: readonly number[], after: readonly number[], isMul: boolean): string {
  if (isMul && stats.length === 1 && base[0]! > 0) {
    const pct = Math.round((after[0]! / base[0]! - 1) * 100);
    return `${signed(pct)}%`;
  }
  return stats.map((_, i) => signed(Math.round((after[i]! - base[i]!) * 100) / 100)).join('/');
}

function statLabel(stats: readonly NumStat[]): string {
  if (isArmorPair(stats)) return '近战 / 穿刺护甲';
  return stats.map((s) => STAT_ZH[s]?.[0] ?? s).join(' / ');
}

function chainColLabel(unitZh: string, stats: readonly NumStat[]): string {
  if (isArmorPair(stats)) return `${unitZh}护甲（近/穿）`;
  return `${unitZh}${statLabel(stats)}`;
}

function StatIcons({ stats }: { stats: readonly NumStat[] }) {
  return (
    <>
      {stats.map((s) => (
        <StatIcon key={s} k={STAT_ZH[s]?.[1] ?? ''} t={STAT_ZH[s]?.[0] ?? s} />
      ))}
    </>
  );
}

/** issue 1383：立陶宛圣物加攻条件计入说明块（加成百科与文明页弹窗共用）。 */
export function RelicConditionCallout({ relicFx }: { relicFx: CivRelicBonus }) {
  return (
    <div className="bonus-cond-note" data-t="bonus-relic-condition-note">
      <p>
        <strong>条件计入</strong>：每在修道院驻守 <span className="num nw">1 件</span>圣物，骑士系和烈堤司攻击{' '}
        <span className="num nw">+{relicFx.perRelicAtk}</span>，最多 <span className="num nw">+{relicFx.maxAtk}</span>。本站默认按{' '}
        <span className="num nw">0 件</span>计算，不自动叠加；在
        <Link className="ulink" to="/unit/569/Lithuanians/4/?civ=Lithuanians&tab=sim">
          科技模拟器
        </Link>
        和
        <Link className="ulink" to="/duel?a=569.Lithuanians.4.f.&b=569.Franks.4.f.&m=1">
          单位 PK
        </Link>{' '}
        里可选 <span className="num nw">0–{relicFx.maxRelics} 件</span>，城堡时代起生效。
      </p>
    </div>
  );
}

/** 科技触发型数值示例卡片（详情页与文明页「作用与依据」弹层共用，issue 1513）。 */
function TechExampleCard({ block, civZh }: { block: TechExampleBlock; civZh: string }) {
  const { kind, unit, stats, delayAge, rows } = block;
  if (kind === 'enhance') {
    return (
      <article className="bex-tech-card" data-t="bonus-tech-example-card" data-tech-example-kind="enhance" data-example-unit={unit.id}>
        <div className="bex-tech-head">
          <div className="bex-tech-title">
            <Link className="ulink bex-unit-link" to={`/unit/${unit.id}`}>
              <UnitIcon u={unit} />
              <span>{unit.zh}</span>
            </Link>
          </div>
          <div className="bex-tech-meta">
            <StatIcons stats={stats} />
            <span>{statLabel(stats)}</span>
          </div>
        </div>
        <table className="stat bextab bextab-tech">
          <thead>
            <tr>
              <th>研究阶段</th>
              <th>普通文明</th>
              <th>{civZh}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className={row.isBase ? 'bex-base-row' : undefined}>
                <td>
                  <span>{row.label}</span>
                  {row.delayAge && <span className="bonus-tech-delay">{AGE_ZH[row.delayAge]!.slice(0, 2)}起</span>}
                </td>
                <td>
                  {row.isBase ? (
                    <span className="num nw">{formatStatGroup(row.stats, row.baseValues)}</span>
                  ) : (
                    <span className="bex-val-pair">
                      <span className="bex-val num nw">{formatStatGroup(row.stats, row.normalValues ?? row.baseValues)}</span>
                      <span className="bex-delta num nw">{formatDeltaGroup(row.stats, row.baseValues, row.normalValues ?? row.baseValues, row.isMul)}</span>
                    </span>
                  )}
                </td>
                <td>
                  {row.isBase ? (
                    <span className="num nw">{formatStatGroup(row.stats, row.baseValues)}</span>
                  ) : (
                    <span className="bex-val-pair">
                      <b className="up num nw">{formatStatGroup(row.stats, row.civValues)}</b>
                      <span className="bex-delta up num nw">{formatDeltaGroup(row.stats, row.baseValues, row.civValues, row.isMul)}</span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    );
  }

  if (kind === 'chain') {
    return (
      <article className="bex-tech-card" data-t="bonus-tech-example-card" data-tech-example-kind="chain" data-example-unit={unit.id}>
        <div className="bex-tech-head">
          <div className="bex-tech-title bex-chain-title">
            <StatIcons stats={stats} />
            <span>{statLabel(stats)}链</span>
          </div>
          {delayAge && <span className="bonus-tech-delay">{AGE_ZH[delayAge]}起</span>}
        </div>
        <table className="stat bextab bextab-tech">
          <thead>
            <tr>
              <th>研究阶段</th>
              <th>{chainColLabel(unit.zh, stats)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className={row.isBase ? 'bex-base-row' : undefined}>
                <td>
                  <span>{row.label}</span>
                  {row.delayAge && <span className="bonus-tech-delay">{AGE_ZH[row.delayAge]!.slice(0, 2)}起</span>}
                </td>
                <td>
                  {row.isBase ? (
                    <span className="num nw">{formatStatGroup(row.stats, row.baseValues)}</span>
                  ) : (
                    <span className="bex-arrow-val">
                      <span className="num nw">{formatStatGroup(row.stats, row.baseValues)}</span> <Icon name="arrow-right" />{' '}
                      <b className="up num nw">{formatStatGroup(row.stats, row.civValues)}</b>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    );
  }

  const isStack = kind === 'stack';
  return (
    <article className="bex-tech-card" data-t="bonus-tech-example-card" data-tech-example-kind={kind} data-example-unit={unit.id}>
      <div className="bex-tech-head">
        <div className="bex-tech-title">
          <Link className="ulink bex-unit-link" to={`/unit/${unit.id}`}>
            <UnitIcon u={unit} />
            <span>{unit.zh}</span>
          </Link>
        </div>
        <div className="bex-tech-meta">
          {isStack ? (
            <>
              <StatIcons stats={stats} />
              <span>{statLabel(stats)}</span>
            </>
          ) : (
            <span>基础值变化</span>
          )}
        </div>
      </div>
      <table className="stat bextab bextab-tech">
        <thead>
          <tr>
            <th>{isStack ? '研究进度' : '触发科技'}</th>
            <th className="bex-stat-col">属性</th>
            <th>数值变化</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className={row.isBase ? 'bex-base-row' : undefined}>
              <td>
                {wrapCountUnits(row.label)}
                {row.delayAge && <span className="bonus-tech-delay">{AGE_ZH[row.delayAge]!.slice(0, 2)}起</span>}
              </td>
              <td className="bex-stat-col">
                <StatIcons stats={row.stats} />
                <span>{statLabel(row.stats)}</span>
              </td>
              <td>
                {row.isBase ? (
                  <span className="bex-base-val">
                    <span className="num nw">{formatStatGroup(row.stats, row.baseValues)}</span>
                    <span>（基础）</span>
                  </span>
                ) : (
                  <span className="bex-arrow-val">
                    <span className="num nw">{formatStatGroup(row.stats, row.baseValues)}</span> <Icon name="arrow-right" />{' '}
                    <b className="up num nw">{formatStatGroup(row.stats, row.civValues)}</b>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

function TechExampleNote({ ex, civZh }: { ex: Example; civZh: string }) {
  const blocks = ex.techBlocks ?? [];
  if (!blocks.length) return null;
  const first = blocks[0]!;
  if (ex.techMode === 'enhance') {
    const unavail = ex.unavailableTechs ?? [];
    const text = unavail.length
      ? `注：${civZh}总值已包含普通科技本身，不再重复相加；${civZh}无法研究${unavail.map((t) => t.zh).join('、')}，未计入。`
      : `注：${civZh}总值已包含普通科技本身，不再重复相加；不含其他科技与团队加成。`;
    return <p className="note bex-tech-footnote">{text}</p>;
  }
  if (ex.techMode === 'chain') {
    const delays = blocks.map((blk) => blk.delayAge).filter((a): a is number => a !== null);
    const maxDelayAge = delays.length ? Math.max(...delays) : null;
    const text = maxDelayAge ? `注：均以${AGE_ZH[maxDelayAge]}起生效计算；不含其他科技与团队加成。` : '注：仅计所列科技与本加成；不含其他科技与团队加成。';
    return <p className="note bex-tech-footnote">{text}</p>;
  }
  if (ex.techMode === 'independent') {
    return <p className="note bex-tech-footnote">注：仅计所列科技对{first.unit.zh}的触发效果；不含其他科技与团队加成。</p>;
  }
  const overlap = first.selfOverlap;
  if (overlap) {
    const statName = STAT_ZH[overlap.stat]?.[0] ?? overlap.stat;
    const poolLabel = overlap.buildingZh ? `${overlap.buildingZh}科技` : '触发科技';
    const fullLabel = overlap.buildingZh ? `满${overlap.buildingZh}科技` : '满触发科技';
    const selfParts = overlap.selfTechs.map((s) => `「${s.tech.zh}」自身 ${signed(s.delta)} ${statName}`).join('、');
    const text = `仅计本加成（每项${poolLabel} ${signed(overlap.perTechAdd)}）；若同时计入${selfParts}，${fullLabel}${first.unit.zh}为 ${fmtStat(overlap.stat, overlap.combinedTotal)} ${statName}。`;
    return (
      <p className="note bex-tech-self-note" data-t="bonus-tech-self-note">
        <Icon name="info" className="ic" />
        <span>
          <NumWrappedText text={text} />
        </span>
      </p>
    );
  }
  return <p className="note bex-tech-footnote">注：仅计本加成；不含其他科技与团队加成。</p>;
}

/** 详情页与文明页弹层共用的数值示例完整区块（兼容常规、圣物条件与科技触发三种形态）。 */
export function BonusExampleSection({ b, ex, variant }: { b: CivBonusEnt; ex: Example; variant: 'default' | 'evidence' }) {
  const civZh = civByEn(b.civ)?.zh ?? b.civ;
  if (ex.techBlocks?.length) {
    const firstUnit = ex.techBlocks[0]!.unit;
    const sub =
      ex.techMode === 'enhance'
        ? `（普通文明与${civZh}对比，均含科技本身）`
        : ex.techMode === 'stack'
          ? '（基础值，仅计本加成）'
          : '（基础值，仅计所列科技与本加成）';
    const body = (
      <div className="bex" data-t="bonus-tech-example">
        {variant === 'default' && (
          <h4 className="bex-tech-heading">
            {ex.techMode === 'chain' ? (
              <>
                数值示例：
                <Link className="ulink bex-unit-link" to={`/unit/${firstUnit.id}`}>
                  <UnitIcon u={firstUnit} />
                  <span>{firstUnit.zh}</span>
                </Link>
              </>
            ) : (
              '数值示例'
            )}
            <small className="note">{sub}</small>
          </h4>
        )}
        {variant === 'evidence' && ex.techMode === 'chain' && (
          <h5 className="bex-chain-unit">
            <Link className="ulink bex-unit-link" to={`/unit/${firstUnit.id}`}>
              <UnitIcon u={firstUnit} />
              <span>{firstUnit.zh}</span>
            </Link>
          </h5>
        )}
        <div className={ex.techBlocks.length > 1 ? 'bex-tech-grid multi' : 'bex-tech-grid'}>
          {ex.techBlocks.map((block, index) => (
            <TechExampleCard key={`${block.unit.id}-${block.stats.join('-')}-${index}`} block={block} civZh={civZh} />
          ))}
        </div>
        <TechExampleNote ex={ex} civZh={civZh} />
      </div>
    );
    if (variant === 'evidence') {
      return (
        <section className="bonus-evidence-section">
          <h4>数值示例</h4>
          {body}
        </section>
      );
    }
    return body;
  }

  const subtitle = ex.relicRows?.length ? '（基础值，仅计这一条加成；按驻守圣物件数，城堡时代起）' : '（基础值，仅计这一条加成）';
  if (variant === 'evidence') {
    return (
      <section className="bonus-evidence-section">
        <h4>数值示例</h4>
        <div className="bex">
          <h5>
            <Link className="ulink" to={ex.kind === 'unit' ? `/unit/${ex.id}` : `/building/${ex.id}`}>
              {ex.name}
            </Link>
            <small className="note">{subtitle}</small>
          </h5>
          <BonusExampleTable b={b} ex={ex} />
        </div>
      </section>
    );
  }
  return (
    <div className="bex">
      <h4>
        数值示例：
        <Link className="ulink" to={ex.kind === 'unit' ? `/unit/${ex.id}` : `/building/${ex.id}`}>
          {ex.name}
        </Link>
        <small className="note">{subtitle}</small>
      </h4>
      <BonusExampleTable b={b} ex={ex} />
    </div>
  );
}

/** 加成详情页与文明页「作用与依据」弹窗共用的数值示例表（含条件触发圣物 0–4 件模式）。 */
function BonusExampleTable({ b, ex }: { b: CivBonusEnt; ex: Example }) {
  if (ex.relicRows?.length) {
    return (
      <table className="stat bextab" data-t="bonus-relic-example-table">
        <tbody>
          {ex.relicRows.map((row) => (
            <tr key={row.relics}>
              <td className="num nw">驻守 {row.relics} 件</td>
              <td>
                <StatIcon k={STAT_ZH[row.stat]?.[1] ?? ''} t={STAT_ZH[row.stat]?.[0]} />
                {STAT_ZH[row.stat]?.[0] ?? row.stat}
              </td>
              <td className="num nw">
                {row.relics === 0 ? (
                  <>{fmtStat(row.stat, row.before)}（默认）</>
                ) : (
                  <>
                    {fmtStat(row.stat, row.before)} <Icon name="arrow-right" /> <b className="up">{fmtStat(row.stat, row.after)}</b>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
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
  );
}
