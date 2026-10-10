/** 统一详情页模板：面包屑 + 头部（图标/中英名/DLC/标签）+ 分区标签页 + 右侧相关链接栏 */
import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { sectionOf } from '../../app/nav/sections';
import { Icon } from './Icon';

export function Breadcrumbs({ current }: { current?: string }) {
  const { pathname } = useLocation();
  const s = sectionOf(pathname);
  return (
    <nav className="crumbs" aria-label="面包屑">
      <Link to="/">
        <Icon name="home" /> 首页
      </Link>
      {s && (
        <>
          <Icon name="chevron-right" />
          {current ? <Link to={s.path}>{s.label}</Link> : <span>{s.label}</span>}
        </>
      )}
      {current && (
        <>
          <Icon name="chevron-right" />
          <span>{current}</span>
        </>
      )}
    </nav>
  );
}

export interface DetailTab {
  key: string;
  label: string;
  content: ReactNode;
}
export function DetailPage({
  id,
  crumb,
  icon,
  title,
  en,
  badges,
  tags,
  tabs,
  initialTab,
  sidebar,
}: {
  id: string;
  crumb: string;
  icon: ReactNode;
  title: string;
  en: string;
  badges?: ReactNode;
  tags?: ReactNode;
  tabs: DetailTab[];
  initialTab?: string;
  sidebar?: ReactNode;
}) {
  const [tab, setTab] = useState(initialTab ?? tabs[0]!.key);
  const cur = tabs.find((t) => t.key === tab) ?? tabs[0]!;
  return (
    <section id={id} className="pane detail">
      <Breadcrumbs current={crumb} />
      <div className="dhead">
        <div className="dhead-ic">{icon}</div>
        <div>
          <h2>
            {title} <small>{en}</small>
          </h2>
          <div className="dhead-tags">
            {badges}
            {tags}
          </div>
        </div>
      </div>
      <div role="tablist" className="dtabs">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={t.key === cur.key} className={t.key === cur.key ? 'on' : undefined} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className={sidebar ? 'dbody has-side' : 'dbody'}>
        <div className="dmain" role="tabpanel">
          {cur.content}
        </div>
        {sidebar && <aside className="dside">{sidebar}</aside>}
      </div>
    </section>
  );
}
export const SideBlock = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="sideblk">
    <h4>{title}</h4>
    {children}
  </div>
);
/** 列表页统一头部：面包屑 + 标题 + 说明 */
export const ListHead = ({ title, desc }: { title: string; desc: string }) => (
  <>
    <Breadcrumbs />
    <div className="lhead">
      <h2>{title}</h2>
      <span className="note">{desc}</span>
    </div>
  </>
);
