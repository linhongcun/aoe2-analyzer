/** 通用科技模拟器左侧「团队加成」两层卡片（本方常驻只读 + 额外盟友开关，issue 1481） */
import { Icon } from '../Icon';
import { NumWrappedText } from '../widgets';
import './sim-team.css';

export interface SimTeamBonusItem {
  civ?: string;
  label: string;
  ok: boolean;
}

export interface IndexedTeamBonusItem extends SimTeamBonusItem {
  index: number;
}

export function splitSimTeamBonuses(civ: string, teamBonuses: readonly SimTeamBonusItem[]) {
  const own: IndexedTeamBonusItem[] = [];
  const ally: IndexedTeamBonusItem[] = [];
  teamBonuses.forEach((item, index) => {
    if (!item.ok) return;
    if (item.civ !== undefined && item.civ === civ) own.push({ ...item, index });
    else ally.push({ ...item, index });
  });
  return { own, ally };
}

export function SimTeamBonusCard({
  civ,
  team,
  teamBonuses,
  headingLevel,
  onToggle,
}: {
  civ: string;
  team: ReadonlySet<number>;
  teamBonuses: readonly SimTeamBonusItem[];
  headingLevel?: 2 | 3;
  onToggle: (index: number) => void;
}) {
  const Subheading = headingLevel === 2 ? 'h3' : 'h4';
  const { own, ally } = splitSimTeamBonuses(civ, teamBonuses);
  return (
    <div className="simg sim-team-group" data-t="sim-team-group">
      <Subheading className={headingLevel === undefined ? undefined : 'sim-group-title'}>团队加成</Subheading>
      {own.length === 0 && ally.length === 0 ? (
        <p className="note sim-team-empty">无适用的已编码团队加成</p>
      ) : (
        <>
          {own.length > 0 && (
            <div className="sim-team-sub" data-t="sim-team-own">
              <div className="sim-team-subhead">
                <p className="sim-team-kicker">本方常驻团队加成</p>
                <span className="sim-team-auto-badge nw">已自动计入</span>
              </div>
              {own.map((item) => (
                <div className="sim-team-own-item" key={item.index}>
                  <div className="sim-team-own-main">
                    <Icon name="check" className="ic sim-team-own-ic" />
                    <span>
                      <NumWrappedText text={item.label} />
                    </span>
                  </div>
                  <p className="sim-team-own-meta">1v1 与团战均常驻生效，不可关闭。</p>
                </div>
              ))}
            </div>
          )}
          <div className="sim-team-sub" data-t="sim-team-ally">
            <p className="sim-team-kicker">额外盟友团队加成（开关）</p>
            {ally.length > 0 ? (
              ally.map((item) => {
                const checked = team.has(item.index);
                return (
                  <label key={item.index} className={`simt sim-team-check${checked ? ' on' : ''}`}>
                    <input type="checkbox" checked={checked} onChange={() => onToggle(item.index)} />
                    <span>
                      <NumWrappedText text={item.label} />
                    </span>
                  </label>
                );
              })
            ) : (
              <p className="note sim-team-empty">当前对象无其他文明的适用额外盟友团队加成。</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
