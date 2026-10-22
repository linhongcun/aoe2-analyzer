import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { civByEn } from '../../data';
import { useCore } from '../../data/hooks';
import {
  TEAM_BONUS_DATA,
  TEAM_EFFECT_ZH,
  TEAM_TARGETS,
  TEAM_TARGET_ZH,
  decodeTeamBonuses,
  defaultTeamBonusConfig,
  encodeTeamBonuses,
  setTeamResearched,
  teamBonusErrors,
  teamBonusSources,
  teamTargetMatch,
  teamTechnologyStatus,
  updateTeamRoster,
  type TeamBonusConfig,
  type TeamProvider,
  type TeamTargetSource,
  type TeamTechnologyRow,
  type TeamPermanentRow,
} from '../../domain/teamBonuses';
import { AGE_ZH, RES_ZH } from '../../domain/ratings';
import type { Core } from '../../data';
import { CivPicker } from '../../shared/ui/CivPicker';
import { Icon } from '../../shared/ui/Icon';
import { Linked, Loading } from '../../shared/ui/widgets';
import './teamBonuses.css';

export default function TeamBonuses() {
  const location = useLocation(),
    navigate = useNavigate(),
    core = useCore();
  const decoded = useMemo(() => decodeTeamBonuses(location.search), [location.search]);
  const [status, setStatus] = useState(''),
    [manualLink, setManualLink] = useState('');
  const config = decoded.config,
    sources = teamBonusSources(config);
  const valid = !decoded.locked && !teamBonusErrors(config).length;
  const update = (next: TeamBonusConfig) => {
    if (decoded.locked) return;
    navigate({ pathname: '/team-bonuses', search: '?' + encodeTeamBonuses(next) }, { replace: true });
    setStatus('');
    setManualLink('');
  };
  const reset = () => {
    navigate({ pathname: '/team-bonuses', search: '?' + encodeTeamBonuses(defaultTeamBonusConfig()) }, { replace: true });
    setStatus('阵容已重置。');
    setManualLink('');
  };
  const share = async () => {
    if (!valid) return;
    const url = new URL(document.baseURI);
    url.hash = '/team-bonuses?' + encodeTeamBonuses(config);
    try {
      await navigator.clipboard.writeText(url.href);
      setStatus('阵容链接已复制，包含玩家顺序、筛选和此页的研究状态。');
      setManualLink('');
    } catch {
      setStatus('自动复制失败，请手动复制下方链接。');
      setManualLink(url.href);
    }
  };
  if (!core) return <Loading />;
  const permanent = sources.permanent.filter((row) => teamTargetMatch(row.source, config) === 'match');
  const technologies = sources.technologies.filter((row) => teamTargetMatch(row.source, config) === 'match');
  const unknownPermanent = sources.permanent.filter((row) => teamTargetMatch(row.source, config) === 'unknown');
  const unknownTechnologies = sources.technologies.filter((row) => teamTargetMatch(row.source, config) === 'unknown');
  return (
    <section className="pane team-bonuses-page" data-testid="team-bonuses-page">
      <header className="team-heading">
        <div>
          <h1>队伍加成一屏汇总</h1>
          <p className="note">选择队友文明，检查常驻效果与需要研究的团队科技。</p>
        </div>
        <button className="btn" type="button" disabled={!valid} onClick={() => void share()}>
          <Icon name="copy" />
          复制队伍方案
        </button>
      </header>
      <nav className="bar" aria-label="队伍相关工具">
        <Link className="community-tool-entry" to="/team-plan">
          约定团战分工与支援
        </Link>
        <Link className="community-tool-entry" to="/relic-income">
          按明确来源预览圣物收益
        </Link>
      </nav>
      <aside className="team-notice" aria-label="汇总口径">
        <strong>包含本人，按效果来源汇总</strong>
        <p>重复文明的同一来源只列一条，保留全部提供者；来源合并用于查阅，不表示叠加倍率。不同来源分别列出，不计算总倍率。</p>
        <p>研究状态只用于此页记录，不读取对局，也不修改单位 PK、建筑或经济模拟器的数值与链接。</p>
      </aside>
      {decoded.locked && (
        <div className="team-error" role="alert">
          <p>{decoded.errors.join(' ')}</p>
          <p>损坏链接已锁定，重置后才能编辑。</p>
          <button className="btn" type="button" onClick={reset}>
            重置队伍方案
          </button>
        </div>
      )}
      {status && <p role="status">{status}</p>}
      {manualLink && (
        <label className="team-manual-link">
          手动复制队伍链接
          <textarea readOnly value={manualLink} rows={3} onFocus={(event) => event.target.select()} />
        </label>
      )}
      {!decoded.locked && (
        <>
          <section className="team-panel" aria-labelledby="team-config-heading">
            <div className="team-heading">
              <h2 id="team-config-heading">玩家阵容</h2>
              <span className="team-number">{config.players.length} / 4 名玩家</span>
            </div>
            <div className="team-players">
              {config.players.map((civ, index) => (
                <div className="team-player" key={index}>
                  <label htmlFor={`team-player-${index}`}>
                    玩家 {index + 1}
                    {index === 0 ? '（本人）' : ''}
                  </label>
                  <CivPicker
                    id={`team-player-${index}`}
                    label={`玩家 ${index + 1} 文明`}
                    value={civ}
                    onChange={(value) =>
                      update(
                        updateTeamRoster(
                          config,
                          config.players.map((old, at) => (at === index ? value : old)),
                        ),
                      )
                    }
                  />
                  <button
                    className="btn"
                    type="button"
                    aria-label={`移除玩家 ${index + 1}`}
                    disabled={config.players.length === 1}
                    onClick={() =>
                      update(
                        updateTeamRoster(
                          config,
                          config.players.filter((_, at) => at !== index),
                        ),
                      )
                    }
                  >
                    <Icon name="x" />
                    移除
                  </button>
                </div>
              ))}
            </div>
            <button
              className="btn"
              type="button"
              disabled={config.players.length >= 4}
              onClick={() => update(updateTeamRoster(config, [...config.players, config.players[0]!]))}
            >
              <Icon name="plus" />
              添加玩家
            </button>
            <div className="team-filters">
              <label>
                当前时代
                <select value={config.age} onChange={(event) => update(updateTeamRoster(config, config.players, Number(event.target.value)))}>
                  {[1, 2, 3, 4].map((age) => (
                    <option key={age} value={age}>
                      {AGE_ZH[age]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                目标类别
                <select value={config.target} onChange={(event) => update({ ...config, target: event.target.value as TeamBonusConfig['target'], unit: null })}>
                  {TEAM_TARGETS.map((target) => (
                    <option key={target} value={target}>
                      {TEAM_TARGET_ZH[target]}
                    </option>
                  ))}
                </select>
              </label>
              {config.target === 'units' && (
                <label>
                  具体单位
                  <select
                    value={config.unit ?? ''}
                    onChange={(event) => update({ ...config, unit: event.target.value === '' ? null : Number(event.target.value) })}
                  >
                    <option value="">全部单位关联</option>
                    {core.units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.zh} · {unit.en}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <p className="note">目标筛选只采用已核对过的单位、建筑及生产关系；没有可靠对应关系的来源单列为“关联范围待核实”，不会用文字关键词猜测完整覆盖。</p>
            <p className="note">
              时代用于团队科技的研究门槛；常驻来源的目标关联覆盖不同时代，不代表当前已解锁。降低时代或移除科技来源时，会清除此页已经不适用的研究标记。
            </p>
          </section>
          <div className="team-summary" data-testid="team-summary">
            <div>
              <strong className="team-number">{sources.permanent.length}</strong>
              <span>常驻加成来源</span>
            </div>
            <div>
              <strong className="team-number">{sources.technologies.length}</strong>
              <span>团队科技来源</span>
            </div>
            <div>
              <strong className="team-number">{config.researched.length}</strong>
              <span>已记录研究</span>
            </div>
          </div>
          <section className="team-section" aria-labelledby="team-permanent-heading">
            <h2 id="team-permanent-heading">常驻团队加成</h2>
            <p className="note">按游戏数据里各文明的团队效果自动识别；不需要勾选研究。具体时代和条件以原说明与数据备注为准。</p>
            <div className="team-cards">
              {permanent.map((row) => (
                <PermanentCard key={row.source.id} row={row} core={core} />
              ))}
            </div>
            {!permanent.length && <p className="team-empty">没有已确认匹配此筛选的常驻来源。</p>}
          </section>
          <section className="team-section" aria-labelledby="team-tech-heading">
            <h2 id="team-tech-heading">需要研究的团队科技</h2>
            <p className="note">默认未研究。勾选表示至少一名列出的来源玩家已研究；不是替游戏验证科技完成情况。</p>
            <div className="team-cards">
              {technologies.map((row) => (
                <TechnologyCard key={row.source.id} row={row} core={core} config={config} update={update} />
              ))}
            </div>
            {!technologies.length && <p className="team-empty">没有已确认匹配此筛选的团队科技来源。</p>}
          </section>
          {!!(unknownPermanent.length + unknownTechnologies.length) && (
            <section className="team-section team-unknown" aria-labelledby="team-unknown-heading">
              <h2 id="team-unknown-heading">关联范围待核实</h2>
              <p>以下来源尚不能按当前目标可靠归类。未显示为已匹配，也不能据此认定没有作用。</p>
              <div className="team-cards">
                {unknownPermanent.map((row) => (
                  <PermanentCard key={row.source.id} row={row} core={core} />
                ))}
                {unknownTechnologies.map((row) => (
                  <TechnologyCard key={row.source.id} row={row} core={core} config={config} update={update} />
                ))}
              </div>
            </section>
          )}
          <details className="team-panel team-model">
            <summary>数据版本与覆盖边界</summary>
            <p>按 DE 185872 版本游戏数据里的团队效果直接整理，没有在游戏里实测。</p>
            <ul>
              {TEAM_BONUS_DATA.meta.scopeNotes.map((note) => (
                <li key={note}>{playerTeamNote(note, core)}</li>
              ))}
            </ul>
            <p>不做阵容评分、胜率预测或效果总倍率；经济资源、共享解锁等特殊机制的部分目标关联仍待核实。</p>
          </details>
        </>
      )}
    </section>
  );
}
function Providers({ providers }: { providers: TeamProvider[] }) {
  return (
    <div className="team-providers" aria-label="来源玩家">
      {providers.map((provider) => (
        <Link className="team-entity" key={provider.player} to={`/civ/${provider.civ}`}>
          玩家 {provider.player} · {civByEn(provider.civ)?.zh}
        </Link>
      ))}
    </div>
  );
}
/**
 * issue 273：team_bonuses.json 的说明由脚本从游戏数据生成，带编号和开发用语；界面上显示时换成玩家能懂的话，数据文件不改。
 * 文案按 Steve 2026-10-22 设计审（PR #360）。
 */
const PLAYER_NOTE: [string, string][] = [
  ['单位目标关联未完全核实；未知资源、科技修改与引擎函数不按文案猜测。', '有些单位是否适用还没核对完；核对不了的效果不按说明文字猜测。'],
  ['存在资源/引擎函数、科技修改或目录外对象，适用目标关联仅部分核实。', '部分效果无法从游戏数据核对，适用单位只核对了一部分。'],
  ['只枚举站内56文明的常驻来源和固定.dat中可研究的团队命令科技。', '只列出本站 56 个文明的常驻团队加成和可研究的团队科技。'],
  ['目标关系是跨时代来源审计，不表示当前已解锁', '目标按所有时代一起列出，不表示当前已解锁'],
  ['未知资源、引擎函数和启用/研究条件均不从说明文案推断目标。', '核对不了的效果和研究条件，都不按说明文字推断适用目标。'],
  ['仅按原始团队命令辨识；默认未研究，不改变任何现有模拟器数值。', '默认按未研究处理，不影响本站其他工具的数值。'],
  ['依赖链保留启用、研究和修改研究时间的区别；启用升级科技不代表已经研究。', '区分「可以研究」「已研究」「研究时间被改」；可以研究不等于已经研究。'],
  ['原始命令为研究触发，未作客户端实测', '研究后生效，没有在游戏里实测'],
  [
    '原始命令直接列出掷石绳骑兵；其余城堡独特单位的引擎目标未核实，保留说明但不编造关联。',
    '游戏数据只直接列出掷石绳骑兵；其他城堡独特单位是否适用还没核实，暂不列出。',
  ],
];
/** 关联科技与前置的玩家写法（Steve 2026-10-22）：前置写「需先研究 / 需先进入…时代」；前置是科技树看不到的内部科技时写触发方式，写不出就写「需先满足游戏内部条件」，都不写编号 */
const AGE_PREREQ: Record<number, string> = { 101: '需先进入封建时代', 102: '需先进入城堡时代', 103: '需先进入帝王时代' };
/** 玩家在游戏里看得到、但不在本站科技表里的科技：用它升级出的单位名称 */
const VISIBLE_TECH_UNIT: Record<number, number> = { 599: 1012 };
/** 内部前置 → 玩家的触发方式（civ 为加成来源文明） */
const INTERNAL_PREREQ: Record<number, (civ: string, core: Core) => string> = {
  601: (civ, core) => `需先获得${core.unitById[1010]?.zh ?? '该单位'}（进入城堡时代后，队伍中有${civ}文明时自动开放）`,
  639: (civ) => `队伍中有${civ}文明时开局自动生效`,
  307: (civ) => `队伍中有${civ}文明时开局自动生效`,
};
export function playerTeamNote(note: string, core: Core, civ?: string): string {
  let out = note;
  const m = /^关联科技编号(\d+)：[^；]+；(.+?)；原始前置为([^，]*)，所需数量为\d+。$/.exec(note);
  if (m) {
    const id = +m[1]!;
    const unit = VISIBLE_TECH_UNIT[id];
    const zh = core.techById[id]?.zh ?? (unit !== undefined ? core.unitById[unit]?.zh : undefined);
    const prereqs = m[3] === '空' ? [] : m[3]!.split('、').map(Number);
    const parts = [
      ...new Set(
        prereqs.map(
          (p) =>
            AGE_PREREQ[p] ??
            (core.techById[p] ? `需先研究${core.techById[p]!.zh}` : (INTERNAL_PREREQ[p]?.(civ ?? '对应', core) ?? '需先满足游戏内部条件（科技树里看不到）')),
        ),
      ),
    ];
    out = `${zh ? `关联科技「${zh}」：` : '关联科技：游戏内部用来实现这条加成的科技（科技树里看不到），'}${[...parts, m[2]!].join('；')}。`;
  }
  for (const [from, to] of PLAYER_NOTE) out = out.replace(from, to);
  return out;
}
function Targets({ source, core }: { source: TeamTargetSource; core: Core }) {
  const civ = 'civ' in source ? civByEn(String(source.civ))?.zh : 'civs' in source ? civByEn(String((source.civs as string[])[0]))?.zh : undefined;
  const unitIds = [...new Set(source.targetUnits)],
    buildingIds = [...new Set(source.targetBuildings)];
  return (
    <details className="team-target-details">
      <summary>查看已核对的目标与条件</summary>
      <p className="note">
        目标覆盖：{source.targetCoverage === 'complete' ? '已解析当前原始命令' : source.targetCoverage === 'partial' ? '部分已解析，其余待核实' : '待核实'}
        。不将这些关联合成为数值结果。
      </p>
      {!!unitIds.length && (
        <div>
          <h4>直接单位关联</h4>
          <div className="team-entities">
            {unitIds.map(
              (id) =>
                core.unitById[id] && (
                  <Link className="team-entity" key={id} to={`/unit/${id}`}>
                    {core.unitById[id]!.zh}
                  </Link>
                ),
            )}
          </div>
        </div>
      )}
      {!!buildingIds.length && (
        <div>
          <h4>直接建筑关联</h4>
          <div className="team-entities">
            {buildingIds.map(
              (id) =>
                core.buildingById[id] && (
                  <Link className="team-entity" key={id} to={`/building/${id}`}>
                    {core.buildingById[id]!.zh}
                  </Link>
                ),
            )}
          </div>
        </div>
      )}
      {!!source.productionUnits.length && (
        <p className="note">另有 {source.productionUnits.length} 种单位由受影响建筑的训练目录建立间接关联；表示生产地点相关，不表示直接修改单位属性。</p>
      )}
      {source.notes.length > 0 && (
        <ul>
          {source.notes.map((note) => (
            <li key={note}>{playerTeamNote(note, core, civ)}</li>
          ))}
        </ul>
      )}
    </details>
  );
}
function PermanentCard({ row, core }: { row: TeamPermanentRow; core: Core }) {
  const civ = civByEn(row.source.civ);
  return (
    <article className="team-card" data-testid={`team-bonus-${row.source.id}`}>
      <header>
        <h3>{civ?.zh} · 团队加成</h3>
        <span className="team-state">常驻来源</span>
      </header>
      <p>
        <Linked text={civ?.tb ?? '文明说明缺失，待核实'} />
      </p>
      <div className="team-effect-types" aria-label="效果类别">
        {row.source.effectTypes?.map((type) => (
          <span key={type}>{TEAM_EFFECT_ZH[type]}</span>
        ))}
      </div>
      <Providers providers={row.providers} />
      <p className="note">本人及盟友均包含在团队范围内。下方目标是跨时代来源关联，不代表当前已解锁；精锐升级等条件仍需满足，详见已核对的条件。</p>
      <Link className="team-entity" to={`/civ/${row.source.civ}/bonus/team`}>
        查看原加成详情
      </Link>
      <Targets source={row.source} core={core} />
    </article>
  );
}
function TechnologyCard({
  row,
  core,
  config,
  update,
}: {
  row: TeamTechnologyRow;
  core: Core;
  config: TeamBonusConfig;
  update: (next: TeamBonusConfig) => void;
}) {
  const source = row.source,
    tech = core.techById[source.id],
    state = teamTechnologyStatus(source, config);
  return (
    <article className="team-card" data-testid={`team-technology-${source.id}`}>
      <header>
        <h3>{tech?.zh ?? `科技 #${source.id}`}</h3>
        <span className={'team-state ' + (state === 'researched' ? 'team-active' : 'team-pending')}>
          {state === 'unavailable' ? '当前时代不可用' : state === 'researched' ? '已记录研究' : '未研究'}
        </span>
      </header>
      <p>
        <Linked text={tech?.desc ?? '科技说明待核实'} />
      </p>
      <div className="team-effect-types" aria-label="效果类别">
        {row.source.effectTypes?.map((type) => (
          <span key={type}>{TEAM_EFFECT_ZH[type]}</span>
        ))}
      </div>
      <Providers providers={row.providers} />
      <dl className="team-requirements">
        <div>
          <dt>研究时代</dt>
          <dd>{AGE_ZH[source.age] ?? '待核实'}</dd>
        </div>
        <div>
          <dt>研究地点</dt>
          <dd>
            {core.buildingById[source.building] ? (
              <Link className="team-entity" to={`/building/${source.building}`}>
                {core.buildingById[source.building]!.zh}
              </Link>
            ) : (
              `建筑 #${source.building}（待核实）`
            )}
          </dd>
        </div>
        <div>
          <dt>基础费用</dt>
          <dd>
            {Object.entries(source.cost).map(([key, amount]) => (
              <span className="team-number" key={key}>
                {RES_ZH[key] ?? key} {amount}{' '}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt>基础研究时间</dt>
          <dd className="team-number">{source.researchTime} 游戏秒</dd>
        </div>
      </dl>
      <details className="team-prerequisites">
        <summary>原始前置门槛</summary>
        <p className="note">需满足原始前置中的 {source.requiredCount} 项；包含时代及自动隐藏条件，不能仅把具名科技当作完整前置。</p>
        <ul>
          {source.prerequisites.map((id) => (
            <li key={id}>
              {core.techById[id] ? (
                <Link className="team-entity" to={`/tech/${id}`}>
                  {core.techById[id]!.zh}
                </Link>
              ) : (
                `条件科技 #${id}（固定数据中的隐藏或时代条件）`
              )}
            </li>
          ))}
        </ul>
      </details>
      <label className="team-research-check">
        <input
          type="checkbox"
          checked={state === 'researched'}
          disabled={state === 'unavailable'}
          onChange={(event) => update(setTeamResearched(config, source.id, event.target.checked))}
        />
        记录已研究：{tech?.zh ?? source.id}
      </label>
      {state === 'unavailable' && (
        <p className="note">
          当前为{AGE_ZH[config.age]}，到达{AGE_ZH[source.age]}后才可记录研究。
        </p>
      )}
      <Link className="team-entity" to={`/tech/${source.id}`}>
        查看科技详情
      </Link>
      <Targets source={source} core={core} />
    </article>
  );
}
