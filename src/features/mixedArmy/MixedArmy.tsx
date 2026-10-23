import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { civs, coreCache, treesCache, loadCore, loadTrees } from '../../data';
import type { ProductionContext } from '../../domain/production';
import {
  MIXED_ARMY_CONTENT,
  MIXED_CARD_STATUS_ZH,
  defaultMixedArmyConfig,
  decodeMixedArmy,
  encodeMixedArmy,
  mixedArmyGaps,
  mixedFormNeedsConfirmation,
  planMixedArmy,
  type MixedArmyConfig,
  type MixedCardResult,
  type MixedChoice,
} from '../../domain/mixedArmy';
import { AGE_ZH } from '../../domain/ratings';
import { sharePageUrl } from '../../domain/sharePage';
import { CalcDock } from '../../shared/ui/CalcDock';
import { Loading } from '../../shared/ui/widgets';
import './mixedArmy.css';

/** issue 271：每页/每卡第一次出现的站内单位名链到详情（Steve：后面重复不必再链；精锐形态也算「胡斯派战车」） */
const FIRST_UNIT_NAMES = [
  { name: '胡斯派战车', id: 1704, elitePrefix: '精锐', eliteId: 1706 },
  { name: '手推炮', id: 36 },
] as const;

function linkFirstUnits(text: string, seen: Set<string>): ReactNode {
  type Hit = { start: number; end: number; label: string; id: number; key: string };
  const hits: Hit[] = [];
  for (const row of FIRST_UNIT_NAMES) {
    if (seen.has(row.name)) continue;
    const i = text.indexOf(row.name);
    if (i < 0) continue;
    const elite = 'elitePrefix' in row && row.elitePrefix && i >= row.elitePrefix.length && text.slice(i - row.elitePrefix.length, i) === row.elitePrefix;
    if (elite) {
      hits.push({ start: i - row.elitePrefix.length, end: i + row.name.length, label: row.elitePrefix + row.name, id: row.eliteId, key: row.name });
    } else {
      hits.push({ start: i, end: i + row.name.length, label: row.name, id: row.id, key: row.name });
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  // drop overlaps (keep earlier / longer)
  const picked: Hit[] = [];
  for (const h of hits) {
    if (picked.some((p) => !(h.end <= p.start || h.start >= p.end))) continue;
    picked.push(h);
  }
  if (!picked.length) return text;
  const out: ReactNode[] = [];
  let cursor = 0;
  picked.forEach((h, n) => {
    if (h.start > cursor) out.push(text.slice(cursor, h.start));
    out.push(
      <Link key={`${h.key}-${n}`} to={`/unit/${h.id}`}>
        {h.label}
      </Link>,
    );
    seen.add(h.key);
    cursor = h.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

const modeOptions = { unknown: '未知，尚未确认', 'one-v-one-arena': '1v1 Arena', 'one-v-one-other': '1v1 其他地图', team: '团战' };
const enemyOptions = {
  unknown: '未知，先确认实际敌军',
  cavalry: '近战骑兵',
  skirmishers: '掷矛手',
  'cavalry-skirmishers': '近战骑兵与掷矛手',
  wagons: '目前只见胡斯派战车',
  'wagons-cannon': '胡斯派战车与后排手推炮',
  'wagons-cannon-halberdiers': '胡斯派战车、后排手推炮与长戟兵',
  other: '还有其他组合或额外护军',
};
const terrainOptions = { unknown: '未知，尚未确认', open: '开阔，可侧向接近', narrow: '狭窄，通路受限' };
const formationOptions = { unknown: '未知，尚未确认', grouped: '目标紧密成群', spread: '目标已分散' };
const flankOptions = { unknown: '未知，尚未侦察', clear: '已确认有空当，无需穿过护军', blocked: '护军或障碍仍封住通路' };
const positionOptions = { unknown: '未知，尚未确认', safe: '已确认可保护并支援', unsafe: '当前无法保护部署位置' };
const retreatOptions = { unknown: '未知，先查退路与资源', safe: '已确认能撤回并继续补兵采集', unsafe: '退路或替代资源不可用' };
const foodOptions = { unknown: '未知，先查持续能力', sustainable: '可持续补兵', tight: '食物紧张' };
const woodGoldOptions = {
  unknown: '未知，先查持续能力',
  sustainable: '木材与黄金均可持续',
  'wood-tight': '木材紧张',
  'gold-tight': '黄金紧张',
  'both-tight': '木材与黄金均紧张',
};

function MixedGaps({ config }: { config: MixedArmyConfig }) {
  const gaps = mixedArmyGaps(config);
  // 缺项在表单和卡片之前，单位名的第一次出现落在这里，须链到详情。
  const seen = new Set<string>();
  if (!gaps.length) {
    return (
      <section className="mixed-gaps" data-testid="mixed-gaps">
        <p>关键观察都已填写。可跳到结果，查看哪些路线对得上当前条件。</p>
      </section>
    );
  }
  return (
    <details className="mixed-details mixed-gaps" data-testid="mixed-pending">
      <summary>
        尚未确认（<span className="mixed-number">{gaps.length} 项</span>）
      </summary>
      <ul>
        {gaps.map((gap) => (
          <li key={gap}>{linkFirstUnits(gap, seen)}</li>
        ))}
      </ul>
    </details>
  );
}
function ExampleConclusion() {
  const scenario = MIXED_ARMY_CONTENT.scenarios.find((row) => row.id === 'britons-archer-cover')!;
  const card = MIXED_ARMY_CONTENT.cards.find((row) => row.id === 'britons-halb-screen')!;
  return (
    <section className="mixed-notice mixed-example" data-testid="mixed-army-result" aria-labelledby="mixed-example-title">
      <h2 id="mixed-example-title" className="calc-dock-target" tabIndex={-1}>
        示例结论
      </h2>
      <p data-testid="mixed-example">
        若已确认不列颠步弓面对近战骑兵和掷矛手：{scenario.mixedThreatNote}可参考「{card.title}」。把观察改成你的实际局面后，这里会换成对应路线。
      </p>
    </section>
  );
}
const PENDING_REASON = /尚未确认|尚未明确确认|尚未查清|先确认|先辨认|先补|先查明/;
function SelectField<T extends string>({ label, value, options, change }: { label: string; value: T; options: Record<T, string>; change: (value: T) => void }) {
  return (
    <label className="mixed-field">
      {label}
      <select aria-label={label} value={value} onChange={(event) => change(event.target.value as T)}>
        {Object.entries<string>(options).map(([id, title]) => (
          <option key={id} value={id}>
            {title}
          </option>
        ))}
      </select>
    </label>
  );
}
function Card({ result, ctx }: { result: MixedCardResult; ctx: ProductionContext }) {
  const { card, status, reasons } = result;
  const pending = reasons.filter((reason) => PENDING_REASON.test(reason));
  const active = reasons.filter((reason) => !pending.includes(reason));
  const seen = new Set<string>();
  const L = (text: string) => linkFirstUnits(text, seen);
  return (
    <article className="mixed-card" data-card={card.id} data-card-status={status}>
      <header>
        <span className={status === 'conditions-met' ? 'mixed-status mixed-status-met' : 'mixed-status'}>{MIXED_CARD_STATUS_ZH[status]}</span>
        <h3>{L(card.title)}</h3>
      </header>
      <p>{L(card.problem)}</p>
      {!!active.length && (
        <div className="mixed-card-reasons">
          <strong>当前需处理</strong>
          <ul>
            {active.map((reason) => (
              <li key={reason}>{L(reason)}</li>
            ))}
          </ul>
        </div>
      )}
      {!!pending.length && (
        <details className="mixed-details">
          <summary>
            尚未确认（<span className="mixed-number">{pending.length} 项</span>）
          </summary>
          <ul>
            {pending.map((reason) => (
              <li key={reason}>{L(reason)}</li>
            ))}
          </ul>
        </details>
      )}
      <dl className="mixed-roles">
        <div>
          <dt>主力</dt>
          <dd>{L(card.roles.main)}</dd>
        </div>
        <div>
          <dt>掩护</dt>
          <dd>{L(card.roles.cover)}</dd>
        </div>
        <div>
          <dt>攻城</dt>
          <dd>{L(card.roles.siege)}</dd>
        </div>
      </dl>
      <p>
        <b>采用条件：</b>
        {L(card.conditions.join(' '))}
      </p>
      <p>
        <b>代价与风险：</b>
        {L(card.cost)}
      </p>
      <p className="mixed-next">
        <b>下一步观察：</b>
        {L(card.next)}
      </p>
      <details className="mixed-details">
        <summary>反例、备选与依据</summary>
        <p>
          <b>何时失效：</b>
          {L(card.counterexample)}
        </p>
        <p>
          <b>备选路线：</b>
          {L(card.alternative)}
        </p>
        <div className="mixed-links">
          {card.unitIds.map((id) => (
            <Link key={id} to={`/unit/${id}`}>
              {ctx.core.unitById[id]?.zh ?? `单位 ${id}`}资料
            </Link>
          ))}
          {(card.techIds ?? []).map((id) => (
            <Link key={id} to={`/tech/${id}`}>
              {ctx.core.techById[id]?.zh ?? `科技 ${id}`}资料
            </Link>
          ))}
        </div>
      </details>
    </article>
  );
}

export default function MixedArmy() {
  const location = useLocation(),
    navigate = useNavigate();
  const decoded = useMemo(() => decodeMixedArmy(location.search), [location.search]);
  const [ctx, setContext] = useState<ProductionContext | null>(() => (coreCache && treesCache ? { core: coreCache, trees: treesCache } : null));
  const [loadError, setLoadError] = useState(false),
    [shareStatus, setShareStatus] = useState(''),
    [manualLink, setManualLink] = useState('');
  useEffect(() => {
    let active = true;
    void Promise.all([loadCore(), loadTrees()])
      .then(([core, trees]) => {
        if (active) setContext({ core, trees });
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const config = decoded.config;
  const plan = ctx && !decoded.locked ? planMixedArmy(ctx, config) : null;
  const change = (patch: Partial<MixedArmyConfig>) => {
    if (decoded.locked) return;
    navigate({ pathname: '/mixed-army', search: '?' + encodeMixedArmy({ ...config, ...patch }) }, { replace: true });
    setShareStatus('');
    setManualLink('');
  };
  const reset = () => {
    navigate({ pathname: '/mixed-army', search: '?' + encodeMixedArmy(defaultMixedArmyConfig()) }, { replace: true });
    setShareStatus('情境已重置，关键观察与完成确认均保留为未知或未确认。');
    setManualLink('');
  };
  const share = async () => {
    if (decoded.locked || decoded.errors.length || plan?.status === 'invalid') return;
    const url = sharePageUrl('/mixed-army', '?' + encodeMixedArmy(config), document.baseURI);
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus('情境链接已复制，包含全部观察和各项完成确认。');
      setManualLink('');
    } catch {
      setShareStatus('自动复制失败，请手动复制下方完整链接。');
      setManualLink(url);
    }
  };
  const toggle = (field: 'completedForms' | 'completedUnlockTechIds' | 'completedBuildings', id: number) =>
    change({ [field]: config[field].includes(id) ? config[field].filter((old) => old !== id) : [...config[field], id] });
  const choice = (raw: string): MixedChoice => (raw === 'unknown' || raw === 'other' ? raw : Number(raw));
  const scenario = MIXED_ARMY_CONTENT.scenarios.find((row) => row.id === config.scenario)!;
  const mainChoices = [...new Set([...scenario.ownMainUnitIds, ...(typeof config.ownMain === 'number' ? [config.ownMain] : [])])];
  const formChoices = [...new Set([...(config.scenario === 'britons-archer-cover' ? [492, 530, 359, 546, 550] : [557, 441]), ...config.completedForms])];
  const techChoices = [...new Set([47, 10, ...config.completedUnlockTechIds])];
  const buildingChoices = [...new Set([12, 87, 82, 101, 49, ...config.completedBuildings])];
  const conditionsMet = plan?.cards.filter((row) => row.status === 'conditions-met') ?? [];
  const otherCards = plan?.cards.filter((row) => row.status !== 'conditions-met') ?? [];
  const observationUnknown = [config.terrain, config.formation, config.flank, config.position, config.retreat, config.food, config.woodGold].filter(
    (value) => value === 'unknown',
  ).length;
  const showExample = !!plan && plan.status === 'needs-observation' && config.ownMain === 'unknown' && config.enemy === 'unknown';
  return (
    <section className="pane mixed-army-page" data-testid="mixed-army-page">
      <header className="mixed-heading">
        <div>
          <h1>混兵情境卡</h1>
          <p>看到掩护后，先分清谁防骑、谁清掷矛手、谁处理后排攻城。</p>
        </div>
      </header>
      <CalcDock
        note={shareStatus}
        resultId={showExample ? 'mixed-example-title' : plan ? 'mixed-result-heading' : undefined}
        actions={[
          {
            label: '复制情境链接',
            icon: 'copy',
            disabled: !ctx || decoded.locked || decoded.errors.length > 0 || plan?.status === 'invalid',
            onClick: () => void share(),
          },
          { label: '重置为默认情境', onClick: reset },
        ]}
      />
      {manualLink && (
        <label className="mixed-field mixed-manual">
          手动复制情境链接
          <textarea aria-label="手动复制情境链接" readOnly rows={4} value={manualLink} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
      {decoded.errors.length > 0 && (
        <div role="alert" className="mixed-error">
          <p>{decoded.errors.join(' ')}</p>
          <p>{decoded.locked ? '原链接已保留，默认值不代表恢复结果。显式重置后才能编辑。' : '原字段已保留，请修正输入后继续；不会用默认值覆盖。'}</p>
        </div>
      )}
      {loadError ? (
        <div role="alert" className="mixed-error">
          <p>固定资料加载失败，暂时无法核对前置。</p>
          <button className="btn" type="button" onClick={() => window.location.reload()}>
            重新加载资料
          </button>
        </div>
      ) : !ctx ? (
        <Loading />
      ) : (
        <>
          {!decoded.locked && showExample && <ExampleConclusion />}
          {!decoded.locked && <MixedGaps config={config} />}
          <fieldset disabled={decoded.locked} className="mixed-panel mixed-settings">
            <legend>我实际观察到什么</legend>
            <div className="mixed-grid">
              <label className="mixed-field">
                情境
                <select aria-label="情境" value={config.scenario} onChange={(event) => change({ scenario: event.target.value as MixedArmyConfig['scenario'] })}>
                  {MIXED_ARMY_CONTENT.scenarios.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mixed-field">
                我的文明
                <select aria-label="我的文明" value={config.civ} onChange={(event) => change({ civ: event.target.value })}>
                  {!civs.some((civ) => civ.en === config.civ) && <option value={config.civ}>无效文明：{config.civ}</option>}
                  {civs.map((civ) => (
                    <option key={civ.en} value={civ.en}>
                      {civ.zh}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mixed-field">
                我的当前时代
                <select aria-label="我的当前时代" value={config.age} onChange={(event) => change({ age: Number(event.target.value) })}>
                  {![1, 2, 3, 4].includes(config.age) && <option value={config.age}>无效时代：{config.age}</option>}
                  {[1, 2, 3, 4].map((age) => (
                    <option key={age} value={age}>
                      {AGE_ZH[age]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mixed-field">
                现有主力准确形态
                <select aria-label="现有主力准确形态" value={config.ownMain} onChange={(event) => change({ ownMain: choice(event.target.value) })}>
                  <option value="unknown">未知，尚未确认</option>
                  <option value="other">其他主力，暂未收录</option>
                  {mainChoices.map((id) => (
                    <option key={id} value={id}>
                      {ctx.core.unitById[id]?.zh ?? `未知单位 ${id}`}
                    </option>
                  ))}
                </select>
              </label>
              <SelectField label="实际敌军组合" value={config.enemy} options={enemyOptions} change={(enemy) => change({ enemy })} />
              <SelectField label="地图与模式" value={config.mode} options={modeOptions} change={(mode) => change({ mode })} />
              {config.scenario === 'arena-wagon-cannon' && (
                <>
                  <div className="mixed-links mixed-field-units">
                    <Link to="/unit/1704">胡斯派战车资料</Link>
                    <Link to="/unit/36">手推炮资料</Link>
                    <Link to="/unit/1709">榴弹炮资料</Link>
                  </div>
                  <label className="mixed-field">
                    已见胡斯派战车（普通或精锐）
                    <select aria-label="已见胡斯派战车（普通或精锐）" value={config.wagon} onChange={(event) => change({ wagon: choice(event.target.value) })}>
                      <option value="unknown">未知，尚未辨认</option>
                      <option value="other">其他，暂未覆盖</option>
                      {[1704, 1706, ...(typeof config.wagon === 'number' && ![1704, 1706].includes(config.wagon) ? [config.wagon] : [])].map((id) => (
                        <option key={id} value={id}>
                          {ctx.core.unitById[id]?.zh ?? `未知单位 ${id}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mixed-field">
                    已见后排炮（手推炮或榴弹炮）
                    <select
                      aria-label="已见后排炮（手推炮或榴弹炮）"
                      value={config.cannon}
                      onChange={(event) => change({ cannon: choice(event.target.value) })}
                    >
                      <option value="unknown">未知，尚未辨认</option>
                      <option value="other">其他，暂未覆盖</option>
                      {[36, 1709, ...(typeof config.cannon === 'number' && ![36, 1709].includes(config.cannon) ? [config.cannon] : [])].map((id) => (
                        <option key={id} value={id}>
                          {ctx.core.unitById[id]?.zh ?? `未知单位 ${id}`}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            <details className="mixed-details mixed-observation-details">
              <summary>
                地形、通路与持续资源
                {observationUnknown > 0 ? (
                  <>
                    （还有 <span className="mixed-number">{observationUnknown} 项</span>未知）
                  </>
                ) : (
                  '（已填写）'
                )}
              </summary>
              <div className="mixed-grid">
                <SelectField label="交战地形" value={config.terrain} options={terrainOptions} change={(terrain) => change({ terrain })} />
                <SelectField label="敌方步行目标阵型" value={config.formation} options={formationOptions} change={(formation) => change({ formation })} />
                <SelectField label="侧向到场与后排空当" value={config.flank} options={flankOptions} change={(flank) => change({ flank })} />
                <SelectField label="己方保护射击位置" value={config.position} options={positionOptions} change={(position) => change({ position })} />
                <SelectField label="撤回与替代资源" value={config.retreat} options={retreatOptions} change={(retreat) => change({ retreat })} />
                <SelectField label="食物持续能力" value={config.food} options={foodOptions} change={(food) => change({ food })} />
                <SelectField label="木材与黄金持续能力" value={config.woodGold} options={woodGoldOptions} change={(woodGold) => change({ woodGold })} />
              </div>
            </details>
            <details className="mixed-details" data-testid="mixed-confirmations">
              <summary>记录已完成的形态、研究与生产建筑</summary>
              <p className="mixed-note">
                逐项确认实际状态。选择单位不会自动确认升级；免费获得也由你确认。形态确认表示所需升级实际已完成，本页不自动核验完整研究链。未勾选表示尚未确认。
              </p>
              <div className="mixed-confirmation-grid">
                <fieldset>
                  <legend>形态升级实际完成</legend>
                  {formChoices.map((id) => (
                    <label className="mixed-check" key={id}>
                      <input type="checkbox" checked={config.completedForms.includes(id)} onChange={() => toggle('completedForms', id)} />
                      <span>
                        {ctx.core.unitById[id]?.zh ?? `未知单位 ${id}`}
                        {!mixedFormNeedsConfirmation(ctx, id) && '（此形态确认暂未支持）'}
                      </span>
                    </label>
                  ))}
                </fieldset>
                <fieldset>
                  <legend>必要研究实际完成</legend>
                  {techChoices.map((id) => (
                    <label className="mixed-check" key={id}>
                      <input type="checkbox" checked={config.completedUnlockTechIds.includes(id)} onChange={() => toggle('completedUnlockTechIds', id)} />
                      <span>{ctx.core.techById[id]?.zh ?? `未知科技 ${id}`}</span>
                    </label>
                  ))}
                </fieldset>
                <fieldset>
                  <legend>当前可用的已建生产建筑</legend>
                  {buildingChoices.map((id) => (
                    <label className="mixed-check" key={id}>
                      <input type="checkbox" checked={config.completedBuildings.includes(id)} onChange={() => toggle('completedBuildings', id)} />
                      <span>{ctx.core.buildingById[id]?.zh ?? `未知建筑 ${id}`}</span>
                    </label>
                  ))}
                </fieldset>
              </div>
              <p className="mixed-note">
                完成研究与建筑现存分开记录；生产地点按固定科技树与生产模型核对，多个合法地点任选其一。更换情境、文明或时代会保留记录，请修正不相符的确认。
              </p>
            </details>
          </fieldset>
          {plan && !showExample && (
            <section className="mixed-results" data-testid="mixed-army-result" aria-labelledby="mixed-result-heading">
              <header className="mixed-result-heading">
                <h2 id="mixed-result-heading" className="calc-dock-target" tabIndex={-1}>
                  {plan.status === 'not-covered' ? '暂未覆盖这组输入' : plan.status === 'invalid' ? '先修正确认记录' : '按当前观察分配任务'}
                </h2>
                <p>{linkFirstUnits(plan.summary, new Set())}</p>
              </header>
              {plan.status === 'invalid' && (
                <div className="mixed-error" role="alert">
                  {plan.notices.map((notice) => (
                    <p key={notice}>{linkFirstUnits(notice, new Set())}</p>
                  ))}
                </div>
              )}
              {plan.status === 'not-covered' && (
                <div className="mixed-notice">
                  {plan.notices.map((notice) => (
                    <p key={notice}>{linkFirstUnits(notice, new Set())}</p>
                  ))}
                </div>
              )}
              {plan.cards.length > 0 && (
                <>
                  <section aria-labelledby="mixed-met-heading" data-testid="mixed-conditions-met">
                    <h3 id="mixed-met-heading">所列前置与观察条件满足</h3>
                    {conditionsMet.length ? (
                      <div className="mixed-cards">
                        {conditionsMet.map((result) => (
                          <Card key={result.card.id} result={result} ctx={ctx} />
                        ))}
                      </div>
                    ) : (
                      <p className="mixed-empty">目前没有可按所填条件采用的路线。先补查或准备，不把未知当作安全。</p>
                    )}
                  </section>
                  {otherCards.length > 0 && (
                    <section aria-labelledby="mixed-other-heading">
                      <h3 id="mixed-other-heading">还需观察、准备或等待条件变化</h3>
                      <div className="mixed-cards">
                        {otherCards.map((result) => (
                          <Card key={result.card.id} result={result} ctx={ctx} />
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
      <details className="mixed-details mixed-panel mixed-boundaries" data-testid="scope-sources">
        <summary>适用范围与来源</summary>
        <p>{MIXED_ARMY_CONTENT.editorialNotice}</p>
        <p className="mixed-note">资料固定为 DE185872；战术文字经来源交叉核对，尚未完成该版本客户端交战实测。主力/掩护职责不能由单位PK或同兵种群战结果证明。</p>
        <p className="mixed-note">
          链接含全部输入及各项完成确认；没有本地存储覆盖链接。结构损坏会暂停，已知但不适用的选择保留供修正，超过链接长度上限时不截断分享。
        </p>
        <ul className="mixed-source-list">
          {MIXED_ARMY_CONTENT.sources.map((source) => (
            <li key={source.id}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title}
              </a>
              <span>
                {source.kind} · 发布 <time dateTime={source.publishedAt}>{source.publishedAt}</time> · 核对{' '}
                <time dateTime={source.checkedAt}>{source.checkedAt}</time>
              </span>
              <p>{source.note}</p>
            </li>
          ))}
        </ul>
        <div className="mixed-links">
          <Link to="/duel">单位PK：局部单兵资料</Link>
          <Link to="/production">生产规划：局部费用资料</Link>
          <Link to={`/tree/${config.civ}`}>查看文明科技树</Link>
        </div>
        <p className="mixed-note">前置核对仅复用固定目录、科技树、形态索引与生产潜在资格。不自动研究、不自动建造，不认证资源、人口、兵力或实际支援。</p>
      </details>
    </section>
  );
}
