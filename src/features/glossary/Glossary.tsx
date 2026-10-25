import { Link, useParams, useSearchParams } from 'react-router-dom';
import { findTerms, glossary, groupTerms, termById, type GlossaryTerm } from '../../domain/glossary';
import { sharePageUrl } from '../../domain/sharePage';
import { Icon } from '../../shared/ui/Icon';
import { useShareLink } from '../../shared/ui/useShareLink';
import './glossary.css';

function Term({ term }: { term: GlossaryTerm }) {
  const {
    copy: copyLink,
    status: notice,
    manualLink,
    statusProps,
  } = useShareLink({
    stateKey: term.id,
    successMessage: '术语链接已复制。',
    failureMessage: '复制未成功，可复制浏览器地址。',
  });
  const copy = () => copyLink(() => sharePageUrl(`/glossary/${term.id}`, '', document.baseURI));
  return (
    <article className="gl-term" aria-labelledby="gl-title" data-testid="glossary-term">
      <header>
        <p className="note gl-eyebrow">术语与常见措辞</p>
        <h1 id="gl-title">{term.zh}</h1>
        <p className="gl-en" lang="en">
          {term.en}
        </p>
        <div className="gl-variants" aria-label="常见写法">
          {term.aliases.map((alias) => (
            <span className="tag" key={alias}>
              {alias}
            </span>
          ))}
        </div>
      </header>
      <p className="gl-meaning">{term.meaning}</p>
      <section aria-label="使用语境" className="gl-example">
        <h2>怎样理解</h2>
        <p>{term.example}</p>
      </section>
      <section aria-label="注意事项">
        <h2>看清语境</h2>
        <p>{term.note}</p>
      </section>
      <nav className="gl-links" aria-label="相关页面">
        {term.links.map((link) => (
          <Link key={link.href} to={link.href}>
            {link.label}
            <Icon name="arrow-right" />
          </Link>
        ))}
      </nav>
      <details className="gl-sources">
        <summary>来源与核对说明</summary>
        <ul>
          {term.sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title}
              </a>
              <span className="note"> · {source.date}</span>
            </li>
          ))}
        </ul>
        <p className="note">
          {term.checkedAt ?? '2026-10-19'} 已打开核对。社区来源用于解释用法与理解障碍；数学例子是明确假设。游戏实际属性请查看本站 DE 185872 固定数据。
        </p>
      </details>
      <div className="gl-actions">
        <button type="button" onClick={copy}>
          <Icon name="copy" />
          复制术语链接
        </button>
        <Link to="/glossary">查看全部术语</Link>
      </div>
      <p className="note" {...statusProps}>
        {notice}
      </p>
      {manualLink && (
        <label className="note share-link-manual">
          手动复制术语链接
          <textarea aria-label="手动复制术语链接" readOnly value={manualLink} rows={3} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
    </article>
  );
}

export default function Glossary() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const query = sp.get('q') ?? '';
  const terms = findTerms(query);
  if (id) {
    const term = termById(id);
    return (
      <section className="pane glossary">
        <Link className="gl-back" to="/glossary">
          <Icon name="arrow-left" />
          术语与缩写
        </Link>
        {term ? (
          <Term key={term.id} term={term} />
        ) : (
          <div role="status">
            <h1>没有这个术语</h1>
            <p>链接中的条目不存在，可返回术语列表查找。</p>
            <Link className="gl-back" to="/glossary">
              返回全部术语
            </Link>
          </div>
        )}
      </section>
    );
  }
  return (
    <section className="pane glossary">
      <header>
        <p className="note gl-eyebrow">读懂社区建议</p>
        <h1>术语与缩写</h1>
        <p>从一个缩写开始，了解含义、使用语境和相关工具。</p>
        <nav className="bar" aria-label="入门与操作资料">
          <Link className="community-tool-entry" to="/game-guide">
            用六张卡看懂一局与观赛
          </Link>
          <Link className="community-tool-entry" to="/hotkeys">
            查游戏操作与个人按键表
          </Link>
        </nav>
      </header>
      <label className="gl-search">
        搜索术语
        <span>
          <Icon name="search" />
          <input
            type="search"
            value={query}
            placeholder="如 MAA、双靶场、work faster"
            onChange={(event) => setSp(event.target.value ? { q: event.target.value } : {}, { replace: true })}
          />
        </span>
      </label>
      <div className="gl-count">
        <p className="note" role="status">
          <span className="num nw">
            {terms.length} / {glossary.length} 个条目
          </span>
        </p>
        {query && (
          <button type="button" onClick={() => setSp({}, { replace: true })}>
            清空搜索
          </button>
        )}
      </div>
      {groupTerms(terms).map((group) => (
        <section key={group.category} aria-label={group.category} className="gl-group">
          <h2>{group.category}</h2>
          <div className="gl-list">
            {group.terms.map((term) => (
              <article key={term.id}>
                <Link to={`/glossary/${term.id}`}>
                  <div>
                    <h3>{term.zh}</h3>
                    <span className="gl-en" lang="en">
                      {term.en}
                    </span>
                  </div>
                  <Icon name="arrow-right" />
                </Link>
                <p>{term.meaning}</p>
              </article>
            ))}
          </div>
        </section>
      ))}
      {!terms.length && (
        <div className="gl-empty">
          <h2>没有匹配的术语</h2>
          <p>试试英文全称、缩写或中文关键词，也可以清空搜索查看全部。</p>
        </div>
      )}
      <p className="note gl-footnote">本页解释常见用法，不自动推荐打法。缩写有歧义时需结合语境；具体单位、时代与科技以本站固定数据为准。</p>
    </section>
  );
}
