import { civs } from '../../../data';
import { useTrees } from '../../../data/hooks';
import { civStatus } from '../../../domain/civStatus';
import { ARMC_CLASS_NOTE } from '../../../domain/affects';
import {
  applyTechCivFilter,
  browseAffected,
  effectClause,
  effectSummary,
  listedGroupCount,
  thumbRingSourceSentence,
  type TechEffectEntry,
} from '../../../domain/techDetailView';
import type { Families } from '../../../domain/family';
import type { Tech, Unit } from '../../../domain/types';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';
import { useSticky } from '../../../shared/utils/sticky';
import { BuildingLink } from '../../../shared/ui/art';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { Icon } from '../../../shared/ui/Icon';
import { LineChip } from '../../../shared/ui/LineChip';
import { Loading } from '../../../shared/ui/widgets';
import { techEffectText } from '../techEffectText';
import { ThumbRingEffectText } from './ThumbRingEffectText';

function techZh(techs: readonly Tech[], en: string) {
  return techs.find((item) => item.en === en)?.zh ?? en;
}

function sourceRuleText(clause: string, rofVs: readonly number[] | undefined): string {
  if (!rofVs?.length) return `${clause}。这一范围没有攻击间隔系数。来源字段 s:acc。`;
  return `${clause}。原始系数 ${rofVs.map((value) => `v:${value}`).join('，')}。`;
}

function SummaryText({ text, techId }: { text: string; techId: number }) {
  if (techId === 437) return <ThumbRingEffectText text={text} />;
  return text.split(/([+-]?\d+(?:\.\d+)?%?)/g).map((part, index) =>
    /\d/.test(part) ? (
      <span className="num nw" key={index}>
        {part}
      </span>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

function RuleList({ entry, units, unitById, fam }: { entry: TechEffectEntry; units: Unit[]; unitById: Record<number, Unit>; fam: Families }) {
  const view = browseAffected(entry.units, entry.buildings, units, unitById, fam);
  if (!view.groups.length && !view.buildings.length) return null;
  return (
    <div data-t="affect-rule" data-kind={entry.kind} data-rule={entry.id}>
      {view.groups.map((group) => (
        <div className="td-browse" key={group.name}>
          <h3 data-t="browse-group">{group.name}</h3>
          <div className="td-objects" data-t="affect-objects">
            {group.lines.map((line) => (
              <LineChip key={line.members.map((member) => member.u.id).join('-')} g={line} />
            ))}
          </div>
        </div>
      ))}
      {view.buildings.length > 0 && (
        <div className="td-browse">
          <h3 data-t="browse-group">建筑</h3>
          <div className="td-objects" data-t="affect-objects">
            {view.buildings.map((building) => (
              <BuildingLink key={building.id} b={building} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 作用对象：摘要、独立筛选和完整名单在同一块。筛选不写进地址。 */
export default function TechAffects({
  tech,
  entries,
  units,
  unitById,
  fam,
  techs,
}: {
  tech: Tech;
  entries: TechEffectEntry[];
  units: Unit[];
  unitById: Record<number, Unit>;
  fam: Families;
  techs: Tech[];
}) {
  const trees = useTrees();
  const [selected, setSelected] = useSticky('affects.civ', '');
  const status = selected && trees ? civStatus(trees, selected) : null;
  const filter = applyTechCivFilter(
    selected,
    tech.civs,
    civs.map((civ) => civ.en),
    entries,
    selected ? status : null,
  );
  const shown = filter.kind === 'all' || filter.kind === 'narrowed' ? filter.entries : [];
  const count = listedGroupCount(shown, units, unitById, fam);
  const waiting = !!selected && !trees && civs.some((civ) => civ.en === selected) && tech.civs.includes(selected);
  return (
    <section id="affects" className="td-section" aria-label="作用对象">
      <h2>作用对象</h2>
      {entries.map((entry) => {
        const body = effectClause(entry.parts, (text) => techEffectText(tech.id, text));
        const summary = tech.id === 437 ? body : effectSummary(entry.parts, (text) => techEffectText(tech.id, text));
        const text = entry.kind === 'combo' ? `需要${entry.req.map((en) => techZh(techs, en)).join('、')}：${summary}` : summary;
        return (
          <p className="td-summary" data-t="effect-summary" data-kind={entry.kind} data-rule={entry.id} data-req={entry.req.join('|')} key={entry.id}>
            <SummaryText text={text} techId={tech.id} />
          </p>
        );
      })}
      {tech.id === 437 && (
        <>
          <p className="td-kicker">每条对应下面各自的名单。</p>
          <details className="td-source" data-t="effect-source">
            <summary>
              <Icon name="chevron-right" />
              原始系数与来源
            </summary>
            <p className="td-kicker">上面每条各有自己的作用范围。倍率只是近似，原始系数不同就不合并。</p>
            <ul>
              {entries.map((entry) => {
                const clause = effectClause(entry.parts, (text) => techEffectText(tech.id, text));
                return (
                  <li data-t="effect-source-rule" data-rule={entry.id} key={entry.id}>
                    <ThumbRingEffectText text={sourceRuleText(clause, entry.rofVs)} />
                  </li>
                );
              })}
            </ul>
            <p className="td-kicker">
              <ThumbRingEffectText text={thumbRingSourceSentence(DATA_SOURCES.patch?.build ?? '待确认')} />
            </p>
          </details>
        </>
      )}
      {tech.id === 574 && (
        <p className="note" data-t="royal-heirs-armc">
          {ARMC_CLASS_NOTE}
        </p>
      )}
      <div className="td-filter">
        <CivPicker id="affciv" label="按文明筛选" value={selected} onChange={setSelected} none="全部名单" />
        {waiting && <Loading />}
        {filter.kind === 'all' ? (
          <p className="td-kicker" data-t="filter-quiet">
            未筛选文明。当前完整名单 <span className="num">{count}</span> 组。
          </p>
        ) : (
          <p className="td-status" data-t="filter-status" data-state={filter.kind}>
            {filter.kind === 'unknown' && '没有这份文明资料。名单保持为空，不会退回全部。'}
            {filter.kind === 'unavailable' && '该文明无法研究这项科技。已保留选择，名单不退回全部。'}
            {filter.kind === 'empty' && '该文明可以研究这项科技，但当前名单里没有其拥有的作用对象。'}
            {filter.kind === 'pending' && '正在读取该文明的科技树。'}
            {filter.kind === 'narrowed' && (
              <>
                只显示该文明拥有的对象。研究费用和时间不变。当前 <span className="num">{count}</span> 组。
              </>
            )}
          </p>
        )}
      </div>
      {shown.map((entry) => (
        <RuleList key={entry.id} entry={entry} units={units} unitById={unitById} fam={fam} />
      ))}
    </section>
  );
}
