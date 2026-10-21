import { Link, useLocation } from 'react-router-dom';
import { ALL } from '../../shared/nav/sections';
import { suggestRoutes } from '../../domain/routeSuggestions';
import { Icon } from '../../shared/ui/Icon';
import { Breadcrumbs } from '../../shared/ui/layout';
import './notFound.css';

const destinations = [...ALL, { path: '/about-data', label: '关于数据' }];

export default function NotFound() {
  const { pathname } = useLocation();
  const suggestions = suggestRoutes(pathname, destinations);
  return (
    <section className="pane not-found-page">
      <Breadcrumbs />
      <div className="lhead">
        <h1>找不到该页</h1>
        <span className="note">这个地址没有对应的页面，请检查链接，或通过全局搜索查找内容。</span>
      </div>
      <div className="posbox">
        <p className="not-found-path">
          当前路径：<code>{pathname}</code>
        </p>
        <div className="not-found-actions">
          <Link to="/">
            <Icon name="home" /> 回首页
          </Link>
          <button type="button" onClick={() => dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}>
            <Icon name="search" /> 打开全局搜索
          </button>
        </div>
        {suggestions.length > 0 && (
          <section aria-labelledby="not-found-suggestions">
            <h2 id="not-found-suggestions">你是不是要找</h2>
            <ul className="not-found-suggestions">
              {suggestions.map(({ path, label }) => (
                <li key={path}>
                  <Link to={path}>{label}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  );
}
