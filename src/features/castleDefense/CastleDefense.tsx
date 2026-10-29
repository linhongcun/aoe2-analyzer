import { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../shared/ui/Icon';
import { sharePageUrl } from '../../domain/sharePage';
import {
  CASTLE_AGE_ZH,
  CASTLE_DEFENSE_REVIEWED_AT,
  CASTLE_DEFENSE_SOURCES,
  CASTLE_ESCORTS,
  CASTLE_ESCORT_ZH,
  CASTLE_OBSERVATIONS,
  CASTLE_OBSERVATION_ZH,
  CASTLE_PATHS,
  CASTLE_PATH_ZH,
  CASTLE_RESOURCES,
  CASTLE_RESOURCE_ZH,
  decodeCastleDefense,
  defaultCastleDefense,
  encodeCastleDefense,
  planCastleDefense,
  type CastleDefenseAction,
  type CastleDefenseConfig,
  type CastleStage,
} from '../../domain/castleDefense';
import { useShareLink } from '../../shared/ui/useShareLink';
import './castleDefense.css';

const stages: { id: CastleStage; label: string }[] = [
  { id: 'stone', label: '疑似准备' },
  { id: 'construction', label: '前压或施工' },
  { id: 'relocate', label: '已成，资源可迁' },
  { id: 'blocked', label: '已成，资源封锁' },
];
function ActionCard({ item }: { item: CastleDefenseAction }) {
  return (
    <article className="castle-defense-action" data-action={item.id}>
      <h3>{item.title}</h3>
      <p>{item.body}</p>
      <p className="castle-defense-cost">
        <b>代价与风险：</b>
        {item.cost}
      </p>
      <p className="castle-defense-next">
        <b>下次复查：</b>
        {item.next}
      </p>
      <details>
        <summary>失效条件与依据</summary>
        <dl>
          <div>
            <dt>不适用的反例</dt>
            <dd>{item.counterexample}</dd>
          </div>
        </dl>
        <div className="castle-defense-source-links">
          {CASTLE_DEFENSE_SOURCES.filter((source) => item.sources.includes(source.id)).map((source) => (
            <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer">
              {source.title}
            </a>
          ))}
        </div>
      </details>
    </article>
  );
}
export default function CastleDefense() {
  const location = useLocation(),
    navigate = useNavigate();
  const decoded = useMemo(() => decodeCastleDefense(location.search), [location.search]);
  const {
    copy,
    status,
    manualLink,
    reset: resetShare,
    statusProps,
  } = useShareLink({
    stateKey: location.search,
    successMessage: '链接已复制，包含观察、时代、护军、通路和资源状态。',
    failureMessage: '自动复制失败，请手动复制下方完整链接。',
  });
  const config = decoded.config,
    locked = decoded.errors.length > 0;
  const plan = locked ? null : planCastleDefense(config);
  const change = (patch: Partial<CastleDefenseConfig>) => {
    if (locked) return;
    navigate({ pathname: '/castle-defense', search: '?' + encodeCastleDefense({ ...config, ...patch }) }, { replace: true });
    resetShare();
  };
  const reset = () => {
    navigate({ pathname: '/castle-defense', search: '?' + encodeCastleDefense(defaultCastleDefense()) }, { replace: true });
    resetShare();
  };
  const share = async () => {
    if (locked) return;
    await copy(() => sharePageUrl('/castle-defense', '?' + encodeCastleDefense(config), document.baseURI));
  };
  return (
    <section className="pane castle-defense-page" data-testid="castle-defense-page">
      <header className="castle-defense-heading">
        <div>
          <h1>城堡前置应对</h1>
          <p>城堡落在门口以后，先看还能保住什么，再选下一步。</p>
          <p className="castle-defense-note">
            限 <span className="castle-defense-nowrap">1v1 Arena</span>。按你已经看见的信息整理选择，不自动判断实际战局。
          </p>
        </div>
        <div className="castle-defense-buttons">
          <button type="button" className="btn" disabled={locked} onClick={() => void share()}>
            <Icon name="copy" />
            复制观察链接
          </button>
          <button type="button" className="btn" disabled={locked} onClick={() => window.print()}>
            打印当前清单
          </button>
        </div>
      </header>
      <p className="castle-defense-example">例如：堡已经造好，但还没查过后方金矿？先把资源保留为“未知”，查清退路后再决定迁移或解围。</p>
      {status && <p {...statusProps}>{status}</p>}
      {manualLink && (
        <label className="castle-defense-manual">
          观察链接
          <textarea aria-label="观察链接" readOnly rows={3} value={manualLink} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
      {locked && (
        <div className="castle-defense-error" role="alert">
          <p>{decoded.errors.join(' ')}</p>
          <p>当前行动已暂停，不把损坏参数当作已确认的信息。</p>
          <button type="button" className="btn" onClick={reset}>
            重置为默认观察
          </button>
        </div>
      )}
      <div className="castle-defense-grid">
        <aside className="castle-defense-panel castle-defense-settings">
          <h2>我观察到什么</h2>
          <fieldset disabled={locked}>
            <legend>当前观察设置</legend>
            <label>
              观察状态
              <select
                aria-label="观察状态"
                value={config.observation}
                onChange={(event) => change({ observation: event.currentTarget.value as CastleDefenseConfig['observation'] })}
              >
                {CASTLE_OBSERVATIONS.map((value) => (
                  <option key={value} value={value}>
                    {CASTLE_OBSERVATION_ZH[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              我的当前时代
              <select aria-label="我的当前时代" value={config.age} onChange={(event) => change({ age: Number(event.currentTarget.value) })}>
                {[1, 2, 3, 4].map((age) => (
                  <option key={age} value={age}>
                    {CASTLE_AGE_ZH[age]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              敌方护军
              <select
                aria-label="敌方护军"
                value={config.escort}
                onChange={(event) => change({ escort: event.currentTarget.value as CastleDefenseConfig['escort'] })}
              >
                {CASTLE_ESCORTS.map((value) => (
                  <option key={value} value={value}>
                    {CASTLE_ESCORT_ZH[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              到场与撤回通路
              <select
                aria-label="到场与撤回通路"
                value={config.path}
                onChange={(event) => change({ path: event.currentTarget.value as CastleDefenseConfig['path'] })}
              >
                {CASTLE_PATHS.map((value) => (
                  <option key={value} value={value}>
                    {CASTLE_PATH_ZH[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              资源可迁移情况
              <select
                aria-label="资源可迁移情况"
                value={config.resources}
                onChange={(event) => change({ resources: event.currentTarget.value as CastleDefenseConfig['resources'] })}
              >
                {CASTLE_RESOURCES.map((value) => (
                  <option key={value} value={value}>
                    {CASTLE_RESOURCE_ZH[value]}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          <p className="castle-defense-note">“未见护军”需要主动查证。视野丢失或路线变化后，应改回未知。完工前的资源选择会保留，完工后的分支才用它决定内容。</p>
          <button type="button" className="btn castle-defense-reset" onClick={reset}>
            重置为默认观察
          </button>
        </aside>
        {plan && (
          <div className="castle-defense-result" data-testid="castle-defense-result">
            <ol className="castle-defense-stages" aria-label="四个观察阶段">
              {stages.map((stage) => (
                <li key={stage.id} aria-current={plan.stage === stage.id ? 'step' : undefined}>
                  {stage.label}
                </li>
              ))}
            </ol>
            <section className="castle-defense-panel castle-defense-intro" aria-labelledby="castle-defense-plan-title">
              <p className="castle-defense-kicker">现在的重点</p>
              <h2 id="castle-defense-plan-title">{plan.title}</h2>
              <p>{plan.summary}</p>
              <p className="castle-defense-note">当前按{CASTLE_AGE_ZH[config.age]}整理；具体单位、科技和建筑资格仍需查看本方科技树。</p>
              {plan.notices.length > 0 && (
                <ul className="castle-defense-notices">
                  {plan.notices.map((notice) => (
                    <li key={notice}>{notice}</li>
                  ))}
                </ul>
              )}
              <details>
                <summary>还要查什么</summary>
                <ul>
                  {plan.checks.map((check) => (
                    <li key={check}>{check}</li>
                  ))}
                </ul>
              </details>
            </section>
            <section aria-labelledby="castle-defense-actions-title" className="castle-defense-actions" data-testid="castle-defense-actions">
              <h2 id="castle-defense-actions-title">先做哪些判断与行动</h2>
              {plan.actions.map((item) => (
                <ActionCard key={item.id} item={item} />
              ))}
            </section>
            {plan.preparations.length > 0 && (
              <section
                aria-labelledby="castle-defense-preparations-title"
                className="castle-defense-actions castle-defense-preparations"
                data-testid="castle-defense-preparations"
              >
                <h2 id="castle-defense-preparations-title">后续准备，当前尚不能直接执行</h2>
                {plan.preparations.map((item) => (
                  <ActionCard key={item.id} item={item} />
                ))}
              </section>
            )}
          </div>
        )}
      </div>
      <section className="castle-defense-panel castle-defense-scope" aria-labelledby="castle-defense-scope-title">
        <h2 id="castle-defense-scope-title">先核对本方的实际条件</h2>
        <p>本页只给通用检查清单。僧侣、攻城器和防守建筑都不能跨文明、跨时代直接套用；先核对科技树、生产前置、资源、保护和位置。</p>
        <div className="castle-defense-context-links">
          <Link to="/civs">选文明查科技树</Link>
          <Link to="/construction">查施工时间与停采投入</Link>
          <Link to="/matchup">返回对局助手</Link>
        </div>
        <p className="castle-defense-note">
          不模拟地图、射界、微操、维修和拆堡胜负；没有最佳人数或胜率保证。施工工具只描述同时施工，不判断村民能否赶到、存活或成功落堡。
        </p>
        <details>
          <summary>来源、复核日期与适用范围</summary>
          <p>
            战术文字由本站根据下列资料整理，核对日期 {CASTLE_DEFENSE_REVIEWED_AT}。四阶段分类、风险和复查问题为本站整理。Steam
            原帖仅作为需求证据，不作为攻略正确性的依据。
          </p>
          <ul className="castle-defense-source-list">
            {CASTLE_DEFENSE_SOURCES.map((source) => (
              <li key={source.id}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
                <span className="castle-defense-note">{source.date}</span>
                <p>{source.scope}</p>
              </li>
            ))}
          </ul>
          <p className="castle-defense-note">
            固定 DE Update {__DATA_SOURCES__.patch.build}。不将旧文数字或通用攻略中的时代简述代替本站固定数据；不默认推广到 Nomad、团战或其他地图。
          </p>
        </details>
      </section>
    </section>
  );
}
