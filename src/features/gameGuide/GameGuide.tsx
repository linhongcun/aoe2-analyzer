import { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  GAME_GUIDE_CARDS,
  GAME_GUIDE_CATALOG,
  GAME_GUIDE_CONTEXTS,
  GAME_GUIDE_VICTORIES,
  decodeGameGuideState,
  defaultGameGuideState,
  encodeGameGuideState,
  gameGuideCatalogErrors,
  gameGuideScope,
  gameGuideShareUrl,
  type GameGuideContext,
  type GameGuideState,
  type GameGuideVictory,
} from '../../domain/gameGuide';
import { Icon } from '../../shared/ui/Icon';
import { useShareLink } from '../../shared/ui/useShareLink';
import './gameGuide.css';

const DATA_ERRORS = gameGuideCatalogErrors();
export default function GameGuide() {
  const location = useLocation();
  const navigate = useNavigate();
  const decoded = useMemo(() => decodeGameGuideState(location.search), [location.search]);
  const { state, errors } = decoded;
  const invalid = errors.length > 0;
  const scope = gameGuideScope(state);
  const card = GAME_GUIDE_CARDS.find((item) => item.id === state.card);
  const {
    copy,
    status,
    manualLink,
    reset: resetShare,
    statusProps,
  } = useShareLink({
    stateKey: JSON.stringify([location.search, state]),
    successMessage: '入门卡链接已复制，包含卡片、开局或模式与胜利设置。',
    failureMessage: '自动复制失败，请手动复制下方完整链接。',
    invalidMessage: '地址无法生成，请检查当前站点地址；没有复制或截断链接。',
  });
  const update = (patch: Partial<GameGuideState>) => {
    if (invalid) return;
    navigate({ pathname: '/game-guide', search: '?' + encodeGameGuideState({ ...state, ...patch }) }, { replace: true });
    resetShare();
  };
  const reset = () => {
    navigate({ pathname: '/game-guide', search: '?' + encodeGameGuideState(defaultGameGuideState()) }, { replace: true });
    resetShare();
  };
  const share = async () => {
    if (invalid) return;
    await copy(() => gameGuideShareUrl(state, document.baseURI));
  };
  if (DATA_ERRORS.length)
    return (
      <section className="pane game-guide-page" data-testid="game-guide-page">
        <h1>一局与观赛入门</h1>
        <div role="alert">
          <h2>入门资料暂不可用</h2>
          <p>资料核对未通过，当前不展示未经核对的卡片。</p>
        </div>
      </section>
    );
  return (
    <section className="pane game-guide-page" data-testid="game-guide-page" aria-labelledby="gg-title">
      <header className="gg-heading">
        <div>
          <p className="note">从看懂一局开始</p>
          <h1 id="gg-title">一局与观赛入门</h1>
          <p>用六张短卡，了解目标、开局角色，以及经济、军队和信息怎样联系。</p>
        </div>
        <button type="button" disabled={invalid} onClick={() => void share()}>
          <Icon name="copy" />
          复制当前卡片链接
        </button>
      </header>

      <section className="gg-scope" aria-label="教学适用范围">
        <div className="gg-setting">
          <span>游戏范围</span>
          <strong>常规 AoE2 DE</strong>
          <span className="note">示例使用随机地图</span>
        </div>
        <label className="gg-setting" htmlFor="gg-context">
          <span>开局或模式</span>
          <select id="gg-context" value={state.context} disabled={invalid} onChange={(event) => update({ context: event.target.value as GameGuideContext })}>
            {!Object.hasOwn(GAME_GUIDE_CONTEXTS, state.context) && <option value={state.context}>无效值：{state.context}</option>}
            {Object.entries(GAME_GUIDE_CONTEXTS).map(([id, name]) => (
              <option value={id} key={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="gg-setting" htmlFor="gg-victory">
          <span>胜利设置</span>
          <select id="gg-victory" value={state.victory} disabled={invalid} onChange={(event) => update({ victory: event.target.value as GameGuideVictory })}>
            {!Object.hasOwn(GAME_GUIDE_VICTORIES, state.victory) && <option value={state.victory}>无效值：{state.victory}</option>}
            {Object.entries(GAME_GUIDE_VICTORIES).map(([id, name]) => (
              <option value={id} key={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {invalid && (
        <div className="gg-alert" role="alert">
          <h2>入门链接无法恢复</h2>
          <p>{errors.join(' ')} 当前未展示默认卡片正文。</p>
          <label htmlFor="gg-original">保留原链接</label>
          <textarea id="gg-original" readOnly value={window.location.href} />
          <button type="button" onClick={reset}>
            显式重置入门卡片
          </button>
        </div>
      )}

      {status && (
        <div className="gg-copy">
          <p {...statusProps}>{status}</p>
          {manualLink && (
            <label>
              手动复制完整链接
              <textarea readOnly value={manualLink} />
            </label>
          )}
        </div>
      )}

      <div className="gg-layout">
        <nav className="gg-nav" aria-label="六张入门卡">
          {GAME_GUIDE_CARDS.map((item, index) => (
            <button key={item.id} type="button" disabled={invalid} aria-pressed={!invalid && item.id === state.card} onClick={() => update({ card: item.id })}>
              <span className="gg-index">{index + 1}</span>
              <span>{item.shortTitle}</span>
            </button>
          ))}
        </nav>

        {!invalid &&
          (!scope.supported ? (
            <section className="gg-unsupported" aria-labelledby="gg-unsupported-title" data-testid="game-guide-unsupported">
              <p className="gg-kicker">选择已保留</p>
              <h2 id="gg-unsupported-title">当前范围暂未覆盖</h2>
              {scope.reasons.map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
              <p>本页暂停通用示例正文，没有替换你的选择或补填起始人数。可修改上方条件后继续阅读。</p>
              <div className="gg-links">
                <Link to="/campaigns">查看入门战役</Link>
                <Link to="/content-guide">核对内容与模式</Link>
                <Link to="/maps">查看地图资料范围</Link>
              </div>
            </section>
          ) : (
            card && (
              <article className="gg-card" key={card.id} data-card={card.id} aria-labelledby="gg-card-title">
                <p className="gg-kicker">
                  {GAME_GUIDE_CARDS.indexOf(card) + 1} / {GAME_GUIDE_CARDS.length} · {card.shortTitle}
                </p>
                <h2 id="gg-card-title">{card.title}</h2>
                <p className="gg-summary">{card.summary}</p>
                <div className="gg-explanation">
                  {card.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                <section className="gg-example" aria-label="一个例子">
                  <h3>一个例子</h3>
                  <p>{card.example}</p>
                </section>
                <details className="gg-question">
                  <summary>想一想：{card.question}</summary>
                  <p>{card.answer}</p>
                  <p className="note">这是阅读辅助，不评分，也不判断你是否已经学会。</p>
                </details>
                <p className="gg-boundary">{card.boundary}</p>
                <div className="gg-links" aria-label="继续查资料">
                  {card.links.map((link) => (
                    <Link key={link.to} to={link.to}>
                      {link.label}
                    </Link>
                  ))}
                </div>
                <details className="gg-sources">
                  <summary>这张卡的来源与核对范围</summary>
                  <p className="note">
                    例子、自查与观赛方法由本站整理。资料核对日 <span className="gg-number">{GAME_GUIDE_CATALOG.checkedAt}</span>；本站游戏数据{' '}
                    <span className="gg-number">{GAME_GUIDE_CATALOG.dataVersion}</span>。
                  </p>
                  {card.sourceIds.map((id) => {
                    const source = GAME_GUIDE_CATALOG.sources[id]!;
                    return (
                      <section key={id} className="gg-source">
                        <a href={source.url} target="_blank" rel="noopener noreferrer">
                          {source.title}
                        </a>
                        <p className="note">
                          {source.kind} · 核对 <span className="gg-number">{source.checkedAt}</span> ·{' '}
                          {source.publishedAt ? (
                            <>
                              发布 <span className="gg-number">{source.publishedAt}</span>
                            </>
                          ) : (
                            '发布日期未提供'
                          )}
                        </p>
                        <p>{source.locator}</p>
                        <p className="note">
                          {source.version}。{source.note}
                        </p>
                      </section>
                    );
                  })}
                </details>
              </article>
            )
          ))}
      </div>
      <footer className="gg-footer">
        <p>六卡是入门阅读路线，不是完整教程、胜率工具或实时比赛分析。</p>
        <div className="gg-links">
          <Link to="/glossary">术语释义</Link>
          <Link to="/hotkeys">游戏操作速查</Link>
          <Link to="/content-guide">内容与购买导航</Link>
          <Link to="/campaigns">战役入门目录</Link>
        </div>
      </footer>
    </section>
  );
}
