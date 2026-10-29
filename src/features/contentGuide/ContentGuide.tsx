import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  CONTENT_KINDS,
  CONTENT_MODES,
  CONTENT_QUERY_LIMIT,
  contentAcquisitionLabel,
  contentCatalog,
  contentEvidenceState,
  contentGuideShareUrl,
  contentIncludedProductsLabel,
  contentPrerequisiteLabel,
  contentProductById,
  contentProducts,
  decodeContentGuide,
  defaultContentGuide,
  encodeContentGuide,
  filterContentProducts,
  matchingContentBlocks,
  validateContentCatalog,
  type ContentGuideState,
  type ContentName,
  type ContentProduct,
} from '../../domain/contentCatalog';
import { Icon } from '../../shared/ui/Icon';
import { useShareLink } from '../../shared/ui/useShareLink';
import './contentGuide.css';

const evidenceLabels = { verified: '已核实', unverified: '暂未核实', stale: '证据待重新核对', conflict: '来源存在冲突' };
/** 各资料片重复引用的购买依据，只在页尾「适用范围与来源」列一次。 */
const SHARED_SOURCE_IDS = new Set(['base-package', 'gift-announcement']);
const STEAM_PAGE_NOTE = '已实际打开商品页；读取购买项、前置本体提示和内容说明。';
const hasKey = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);
/** issue 275：日期（如 2023-05-11）整体不断行，不在连字符处折行 */
function DateText({ date }: { date: string }) {
  return <span className="nw">{date}</span>;
}
/** 只把文中的日期包成不断行片段，其余文字原样（不加数字样式） */
function DatesText({ text }: { text: string }) {
  return text.split(/(\d{4}-\d{2}-\d{2})/g).map((part, index) => (index % 2 ? <DateText date={part} key={index} /> : part));
}
function ContentNameText({ name, kind }: { name: ContentName; kind: string }) {
  const showEn = !!name.zh && name.zh !== name.en && (kind === 'campaigns' || kind === 'scenarios');
  if (!showEn) return <>{name.zh ?? name.en}</>;
  return (
    <>
      {name.zh}
      <span className="cg-en" lang="en">
        （{name.en}）
      </span>
    </>
  );
}
function SourceItem({ source }: { source: ContentProduct['sources'][number] }) {
  return (
    <li>
      <a href={source.url} target="_blank" rel="noopener noreferrer">
        {source.title}
      </a>
      <p className="cg-note">
        官方商品说明或公告 · {evidenceLabels[source.status]} · 发布日期：
        {source.publishedAt ? <DateText date={source.publishedAt} /> : '页面未提供文章发布日期'} · 核对日期：
        <DateText date={source.verifiedAt} />
      </p>
      {source.note !== STEAM_PAGE_NOTE && (
        <p className="cg-note">
          <ContentText text={source.note} />
        </p>
      )}
    </li>
  );
}
function CampaignPreview({ blocks }: { blocks: ReturnType<typeof matchingContentBlocks> }) {
  const names = blocks.flatMap((block) => (block.kind === 'campaigns' || block.kind === 'scenarios' ? block.names : []));
  if (!names.length) return null;
  return <span className="cg-contents-names">：{names.map((name) => name.zh ?? name.en).join('、')}</span>;
}
function ContentText({ text }: { text: string }) {
  return text.split(/(\d{4}-\d{2}-\d{2}|\d+(?:个|条|项|年|包|文明|战役|剧本))/g).map((part, index) =>
    /^\d{4}-\d{2}-\d{2}$/.test(part) ? (
      <DateText date={part} key={index} />
    ) : /^\d+(?:个|条|项|年|包|文明|战役|剧本)$/.test(part) ? (
      <span className="cg-number" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}
function ProductCard({ product, state }: { product: ContentProduct; state: ContentGuideState }) {
  const blocks = matchingContentBlocks(product, state);
  const ownSources = product.sources.filter((source) => !SHARED_SOURCE_IDS.has(source.id));
  return (
    <article className="cg-card" data-product={product.id} aria-labelledby={`cg-product-${product.id}`}>
      <header>
        <p className="cg-acquisition" data-testid="content-acquisition">
          {contentAcquisitionLabel(product)}
        </p>
        <h2 id={`cg-product-${product.id}`}>{product.zh}</h2>
        <p className="cg-prerequisite" data-testid="content-prerequisite">
          {contentPrerequisiteLabel(product)}
        </p>
        {product.prerequisites.note && (
          <p className="cg-note">
            <DatesText text={product.prerequisites.note} />
          </p>
        )}
      </header>
      <details className="cg-contents">
        <summary>
          收录内容
          <CampaignPreview blocks={blocks} />
        </summary>
        <p className="cg-en" lang="en">
          {product.en}
        </p>
        <div className="cg-content-blocks">
          {blocks.map((block) => (
            <section className="cg-block" key={`${block.mode}-${block.kind}`} aria-label={`${CONTENT_MODES[block.mode]}：${CONTENT_KINDS[block.kind]}`}>
              <h3>
                {CONTENT_MODES[block.mode]} · {CONTENT_KINDS[block.kind]}
              </h3>
              <p>
                <ContentText text={block.summary} />
              </p>
              {contentEvidenceState(product, block.sourceIds) !== 'verified' && (
                <p className="cg-uncertain">{evidenceLabels[contentEvidenceState(product, block.sourceIds)]}，请查看官方来源确认。</p>
              )}
              {!!block.names.length && (
                <ul className="cg-names">
                  {block.names.map((name) => (
                    <li key={name.id} data-content-id={name.id}>
                      {name.siteCivEn ? (
                        <Link to={`/civ/${name.siteCivEn}`}>{name.zh ?? name.en}</Link>
                      ) : (
                        <span>
                          <ContentNameText name={name} kind={block.kind} />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
        {contentIncludedProductsLabel(product) && <p className="cg-note">{contentIncludedProductsLabel(product)}</p>}
        {product.modeNotes && contentEvidenceState(product, product.modeNotesSourceIds ?? []) !== 'verified' && (
          <p className="cg-uncertain">模式说明暂未核实，请查看官方来源确认。</p>
        )}
        {contentEvidenceState(product, product.modeNotesSourceIds ?? []) === 'verified' &&
          product.modeNotes?.map((note) => (
            <p className="cg-note" key={note}>
              <DatesText text={note} />
            </p>
          ))}
        <a className="cg-store" href={`https://store.steampowered.com/app/${product.steamAppId}/`} target="_blank" rel="noopener noreferrer">
          查看 Steam 商品
          <Icon name="arrow-right" />
        </a>
      </details>
      <details className="cg-sources">
        <summary>发行日与商店链接</summary>
        <p className="cg-note">
          商品发行日：
          <DateText date={product.releaseDate} />
        </p>
        {product.translationNote && (
          <p className="cg-note">
            <DatesText text={product.translationNote} />
          </p>
        )}
        <ul>
          {ownSources.map((source) => (
            <SourceItem key={source.id} source={source} />
          ))}
        </ul>
      </details>
    </article>
  );
}

export default function ContentGuide() {
  const location = useLocation();
  const navigate = useNavigate();
  const decoded = useMemo(() => decodeContentGuide(location.search), [location.search]);
  const dataErrors = useMemo(() => validateContentCatalog(), []);
  const state = decoded.state;
  const {
    copy: copyLink,
    status: notice,
    manualLink,
    reset: resetShare,
    statusProps,
  } = useShareLink({
    stateKey: location.search,
    successMessage: '内容导航链接已复制，包含完整筛选条件。',
    failureMessage: '自动复制失败，请手动复制下方完整链接。',
  });
  const [shareError, setShareError] = useState('');
  const sharedSources = contentProducts
    .flatMap((product) => product.sources)
    .filter((source, index, all) => SHARED_SOURCE_IDS.has(source.id) && all.findIndex((item) => item.id === source.id) === index);
  const valid = !decoded.blocked && !decoded.errors.length && !dataErrors.length;
  const results = valid ? filterContentProducts(state) : [];
  const update = (next: ContentGuideState) => {
    navigate({ pathname: '/content-guide', search: `?${encodeContentGuide(next)}` }, { replace: true });
    resetShare();
    setShareError('');
  };
  const copy = async () => {
    if (!valid) return;
    let url: string;
    try {
      url = contentGuideShareUrl(state, document.baseURI);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : '分享链接未生成，请修正筛选后重试。');
      return;
    }
    await copyLink(url);
  };
  return (
    <section className="pane content-guide-page" data-testid="content-guide-page">
      <header className="cg-heading">
        <p className="cg-note">先看想玩的内容</p>
        <h1>内容与购买导航</h1>
        <p>查资料片提供的文明、战役和其他内容，分清当前本体已包含与另购项目。</p>
        <p>
          想看文明最早在哪个版本登场，请去
          <Link className="community-tool-entry" to="/dlc">
            查看文明历史首发列表
          </Link>
          。
        </p>
        <p className="cg-note">
          Steam 公开商店快照 · 核对 {contentCatalog.verifiedAt} · <span className="cg-number">17 项</span>内容
        </p>
      </header>
      {!!dataErrors.length && (
        <div className="cg-error" role="alert">
          <h2>内容目录暂不可用</h2>
          <p>资料关系未通过核对，已暂停展示获取建议。请稍后重试。</p>
        </div>
      )}
      {decoded.blocked ? (
        <div className="cg-error" role="alert">
          <h2>内容导航链接无法恢复</h2>
          <p>{decoded.errors.join(' ')}</p>
          <label>
            保留原链接
            <textarea readOnly value={window.location.href} onFocus={(event) => event.target.select()} />
          </label>
          <button type="button" onClick={() => update(defaultContentGuide())}>
            显式重置筛选
          </button>
        </div>
      ) : (
        <section className="cg-controls" aria-label="筛选内容">
          <label className="cg-search">
            搜索内容（中文或英文）
            <input
              type="search"
              value={state.q}
              maxLength={CONTENT_QUERY_LIMIT * 2}
              placeholder="如 罗马、Ragnar、Alexander"
              aria-invalid={Array.from(state.q).length > CONTENT_QUERY_LIMIT}
              aria-describedby="cg-search-help"
              onChange={(event) => update({ ...state, q: event.target.value })}
            />
          </label>
          <p className="cg-note" id="cg-search-help">
            最多<span className="cg-number"> {CONTENT_QUERY_LIMIT} 个字符</span>；关键词与下面的筛选共同生效。
          </p>
          <div className="cg-selects">
            <label>
              适用模式
              <select value={state.mode} aria-invalid={!hasKey(CONTENT_MODES, state.mode)} onChange={(event) => update({ ...state, mode: event.target.value })}>
                {!hasKey(CONTENT_MODES, state.mode) && <option value={state.mode}>暂未支持：{state.mode}</option>}
                {Object.entries(CONTENT_MODES).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              内容类型
              <select value={state.kind} aria-invalid={!hasKey(CONTENT_KINDS, state.kind)} onChange={(event) => update({ ...state, kind: event.target.value })}>
                {!hasKey(CONTENT_KINDS, state.kind) && <option value={state.kind}>暂未支持：{state.kind}</option>}
                {Object.entries(CONTENT_KINDS).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              指定商品
              <select
                value={state.pack}
                aria-invalid={state.pack !== 'all' && !contentProductById(state.pack)}
                onChange={(event) => update({ ...state, pack: event.target.value })}
              >
                {state.pack !== 'all' && !contentProductById(state.pack) && <option value={state.pack}>暂未收录：{state.pack}</option>}
                <option value="all">全部商品</option>
                {contentProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.zh}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!!decoded.errors.length && (
            <div className="cg-error" role="alert">
              <p>已保留链接中的条件，请修正后继续。</p>
              <ul>
                {decoded.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="cg-actions">
            <button type="button" onClick={() => update(defaultContentGuide())}>
              清空全部筛选
            </button>
            <button type="button" disabled={!valid} onClick={() => void copy()}>
              <Icon name="copy" />
              复制筛选链接
            </button>
          </div>
        </section>
      )}
      {notice && <p {...statusProps}>{notice}</p>}
      {shareError && (
        <p className="cg-error" role="alert">
          {shareError}
        </p>
      )}
      {manualLink && (
        <label className="cg-manual">
          手动复制完整链接
          <textarea readOnly value={manualLink} onFocus={(event) => event.target.select()} />
        </label>
      )}
      {valid && (
        <>
          <p className="cg-count" role="status">
            显示{' '}
            <span className="cg-number">
              {results.length} / {contentProducts.length} 项
            </span>
            内容
          </p>
          {!results.length ? (
            <div className="cg-empty">
              <h2>没有匹配的内容</h2>
              <p>已保留你的筛选。试试其他模式、内容类型或关键词；范围外商品暂未收录。</p>
              <button type="button" onClick={() => update(defaultContentGuide())}>
                查看全部内容
              </button>
            </div>
          ) : (
            <div className="cg-grid">
              {results.map((product) => (
                <ProductCard key={product.id} product={product} state={state} />
              ))}
            </div>
          )}
        </>
      )}
      <details className="cg-boundaries" data-testid="scope-sources">
        <summary>适用范围与来源</summary>
        <p>目录记录本次 Steam 公开页面可见的本体与附加内容，不涵盖所有地区套餐、隐藏商品或未来内容；不维护价格和折扣，也不检测你的账户权益。</p>
        <p>各 Steam 商品页均已打开，读取购买项、前置和内容说明。本体购买项和五周年公告是各资料片共用的依据，只列在这里。</p>
        <p>
          西方霸主、公爵的崛起和印度王朝已由当前本体购买项包含。官方还宣布向当时已有 Steam 本体的玩家赠送缺少的这三个包；具体账户是否激活，请在 Steam 核对。
        </p>
        <p>
          Return of Rome 的古代文明属于独立子游戏，常规 AoE2 的 Romans 是同包提供的另一项权益。Chronicles 文明不进排位，但可在自定义和 AI
          对局与常规文明混战；两个 Chronicles 包互不要求先购买。
        </p>
        <p>版本首发表示何时引入，与当前购买条件分别核对。内容获取快照日期与本站 DE{__DATA_SOURCES__.patch.build} 战斗数据版本互不替代。</p>
        <div className="cg-sources">
          <ul>
            {sharedSources.map((source) => (
              <SourceItem key={source.id} source={source} />
            ))}
          </ul>
        </div>
        <nav className="cg-links" aria-label="内容导航相关页面">
          <a
            href="https://www.ageofempires.com/news/celebrate-5-years-of-age-ii-de-with-a-fresh-deal-for-new-players/"
            target="_blank"
            rel="noopener noreferrer"
          >
            官方收录与赠送公告
          </a>
          <a
            href="https://support.ageofempires.com/hc/en-us/articles/32085996705428-How-to-enable-Age-of-Empires-II-Definitive-Edition-DLCs"
            target="_blank"
            rel="noopener noreferrer"
          >
            查看官方启用说明
          </a>
        </nav>
      </details>
    </section>
  );
}
