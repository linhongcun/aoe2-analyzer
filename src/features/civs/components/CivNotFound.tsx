import { Link } from 'react-router-dom';
import { Breadcrumbs } from '../../../shared/ui/layout';
import { Icon } from '../../../shared/ui/Icon';
import './civ-not-found.css';

export default function CivNotFound({ en }: { en: string }) {
  return (
    <section className="pane civ-not-found">
      <Breadcrumbs current="未知文明" />
      <div className="lhead">
        <h1>没找到这个文明</h1>
        <span className="note">请检查文明名称的拼写，或通过全局搜索查找。</span>
      </div>
      <div className="posbox">
        <p className="civ-not-found-id">
          文明 ID：<code>{en}</code>
        </p>
        <div className="civ-not-found-actions">
          <Link to="/civs">查看文明列表</Link>
          <Link to="/">
            <Icon name="home" /> 回首页
          </Link>
          <button type="button" onClick={() => dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}>
            <Icon name="search" /> 打开全局搜索
          </button>
        </div>
      </div>
    </section>
  );
}
