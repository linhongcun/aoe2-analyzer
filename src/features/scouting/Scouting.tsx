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
        <div className="scouting-evidence" data-testid="scouting-local-support">
          <strong>当前局部补证</strong>
          <ul>
            {support.map((id) => (
              <li key={id}>{titleOf(id)}</li>
            ))}
          </ul>
          <p>{hypothesis.evidenceMeaning}</p>
        </div>
      )}
      {counter.length > 0 && (
        <div className="scouting-counter" data-testid="scouting-local-counter">
          <strong>当前需重查线索，请结合下方限定</strong>
          <ul>
            {counter.map((id) => (
              <li key={id}>{titleOf(id)}</li>
            ))}
          </ul>
          <p>{hypothesis.counterMeaning}</p>
        </div>
      )}
      {!support.length && !counter.length && <p className="scouting-note">目前没有带明确时刻、可见范围且未标记陈旧的相关补证；这不代表解释成立或被排除。</p>}
      <dl>
        <div>
          <dt>还缺什么</dt>
          <dd>{hypothesis.need}</dd>
        </div>
        <div>
          <dt>下一次补查</dt>
          <dd>{hypothesis.next}</dd>
        </div>
        <div>
          <dt>采用条件</dt>
          <dd>{hypothesis.condition}</dd>
        </div>
        <div>
          <dt>投入与风险</dt>
          <dd>{hypothesis.cost}</dd>
        </div>
      </dl>
      <details>
        <summary>反例、替代与来源</summary>
        <p>
          <b>失效反例：</b>
          {hypothesis.counterexample}
        </p>
        <p>
          <b>替代方式：</b>
          {hypothesis.alternative}
        </p>
        <ul className="scouting-sources">
          {SCOUTING_CONTENT.sources
            .filter((source) => hypothesis.sourceIds.includes(source.id))
            .map((source) => (
              <li key={source.id}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
                <span className="scouting-note">
                  {source.kind} · {source.publishedAt ? `发布 ${source.publishedAt}` : '发布日期未标注'} · 核对 {SCOUTING_CONTENT.checkedAt}
                </span>
              </li>
            ))}
        </ul>
      </details>
    </article>
  );
}

function ObservationText({ observation }: { observation: ScoutingObservation }) {
  return (
    <span>
      {SCOUTING_STATE_ZH[observation.state]}；游戏时间 {observation.at || '未记录'}；{SCOUTING_AREA_ZH[observation.area]}；
      {observation.stale ? '已标记陈旧' : '未标记陈旧，仍需核实时效'}。
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
    navigate({ pathname: '/scouting', search: '?' + encodeScouting(defaultScoutingConfig()) }, { replace: true });
    setTimeDrafts({});
    setManualLink('');
    setNotice('已重置情境，观察均为未知。');
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
          <p className="scouting-kicker">先分清事实、猜测与还缺的观察</p>
          <h1 id="scouting-title">侦察情报辨析卡</h1>
          <p>同一条线索可以有不同解释。先找能区分它们的补证，不直接替对手决定计划。</p>
        </div>
        <div className="scouting-buttons">
          <button type="button" className="btn" disabled={!canShare} onClick={() => void share()}>
            <Icon name="copy" />
            复制情报链接
          </button>
          <button type="button" className="btn" disabled={analysis?.status !== 'covered'} onClick={() => window.print()}>
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
          <p>原链接已保留。显式重置后才能重新选择，不会用默认解释冒充恢复。</p>
        </div>
      )}
      {draftTimes.length > 0 && (
        <div className="scouting-error" role="alert">
          <p>时间含异常字符或超过长度，解释与分享已暂停。</p>
          <ul>
            {draftTimes.map((id) => (
              <li key={id}>
                {titleOf(id)}：{timeDrafts[id]!.length > SCOUTING_TIME_LIMIT ? `超过 ${SCOUTING_TIME_LIMIT} 个字符` : '含控制、隐藏方向或不完整字符'}
                ；原文保留，尚未进入链接；若在另一组，请切回修正。
              </li>
            ))}
          </ul>
        </div>
      )}
      <section className="scouting-scope" aria-label="本页适用范围">
        <strong>有限首版</strong>
        <p>常规开局 1v1 Arabia；两组资料分别用于封建、城堡阶段。未覆盖海图、游牧、Arena、团战或其他阶段；不读取游戏、不预测胜率。</p>
      </section>
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
            <Select label="地图" value={config.map} options={maps} change={(map) => change({ map })} />
            <Select label="模式" value={config.mode} options={modes} change={(mode) => change({ mode })} />
            <Select label="我的当前阶段" value={config.stage} options={stages} change={(stage) => change({ stage })} />
            <Select label="我正在考虑的计划" value={config.plan} options={plans} change={(plan) => change({ plan })} />
          </fieldset>
          <p className="scouting-note">切换情境保留两组记录与阶段；不会把你自动改到另一时代。时间均为游戏内计时，留空表示未记录。</p>
          <fieldset disabled={decoded.locked} className="scouting-observations">
            <legend>固定观察项</legend>
            {scenario.observationIds.map((id) => {
              const definition = SCOUTING_CONTENT.observations.find((row) => row.id === id)!;
              const observation = config.observations[id];
              return (
                <section className="scouting-observation" data-observation={id} key={id} aria-labelledby={`scouting-observation-${id}`}>
                  <h3 id={`scouting-observation-${id}`}>{definition.title}</h3>
                  <p className="scouting-note">{definition.meaning}</p>
                  <Select
                    label={`${definition.title}：状态`}
                    value={observation.state}
                    options={SCOUTING_STATE_ZH}
                    change={(state) => changeObservation(id, { state })}
                  />
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
                </section>
              );
            })}
          </fieldset>
          <p className="scouting-note">“这次没有看见”不能当作不存在。“确认不存在”必须限定观察时刻和实际可见区域；已探索过的地形不等于当前仍有视野。</p>
        </section>
        {analysis && (
          <section className="scouting-result" data-testid="scouting-result" data-analysis-status={analysis.status} aria-labelledby="scouting-result-title">
            <div className="scouting-panel">
              <h2 id="scouting-result-title">{analysis.title}</h2>
              <p className="scouting-note">
                {scenario.title}；{modes[config.mode]}；{maps[config.map]}；{stages[config.stage]}；{plans[config.plan]}。
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
                  <p className="scouting-note">所有解释都可能与现有信息相容，局部补证或反证均不能认证全局意图；经济与军事投入也可同时发生。</p>
                  <p>{analysis.planNote}</p>
                </>
              )}
            </div>
            {analysis.status === 'covered' && (
              <>
                <section className="scouting-panel" aria-labelledby="scouting-common-title">
                  <h3 id="scouting-common-title">同一线索为何还不能区分</h3>
                  <p>{scenario.sharedClue}</p>
                  <ul>
                    {scenario.notEnough.map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                  <h3>当前仍缺的信息</h3>
                  {analysis.gaps.length ? (
                    <ul data-testid="scouting-gaps">
                      {analysis.gaps.map((gap) => (
                        <li key={gap}>{gap}</li>
                      ))}
                    </ul>
                  ) : (
                    <p data-testid="scouting-gaps">所填观察已具有限定信息，仍不代表所有地图方向或后续变化都已核实。</p>
                  )}
                  <h3>先做的共同补查</h3>
                  <ul>
                    {scenario.checks.map((check) => (
                      <li key={check}>{check}</li>
                    ))}
                  </ul>
                </section>
                <section className="scouting-panel scouting-snapshot" aria-labelledby="scouting-snapshot-title">
                  <h3 id="scouting-snapshot-title">这次辨析使用的观察快照</h3>
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
                </section>
                <div className="scouting-cards">
                  {analysis.hypotheses.map((result) => (
                    <HypothesisCard result={result} key={result.hypothesis.id} />
                  ))}
                </div>
                <section className="scouting-panel" aria-labelledby="scouting-followup-title">
                  <h3 id="scouting-followup-title">已经确认具体威胁后</h3>
                  <p>再按实际威胁查对应条件资料；这些入口不能替这里的未知信息下结论。</p>
                  <div className="scouting-links">
                    <Link to="/matchup">已辨认快攻的应对</Link>
                    <Link to="/castle-defense">已见城堡前置的阶段应对</Link>
                    <Link to="/mixed-army">已见混兵组合的分工</Link>
                  </div>
                </section>
              </>
            )}
          </section>
        )}
      </div>
      <details className="scouting-panel scouting-boundaries">
        <summary>来源、核对日期与资料边界</summary>
        <p>{SCOUTING_CONTENT.editorialNotice}</p>
        <p className="scouting-note">
          游戏资料口径 {SCOUTING_CONTENT.dataVersion}，核对 {SCOUTING_CONTENT.checkedAt}
          。本页没有即时训练、研究或建造指令，也不认证文明、资源、兵力与实际前置已就绪。社区原问答只用于识别困惑，不证明战术正确。
        </p>
        <ul className="scouting-sources">
          {SCOUTING_CONTENT.sources.map((source) => (
            <li key={source.id}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title}
              </a>
              <span className="scouting-note">
                {source.kind} · {source.publishedAt ? `发布 ${source.publishedAt}` : '发布日期未标注'} · 核对 {SCOUTING_CONTENT.checkedAt}
              </span>
              <p>{source.note}</p>
            </li>
          ))}
        </ul>
        <p className="scouting-note">
          链接保存全部固定观察，没有本地存储覆盖。破损链接暂停解释；范围外保留条件且显示未覆盖，超长或含异常字符的时间原文留在输入框但不会进入链接，不截断分享。
        </p>
      </details>
      <button type="button" className="btn scouting-reset" onClick={reset}>
        重置为未知观察
      </button>
    </section>
  );
}
