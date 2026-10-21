import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  SCOUTING_AREA_ZH,
  SCOUTING_CONTENT,
  SCOUTING_RESULT_ZH,
  SCOUTING_STATE_ZH,
  SCOUTING_TIME_LIMIT,
  analyseScouting,
  decodeScouting,
  defaultScoutingConfig,
  encodeScouting,
  exampleScoutingConfig,
  isScoutingTimeText,
  type ScoutingConfig,
  type ScoutingHypothesisResult,
  type ScoutingObservation,
  type ScoutingObservationId,
} from '../../domain/scouting';
import { sharePageUrl } from '../../domain/sharePage';
import { Icon } from '../../shared/ui/Icon';
import './scouting.css';

const maps: Record<ScoutingConfig['map'], string> = {
  arabia: 'Arabia，阿拉伯',
  arena: 'Arena，竞技场',
  nomad: '游牧',
  water: '海图',
  other: '其他地图',
  unknown: '地图未知',
};
const modes: Record<ScoutingConfig['mode'], string> = { 'one-v-one': '1v1', team: '团战', other: '其他模式', unknown: '模式未知' };
const stages: Record<ScoutingConfig['stage'], string> = { dark: '黑暗时代', feudal: '封建时代', castle: '城堡时代', imperial: '帝王时代', unknown: '阶段未知' };
const plans: Record<ScoutingConfig['plan'], string> = { undecided: '尚未决定', press: '考虑施压', hold: '考虑防守', develop: '考虑发展' };
const titleOf = (id: ScoutingObservationId) => SCOUTING_CONTENT.observations.find((row) => row.id === id)!.title;

function Select<T extends string>({ label, value, options, change }: { label: string; value: T; options: Record<T, string>; change: (value: T) => void }) {
  return (
    <label className="scouting-field">
      {label}
      <select aria-label={label} value={value} onChange={(event) => change(event.target.value as T)}>
        {Object.entries<string>(options).map(([id, title]) => (
          <option value={id} key={id}>
            {title}
          </option>
        ))}
      </select>
    </label>
  );
}

function HypothesisCard({ result }: { result: ScoutingHypothesisResult }) {
  const { hypothesis, status, support, counter } = result;
  return (
    <article className="scouting-card" data-hypothesis={hypothesis.id} data-evidence-status={status}>
      <span className="scouting-badge">{SCOUTING_RESULT_ZH[status]}</span>
      <h3>{hypothesis.title}</h3>
      <p>{hypothesis.body}</p>
      {support.length > 0 && (
        <p className="scouting-evidence" data-testid="scouting-local-support">
          <strong>已见：{support.map(titleOf).join('、')}。</strong>
          {hypothesis.evidenceMeaning}
        </p>
      )}
      {counter.length > 0 && (
        <p className="scouting-counter" data-testid="scouting-local-counter">
          <strong>重查：{counter.map(titleOf).join('、')}。</strong>
          {hypothesis.counterMeaning}
        </p>
      )}
      <p>
        <strong>下一步：</strong>
        {hypothesis.next}
      </p>
    </article>
  );
}

function ObservationText({ observation }: { observation: ScoutingObservation }) {
  return (
    <span>
      {SCOUTING_STATE_ZH[observation.state]}；游戏时间 <span className="num">{observation.at || '未记录'}</span>；{SCOUTING_AREA_ZH[observation.area]}；
      {observation.stale ? '已标记陈旧' : '当前记录'}。
    </span>
  );
}

export default function Scouting() {
  const location = useLocation(),
    navigate = useNavigate();
  const decoded = useMemo(() => decodeScouting(location.search), [location.search]);
  const [notice, setNotice] = useState('');
  const [manualLink, setManualLink] = useState('');
  const [timeDrafts, setTimeDrafts] = useState<Partial<Record<ScoutingObservationId, string>>>({});
  const config = decoded.config;
  const isExample = encodeScouting(config) === encodeScouting(exampleScoutingConfig());
  const scenario = SCOUTING_CONTENT.scenarios.find((row) => row.id === config.scenario)!;
  const draftTimes = Object.keys(timeDrafts) as ScoutingObservationId[];
  const analysis = !decoded.locked && draftTimes.length === 0 ? analyseScouting(config) : null;
  const canShare = !decoded.locked && !draftTimes.length && analysis?.status !== 'invalid';
  const change = (patch: Partial<ScoutingConfig>) => {
    if (decoded.locked) return;
    navigate({ pathname: '/scouting', search: '?' + encodeScouting({ ...config, ...patch }) }, { replace: true });
    setNotice('');
    setManualLink('');
  };
  const changeObservation = (id: ScoutingObservationId, patch: Partial<ScoutingObservation>) =>
    change({ observations: { ...config.observations, [id]: { ...config.observations[id], ...patch } } });
  const changeTime = (id: ScoutingObservationId, value: string) => {
    if (!isScoutingTimeText(value)) {
      setTimeDrafts((old) => ({ ...old, [id]: value }));
      setNotice('时间原文留在输入框，尚未进入链接；请修正长度或异常字符后再分享。');
      setManualLink('');
      return;
    }
    setTimeDrafts((old) => {
      const next = { ...old };
      delete next[id];
      return next;
    });
    changeObservation(id, { at: value });
  };
  const reset = () => {
    const empty = decoded.locked ? defaultScoutingConfig() : { ...config, observations: defaultScoutingConfig().observations };
    navigate({ pathname: '/scouting', search: '?' + encodeScouting(empty) }, { replace: true });
    setTimeDrafts({});
    setManualLink('');
    setNotice('观察已清空，可以填写自己的观察。');
  };
  const print = () => {
    const folded = Array.from(document.querySelectorAll<HTMLDetailsElement>('.scouting-result details:not([open]), .scouting-boundaries:not([open])'));
    folded.forEach((details) => {
      details.open = true;
    });
    window.addEventListener(
      'afterprint',
      () =>
        folded.forEach((details) => {
          details.open = false;
        }),
      { once: true },
    );
    window.print();
  };
  const share = async () => {
    if (!canShare) return;
    const url = sharePageUrl('/scouting', '?' + encodeScouting(config), document.baseURI);
    try {
      await navigator.clipboard.writeText(url);
      setNotice('情报链接已复制，包含两组全部观察与各自时刻、范围和陈旧标记。');
      setManualLink('');
    } catch {
      setNotice('自动复制失败，请手动复制下方完整情报链接。');
      setManualLink(url);
    }
  };
  return (
    <section className="pane scouting-page" data-testid="scouting-page" aria-labelledby="scouting-title">
      <header className="scouting-heading">
        <div>
          <p className="scouting-kicker">从信号找到下一步</p>
          <h1 id="scouting-title">侦察情报辨析卡</h1>
          <p>对照具体信号，记录观察，安排下一步行动。</p>
        </div>
        <div className="scouting-buttons">
          <button type="button" className="btn" disabled={!canShare} onClick={() => void share()}>
            <Icon name="copy" />
            复制情报链接
          </button>
          <button type="button" className="btn" disabled={analysis?.status !== 'covered'} onClick={print}>
            <Icon name="printer" />
            打印当前辨析
          </button>
        </div>
      </header>
      {notice && (
        <p role="status" className="scouting-feedback">
          {notice}
        </p>
      )}
      {manualLink && (
        <label className="scouting-field scouting-manual">
          手动复制情报链接
          <textarea aria-label="手动复制情报链接" readOnly value={manualLink} rows={4} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
      {decoded.locked && (
        <div className="scouting-error" role="alert">
          <p>{decoded.errors.join(' ')}</p>
          <p>原链接已保留，清空后可以重新填写。</p>
        </div>
      )}
      {draftTimes.length > 0 && (
        <div className="scouting-error" role="alert">
          <p>时间含异常字符或超过长度，解释与分享已暂停。</p>
          <ul>
            {draftTimes.map((id) => (
              <li key={id}>
                {titleOf(id)}：
                {timeDrafts[id]!.length > SCOUTING_TIME_LIMIT ? (
                  <>
                    超过 <span className="num">{SCOUTING_TIME_LIMIT}个字符</span>
                  </>
                ) : (
                  '含控制、隐藏方向或不完整字符'
                )}
                ；原文保留，尚未进入链接；若在另一组，请切回修正。
              </li>
            ))}
          </ul>
        </div>
      )}
      {isExample && !decoded.locked && (
        <div className="scouting-example" data-testid="scouting-example">
          <p>
            <strong>示例观察：</strong>已见军事生产建筑与实际军队，进军方向待查。
          </p>
          {analysis?.status === 'covered' && (
            <p>
              <strong>示例判断：</strong>
              {analysis.summary}
            </p>
          )}
          <button type="button" className="btn scouting-reset" onClick={reset}>
            清空，填写我的观察
          </button>
        </div>
      )}
      <div className="scouting-layout">
        <section className="scouting-panel scouting-settings" aria-labelledby="scouting-settings-title">
          <h2 id="scouting-settings-title">选择情境与观察</h2>
          <fieldset disabled={decoded.locked}>
            <legend>条件与当前计划</legend>
            <Select
              label="情境"
              value={config.scenario}
              options={Object.fromEntries(SCOUTING_CONTENT.scenarios.map((row) => [row.id, row.title])) as Record<ScoutingConfig['scenario'], string>}
              change={(scenario) => change({ scenario })}
            />
            <details className="scouting-context">
              <summary>
                地图与模式（<span className="num">{modes[config.mode]}</span> · {maps[config.map]}）
              </summary>
              <div className="scouting-optional-fields">
                <Select label="地图" value={config.map} options={maps} change={(map) => change({ map })} />
                <Select label="模式" value={config.mode} options={modes} change={(mode) => change({ mode })} />
              </div>
            </details>
            <Select label="我的当前阶段" value={config.stage} options={stages} change={(stage) => change({ stage })} />
            <Select label="我正在考虑的计划" value={config.plan} options={plans} change={(plan) => change({ plan })} />
          </fieldset>

          <fieldset disabled={decoded.locked} className="scouting-observations">
            <legend>我的观察</legend>
            {scenario.observationIds.map((id) => {
              const definition = SCOUTING_CONTENT.observations.find((row) => row.id === id)!;
              const observation = config.observations[id];
              return (
                <section className="scouting-observation" data-observation={id} key={id} aria-labelledby={`scouting-observation-${id}`}>
                  <h3 id={`scouting-observation-${id}`}>{definition.title}</h3>
                  <Select
                    label={`${definition.title}：状态`}
                    value={observation.state === 'absent' ? 'unseen' : observation.state}
                    options={{ seen: SCOUTING_STATE_ZH.seen, unseen: SCOUTING_STATE_ZH.unseen, unknown: SCOUTING_STATE_ZH.unknown }}
                    change={(state) => changeObservation(id, { state })}
                  />
                  <details className="scouting-observation-details">
                    <summary>补充时间、范围与时效（可选）</summary>
                    <div className="scouting-optional-fields">
                      <label className="scouting-field">
                        {definition.title}：游戏时间
                        <input
                          aria-label={`${definition.title}：游戏时间`}
                          type="text"
                          inputMode="text"
                          placeholder="如 12:30，未知可留空"
                          value={timeDrafts[id] ?? observation.at}
                          onChange={(event) => changeTime(id, event.target.value)}
                        />
                      </label>
                      <Select
                        label={`${definition.title}：可见范围`}
                        value={observation.area}
                        options={SCOUTING_AREA_ZH}
                        change={(area) => changeObservation(id, { area })}
                      />
                      <label className="scouting-check">
                        <input type="checkbox" checked={observation.stale} onChange={(event) => changeObservation(id, { stale: event.target.checked })} />
                        <span>{definition.title}：这条信息已陈旧</span>
                      </label>
                      {(observation.state === 'unseen' || observation.state === 'absent') && (
                        <label className="scouting-check">
                          <input
                            type="checkbox"
                            checked={observation.state === 'absent'}
                            onChange={(event) => changeObservation(id, { state: event.target.checked ? 'absent' : 'unseen' })}
                          />
                          <span>{definition.title}：确认此时此区不存在</span>
                        </label>
                      )}
                    </div>
                  </details>
                </section>
              );
            })}
          </fieldset>
          {!isExample && (
            <button type="button" className="btn scouting-reset" onClick={reset}>
              清空，填写我的观察
            </button>
          )}
        </section>
        {analysis && (
          <section className="scouting-result" data-testid="scouting-result" data-analysis-status={analysis.status} aria-labelledby="scouting-result-title">
            <div className="scouting-panel">
              <h2 id="scouting-result-title">{analysis.title}</h2>
              <p className="scouting-note">
                {scenario.title}；<span className="num">{modes[config.mode]}</span>；{maps[config.map]}；{stages[config.stage]}。
              </p>
              <p>{analysis.summary}</p>
              {analysis.status === 'invalid' && (
                <div className="scouting-error" role="alert">
                  <ul>
                    {analysis.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                  <p>包括另一组的无效记录也会暂停；切回对应情境修正，原输入不会被删除。</p>
                </div>
              )}
              {analysis.status === 'covered' && (
                <>
                  {config.plan !== 'undecided' && <p>{analysis.planNote}</p>}
                  {analysis.gaps.length > 0 && (
                    <p className="scouting-note" data-testid="scouting-gaps">
                      待查：{analysis.gaps.join(' ')}
                    </p>
                  )}
                </>
              )}
            </div>
            {analysis.status === 'covered' && (
              <>
                <section className="scouting-panel" aria-labelledby="scouting-signals-title">
                  <h3 id="scouting-signals-title">具体信号速查</h3>
                  <ul className="scouting-signals" data-testid="scouting-signals">
                    {scenario.signals.map((signal) => (
                      <li key={signal.id} data-signal={signal.id}>
                        <dl>
                          <div>
                            <dt>看到什么</dt>
                            <dd>{signal.seen}</dd>
                          </div>
                          <div>
                            <dt>可能意味着什么</dt>
                            <dd>{signal.meaning}</dd>
                          </div>
                          <div>
                            <dt>下一步做什么</dt>
                            <dd>{signal.next}</dd>
                          </div>
                        </dl>
                        <div className="scouting-signal-sources">
                          {signal.editorial && <span className="scouting-note">本站整理</span>}
                          {signal.sourceIds.map((id) => {
                            const source = SCOUTING_CONTENT.sources.find((item) => item.id === id)!;
                            return (
                              <a key={id} href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`来源：${source.title}（${signal.seen}）`}>
                                {source.title}
                              </a>
                            );
                          })}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
                <details className="scouting-panel scouting-hypotheses">
                  <summary>解释与观察依据（可选）</summary>
                  <div className="scouting-cards">
                    {analysis.hypotheses.map((result) => (
                      <HypothesisCard result={result} key={result.hypothesis.id} />
                    ))}
                  </div>
                </details>
                <section className="scouting-panel" aria-labelledby="scouting-followup-title">
                  <h3 id="scouting-followup-title">已经确认具体威胁后</h3>

                  <div className="scouting-links">
                    <Link to="/matchup">已辨认快攻的应对</Link>
                    <Link to="/castle-defense">已见城堡前置的阶段应对</Link>
                    <Link to="/mixed-army">已见混兵组合的分工</Link>
                  </div>
                </section>
                <details className="scouting-panel scouting-snapshot">
                  <summary>这次辨析使用的观察快照</summary>
                  <dl>
                    {scenario.observationIds.map((id) => (
                      <div key={id}>
                        <dt>{titleOf(id)}</dt>
                        <dd>
                          <ObservationText observation={config.observations[id]} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </>
            )}
          </section>
        )}
      </div>
      <details className="scouting-panel scouting-boundaries">
        <summary>适用范围</summary>
        <p>{SCOUTING_CONTENT.editorialNotice}</p>
        <p className="scouting-note">
          游戏资料口径 <span className="num">{SCOUTING_CONTENT.dataVersion}</span>，核对 <span className="num">{SCOUTING_CONTENT.checkedAt}</span>
          。信号的判断来自所列教学或本站整理，行动建议按这些观察原则组织。
        </p>
        <ul className="scouting-sources">
          {SCOUTING_CONTENT.sources.map((source) => (
            <li key={source.id}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title}
              </a>
              <span className="scouting-note">
                {source.kind} ·{' '}
                {source.publishedAt ? (
                  <>
                    发布 <span className="num">{source.publishedAt}</span>
                  </>
                ) : (
                  '发布日期未标注'
                )}
              </span>
              <p>{source.note}</p>
            </li>
          ))}
        </ul>
        <p className="scouting-note">
          链接保存全部固定观察，没有本地存储覆盖。破损链接暂停解释；范围外保留条件且显示未覆盖，超长或含异常字符的时间原文留在输入框但不会进入链接，不截断分享。
        </p>
      </details>
    </section>
  );
}
