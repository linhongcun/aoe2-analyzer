import { useState, type ReactNode } from 'react';
import { civByEn } from '../../../data';
import {
  applyCatalogView,
  catalogGroup,
  catalogQueryMatch,
  rowMembership,
  type CatalogGroup,
  type CatalogMembership,
} from '../../../domain/buildingDetailView';
import type { FamilyEntry } from '../../../domain/family';
import type { Tech, Unit } from '../../../domain/types';
import { TechLink, UnitLink } from '../../../shared/ui/art';

const GROUP_LABEL: Record<CatalogGroup, string> = { common: '通用', unique: '独特', regional: '区域' };
const FLAG: Record<CatalogMembership, string> = { in: '目录含有', out: '目录不含', unknown: '名单未知' };

interface Line {
  key: string;
  group: CatalogGroup;
  membership: CatalogMembership | null;
  match: boolean;
  node: ReactNode;
  owners: string;
}

function ownerText(civs: readonly string[] | undefined): string {
  if (!civs?.length || civs.length > 4) return '';
  return civs.map((name) => civByEn(name)?.zh ?? name).join('、');
}

function named(entry: FamilyEntry): Pick<Unit, 'zh' | 'en' | 'py' | 'pyi'>[] {
  return [entry.u, ...(entry.elite ? [entry.elite] : [])];
}

export function BuildingCatalog({
  id,
  title,
  empty,
  units,
  techs,
  civ,
}: {
  id: string;
  title: string;
  empty: string;
  units?: readonly FamilyEntry[];
  techs?: readonly Tech[];
  civ: string | null;
}) {
  const [query, setQuery] = useState('');
  const [onlyContained, setOnlyContained] = useState(false);
  const lines: Line[] = units
    ? units.map((entry) => ({
        key: `u${entry.u.id}`,
        group: catalogGroup(entry.u.type),
        membership: rowMembership(entry.elite ? [entry.u.civs, entry.elite.civs] : [entry.u.civs], civ),
        match: catalogQueryMatch(named(entry), query),
        node: <UnitLink u={entry.u} elite={entry.elite} />,
        owners: ownerText(entry.u.civs),
      }))
    : (techs ?? []).map((tech) => ({
        key: `t${tech.id}`,
        group: catalogGroup(tech.type),
        membership: rowMembership([tech.civs], civ),
        match: catalogQueryMatch([tech], query),
        node: <TechLink t={tech} />,
        owners: ownerText(tech.civs),
      }));
  const view = applyCatalogView(lines, onlyContained && !!civ);
  const groups = (['common', 'unique', 'regional'] as const)
    .map((group) => ({ group, rows: view.shown.filter((row) => row.group === group) }))
    .filter((group) => group.rows.length);
  return (
    <section className="bd-section" id={id} aria-label={title}>
      <h2>{title}</h2>
      <p className="bd-count" data-t="catalog-count">
        并集 <span className="num nw">{view.union}</span>
        {' · '}当前显示 <span className="num nw">{view.shown.length}</span>
      </p>
      <div className="bd-find">
        <input
          type="search"
          aria-label={`查找${title}的名称或拼音`}
          placeholder="名称或拼音"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className="bd-check">
          <input type="checkbox" checked={onlyContained} disabled={!civ} onChange={(event) => setOnlyContained(event.target.checked)} />
          只看目录含有
        </label>
      </div>
      {!lines.length && <p className="note">{empty}</p>}
      {!!lines.length && !view.shown.length && !view.unknown.length && <p className="note">{query.trim() ? '没有匹配的名称。' : '没有确认的目录含有。'}</p>}
      {groups.map((group) => (
        <div key={group.group}>
          <h3>
            {GROUP_LABEL[group.group]}（<span className="num nw">{group.rows.length}</span>）
          </h3>
          <div className="bd-rows">
            {group.rows.map((row) => (
              <CatalogLine key={row.key} row={row} />
            ))}
          </div>
        </div>
      ))}
      {!!view.unknown.length && (
        <div data-t="catalog-unknown">
          <p className="bd-kicker">
            另有 <span className="num nw">{view.unknown.length}</span> 项名单未知，未计入当前显示。
          </p>
          <div className="bd-rows">
            {view.unknown.map((row) => (
              <CatalogLine key={row.key} row={row} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function CatalogLine({ row }: { row: Line }) {
  return (
    <div className="bd-row" data-t="catalog-row" data-membership={row.membership ?? 'union'}>
      {row.node}
      {row.membership && (
        <span className="bd-flag" data-state={row.membership}>
          {FLAG[row.membership]}
        </span>
      )}
      {row.group !== 'common' && row.owners && <small className="bd-owners">{row.owners}</small>}
    </div>
  );
}
