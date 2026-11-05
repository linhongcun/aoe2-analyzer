import { Link } from 'react-router-dom';
import type { Building } from '../../../domain/types';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';

// 核对 techs 101/102/103 的游戏内说明与 eco.ageReq；每页只列本档常规示例。
const rows = {
  101: { age: '封建时代', from: '黑暗时代', ids: [68, 562, 584, 12, 45], excluded: [70, 50, 72] },
  102: { age: '城堡时代', from: '封建时代', ids: [87, 101, 103, 84], excluded: [70, 50, 72, 117, 79] },
  103: { age: '帝王时代', from: '城堡时代', ids: [209, 49, 104], excluded: [70, 50, 72, 117, 79] },
} as const;

export function AgeBuildingRequirements({ techId, buildings }: { techId: keyof typeof rows; buildings: Building[] }) {
  const row = rows[techId];
  const links = (ids: readonly number[], counts: boolean) => (
    <div className="uchips">
      {ids.map((id) => {
        const building = buildings.find((item) => item.id === id);
        return building ? (
          <Link className="community-tool-entry" data-counts={counts} key={id} to={`/building/${id}`}>
            {building.zh}
          </Link>
        ) : (
          <span key={id}>建筑资料待确认</span>
        );
      })}
    </div>
  );
  return (
    <section className="detail-section" aria-labelledby="age-buildings-title">
      <h2 id="age-buildings-title">升时代需要哪些建筑</h2>
      <p>
        通常需要<span className="nw">两种不同</span>的计入建筑，且已建成；两座同类建筑不算两种。下列是常规示例，不是完整的文明专属清单。
      </p>
      <article aria-labelledby={`age-buildings-${techId}`}>
        <h3 id={`age-buildings-${techId}`}>
          {row.from}升{row.age}
        </h3>
        <p>
          计入示例：从下列{row.from}建筑中任选<span className="num nw">两种</span>。
        </p>
        {links(row.ids, true)}
        {techId === 103 && (
          <>
            <p>
              或只需<span className="num nw">一座</span>城堡／营垒，替代两种城堡时代建筑：
            </p>
            {links([82, 1251], true)}
          </>
        )}
        <p>不计入示例：</p>
        {links(row.excluded, false)}
      </article>
      <p className="note">高棉免除升时代的建筑前置；其他文明的提前建造或专属替代须按实际条件核对。建筑门槛之外，仍需满足时代与资源条件。</p>
      <p className="note">
        来源：DE Update <span className="num nw">{DATA_SOURCES.patch.build}</span>；游戏内升级说明（techs.json）与固定 DE
        数据包的建筑条件树（eco.json.ageReq）。
      </p>
    </section>
  );
}
