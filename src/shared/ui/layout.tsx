/** 统一详情页模板：面包屑 + 头部（图标/中英名/DLC/标签）+ 分区标签页 + 右侧相关链接栏 */
import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { sectionOf } from '../nav/sections';
import { Icon } from './Icon';
import { CopyPageLink } from './DetailBlocks';
import '../styles/editorial-details.css';

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
  titleNote,
  en,
  badges,
  tags,
  tabs,
  initialTab,
  tabsTop,
  afterTabs,
  tablistTestId,
  sidebar,
}: {
  id: string;
  crumb: string;
  icon: ReactNode;
  title: string;
  /** 主名后的文明小字（#44：重名 / 易混单位的详情页页头始终显示） */
  titleNote?: string;
  en: string;
  badges?: ReactNode;
  tags?: ReactNode;
  tabs: DetailTab[];
  initialTab?: string;
  /** 标签栏上方的额外控件（如 普通/精锐 切换） */
  tabsTop?: ReactNode;
  /** 标签栏下方、两栏正文上方。文明详情把离开本页的工具放在这里，不与页内 Tab 同级。 */
  afterTabs?: ReactNode;
  tablistTestId?: string;
  sidebar?: ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const tabId = useId();
  const cur = tabs.find((t) => t.key === params.get('tab')) ?? tabs.find((t) => t.key === initialTab) ?? tabs[0]!;
  const setTab = (key: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', key);
    setParams(next);
  };
  const tabKeys = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    setTab(tabs[next]!.key);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  return (
    <section id={id} className="pane detail">
      <Breadcrumbs current={crumb} />
      <div className="dhead">
        <div className="dhead-ic">{icon}</div>
        <div>
          <h1>
            {title}
            {titleNote && <span className="civnote">{titleNote}</span>} <small>{en}</small>
          </h1>
          <div className="dhead-tags">
            {badges}
            {tags}
          </div>
        </div>
        <CopyPageLink />
      </div>
      {tabsTop}
      <div role="tablist" className="dtabs" aria-label={`${title}内容`} data-testid={tablistTestId}>
        {tabs.map((t, index) => (
          <button
            key={t.key}
            id={`${tabId}-${t.key}`}
            role="tab"
            aria-selected={t.key === cur.key}
            aria-controls={`${tabId}-panel`}
            tabIndex={t.key === cur.key ? 0 : -1}
            className={t.key === cur.key ? 'on' : undefined}
            onClick={() => setTab(t.key)}
            onKeyDown={(event) => tabKeys(event, index)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {afterTabs}
      <div className={sidebar ? 'dbody has-side' : 'dbody'}>
        <div className="dmain" role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${cur.key}`} tabIndex={0}>
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
/** 列表页统一头部：面包屑 + 标题 + 说明。level=1 时标题用 h1 作页面主标题，外观与 h2 相同 */
export const ListHead = ({ title, desc, level = 2 }: { title: string; desc: string; level?: 1 | 2 }) => {
  const H = level === 1 ? 'h1' : 'h2';
  return (
    <>
      <Breadcrumbs />
      <div className="lhead">
        <H>{title}</H>
        <span className="note">{desc}</span>
      </div>
    </>
  );
};
