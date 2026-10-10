import { civByEn } from '../../../data';
import { useCore, useTrees } from '../../../data/hooks';
import { techAffects, textMentions } from '../../../domain/affects';
import { civStatus } from '../../../domain/simulator';
import type { Tech } from '../../../domain/types';
import { collapse, groupLines, type LineEntry } from '../../../domain/family';
import { BuildingLink, EliteBadge, StatIcon, UnitIcon, UnitLink, UnitLinks } from '../../../shared/ui/art';
import { Link } from 'react-router-dom';
import { Icon } from '../../../shared/ui/Icon';
import { Loading } from '../../../shared/ui/widgets';
import { useSticky } from '../../../shared/utils/sticky';

/** 作用对象：与科技模拟器使用同一效果表与判定 */
export default function TechAffects({ t }: { t: Tech }) {
  const core = useCore(),
    trees = useTrees();
  const [civ0, setCiv] = useSticky('affects.civ', '');
  if (!core) return <Loading />;
  const civ = t.civs.includes(civ0) ? civ0 : '';
  const st = civ && trees ? civStatus(trees, civ) : null;
  const uOk = (id: number, civs: string[]) => !st || st['u' + id] === 1 || civs.includes(civ);
  const bOk = (civs: string[]) => !civ || civs.includes(civ);
  const groups = techAffects(t, core.units, core.buildings)
    .map((g) => ({
      ...g,
      rows: g.rows
        .map((r) => ({ ...r, units: r.units.filter((u) => uOk(u.id, u.civs)), buildings: r.buildings.filter((b) => bOk(b.civs)) }))
        .filter((r) => r.units.length + r.buildings.length),
    }))
    .filter((g) => g.rows.length);
  const numeric = techAffects(t, core.units, core.buildings).length > 0;
  const tm = numeric ? null : textMentions(t, core.linker, core.unitById, core.buildingById);
  return (
    <div id="affects">
      <div className="bar">
        文明{' '}
        <select id="affciv" value={civ} onChange={(e) => setCiv(e.target.value)}>
          <option value="">（全部单位/建筑）</option>
          {t.civs.map((n) => (
            <option key={n} value={n}>
              {civByEn(n)?.zh ?? n} 拥有的
            </option>
          ))}
        </select>
        {civ && !trees && <Loading />}
      </div>
      {numeric ? (
        <>
          <p className="note">与科技模拟器使用同一份结构化效果表（单一数据源）；列出该科技数值上作用的全部单位/建筑。</p>
          {groups.length ? (
            groups.map((g) => (
              <div className="affg" key={g.group}>
                <h4>{g.group}</h4>
                {g.rows.map((r) => (
                  <div className="affrow" key={r.effect}>
                    <div className="affef">
                      {r.parts.map((p, i) => (
                        <span key={i} className="tag">
                          {p.icon && <StatIcon k={p.icon} t={p.text} />}
                          {p.text}
                        </span>
                      ))}
                    </div>
                    <div className="uchips">
                      {groupLines(r.units, core.units, core.unitById, core.fam).map((g) => (
                        <LineChip key={'l' + g.members[0]!.u.id} g={g} />
                      ))}
                      {r.buildings.map((b) => (
                        <BuildingLink key={'b' + b.id} b={b} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <p className="note">该文明没有受此科技影响的单位/建筑</p>
          )}
        </>
      ) : (
        <>
          <p className="note">
            <Icon name="triangle-alert" className="ic warn" /> 根据说明文字推断，未计入数值
          </p>
          {tm && tm.units.length + tm.buildings.length ? (
            <div className="uchips">
              <UnitLinks
                list={collapse(
                  tm.units.filter((u) => uOk(u.id, u.civs)),
                  core.fam,
                )}
              />
              {tm.buildings
                .filter((b) => bOk(b.civs))
                .map((b) => (
                  <BuildingLink key={'b' + b.id} b={b} />
                ))}
            </div>
          ) : (
            <p className="note">说明文字中未识别到具体单位或建筑</p>
          )}
        </>
      )}
    </div>
  );
}

/** 一条升级路线一个条目：叠放图标 + 「骑士 / 重骑士 / 圣骑士」，每个名字可点；精锐版合并为小标 */
function LineChip({ g }: { g: LineEntry }) {
  if (g.members.length === 1) return <UnitLink u={g.members[0]!.u} elite={g.members[0]!.elite} />;
  return (
    <span className="lchip" title={g.members.map((m) => m.u.zh + (m.elite ? '（含精锐）' : '')).join('、')}>
      <span className="stack">
        {g.members.map((m) => (
          <UnitIcon key={m.u.id} u={m.u} />
        ))}
      </span>
      {g.members.map((m, i) => (
        <span key={m.u.id}>
          {i > 0 && <span className="lsep"> / </span>}
          <Link className="ulink" to={`/unit/${m.u.id}`}>
            {m.u.zh}
          </Link>
          {m.elite && <EliteBadge />}
        </span>
      ))}
    </span>
  );
}
