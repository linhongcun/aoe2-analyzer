import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import type { CivFormationContent, FormationView } from '../../../domain/civFormations';
import { deriveTabHint } from '../../../domain/formationScenarios';
import { Icon } from '../../../shared/ui/Icon';
import { FormationText } from './FormationPresentation';

type VisibleFormationView = Exclude<FormationView, { status: 'draft' }>;

export const formationTabId = (id: string) => `formation-tab-${id}`;
export const formationPanelId = (id: string) => `formation-panel-${id}`;
export const formationViewId = (view: VisibleFormationView) => (view.status === 'unverified' ? view.id : view.route.id);

interface TabItemMeta {
  id: string;
  view: VisibleFormationView;
  title: string;
  hint: string;
  roleBadge?: { text: string; warn: boolean };
  badges: { text: string; tone: 'warn' | 'neutral' }[];
  groupSrText?: string;
}

function stripRolePrefix(title: string, roleLabel: string): string {
  const prefix = `${roleLabel} · `;
  return title.startsWith(prefix) ? title.slice(prefix.length) : title;
}

function buildTabMeta(view: VisibleFormationView, groupInfo?: { groupTitle: string; groupNote: string; roleLabel: string }): TabItemMeta {
  if (view.status === 'unverified') {
    return {
      id: view.id,
      view,
      title: '路线依据待核实',
      hint: '暂不作为当前版本推荐',
      badges: [{ text: '待核实', tone: 'warn' }],
      ...(groupInfo
        ? {
            roleBadge: { text: groupInfo.roleLabel, warn: groupInfo.groupNote.includes('非主力') },
            groupSrText: `${groupInfo.groupTitle}（${groupInfo.groupNote}）`,
          }
        : {}),
    };
  }

  const { route } = view;
  const title = groupInfo ? stripRolePrefix(route.title, groupInfo.roleLabel) : route.title;
  const hint =
    view.status === 'unavailable'
      ? '必需实体当前不可用'
      : view.status === 'historical'
        ? `原核对 DE ${route.patch.build} · 版本待复核`
        : (route.tabHint ?? deriveTabHint(route.condition));

  const badges: TabItemMeta['badges'] = [];
  if (view.status === 'unavailable') badges.push({ text: '暂不可用', tone: 'warn' });
  else if (view.status === 'historical') badges.push({ text: '版本待复核', tone: 'warn' });
  else {
    if (route.status === 'candidate') badges.push({ text: '限定候选', tone: 'warn' });
    if (route.playtest === 'pending') badges.push({ text: '待实战验证', tone: 'neutral' });
    else if (route.playtest === 'reported') badges.push({ text: '用户报告用过', tone: 'neutral' });
  }

  return {
    id: route.id,
    view,
    title,
    hint,
    badges,
    ...(groupInfo
      ? {
          roleBadge: { text: groupInfo.roleLabel, warn: groupInfo.groupNote.includes('非主力') },
          groupSrText: `${groupInfo.groupTitle}（${groupInfo.groupNote}）`,
        }
      : {}),
  };
}

export function FormationRouteTabs({
  views,
  groups,
  activeId,
  onSelect,
}: {
  views: readonly VisibleFormationView[];
  groups?: CivFormationContent['routeGroups'];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement | null>());
  if (views.length < 2) return null;

  const viewById = new Map(views.map((view) => [formationViewId(view), view]));
  const orderedIds: string[] = [];
  const groupedSections: { title: string; note: string; items: TabItemMeta[] }[] = [];
  const placed = new Set<string>();

  if (groups?.length) {
    for (const group of groups) {
      const items: TabItemMeta[] = [];
      for (const entry of group.routes) {
        const view = viewById.get(entry.id);
        if (!view || placed.has(entry.id)) continue;
        placed.add(entry.id);
        orderedIds.push(entry.id);
        items.push(buildTabMeta(view, { groupTitle: group.title, groupNote: group.note, roleLabel: entry.label }));
      }
      if (items.length > 0) groupedSections.push({ title: group.title, note: group.note, items });
    }
  }

  const ungroupedItems: TabItemMeta[] = [];
  for (const view of views) {
    const id = formationViewId(view);
    if (placed.has(id)) continue;
    orderedIds.push(id);
    ungroupedItems.push(buildTabMeta(view));
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentId: string) {
    const index = orderedIds.indexOf(currentId);
    if (index < 0) return;
    let nextIndex = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % orderedIds.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + orderedIds.length) % orderedIds.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = orderedIds.length - 1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const nextId = orderedIds[nextIndex]!;
    onSelect(nextId);
    tabRefs.current.get(nextId)?.focus();
  }

  const renderTab = (item: TabItemMeta, inGroup = false) => {
    const selected = item.id === activeId;
    return (
      <button
        key={item.id}
        id={formationTabId(item.id)}
        ref={(node) => {
          tabRefs.current.set(item.id, node);
        }}
        type="button"
        role="tab"
        aria-selected={selected}
        aria-controls={formationPanelId(item.id)}
        tabIndex={selected ? 0 : -1}
        className={`formation-route-tab${selected ? ' is-active' : ''}${inGroup ? ' is-in-group' : ''}`}
        onClick={() => onSelect(item.id)}
        onKeyDown={(event) => onKeyDown(event, item.id)}
      >
        {item.groupSrText && <span className="sr-only">{item.groupSrText}：</span>}
        {item.roleBadge && (
          <span className={`formation-tab-role${item.roleBadge.warn ? ' is-warn' : ''}`}>
            <FormationText text={item.roleBadge.text} />
          </span>
        )}
        <span className="formation-tab-head">
          <span className="formation-tab-title">
            <FormationText text={item.title} />
          </span>
          {selected && <Icon name="check" className="formation-tab-check" />}
        </span>
        <span className="formation-tab-hint">
          <FormationText text={item.hint} />
        </span>
        {item.badges.length > 0 && (
          <span className="formation-tab-badges">
            {item.badges.map((badge) => (
              <span key={badge.text} className={`formation-tab-badge is-${badge.tone}`}>
                {badge.text}
              </span>
            ))}
          </span>
        )}
      </button>
    );
  };

  if (groupedSections.length > 0) {
    const colTracks = groupedSections.map((section) => `${section.items.length}fr`).join(' ');
    const gridStyle = { '--formation-group-cols': colTracks } as CSSProperties;
    return (
      <div className="formation-route-tabs-grouped" style={gridStyle} role="tablist" aria-label="推荐阵容路线">
        {groupedSections.map((section) => (
          <div key={section.title} className="formation-route-tray" role="presentation">
            <div className="formation-route-tray-head" aria-hidden="true">
              <span className="formation-route-tray-title">{section.title}</span>
              <span className="formation-route-tray-note">{section.note}</span>
            </div>
            <div className="formation-route-tray-grid" style={{ '--formation-tray-cols': section.items.length } as CSSProperties} role="presentation">
              {section.items.map((item) => renderTab(item, true))}
            </div>
          </div>
        ))}
        {ungroupedItems.map((item) => renderTab(item, false))}
      </div>
    );
  }

  return (
    <div className="formation-route-tabs" role="tablist" aria-label="推荐阵容路线">
      {ungroupedItems.map((item) => renderTab(item, false))}
    </div>
  );
}
