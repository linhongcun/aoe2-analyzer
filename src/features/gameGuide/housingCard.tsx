import { Link } from 'react-router-dom';
import { Icon } from '../../shared/ui/Icon';
import {
  buildingPopHref,
  gapText,
  HOUSING_ANCHOR,
  HOUSING_BONUS_NOTE,
  HOUSING_CAP_NOTE,
  HOUSING_LEAD,
  housingFacts,
  UGC_HOUSING_NOTE,
  UGC_HOUSING_SOURCE,
  type CatalogGap,
  type HousingFacts,
} from './housing';

const numerals = (text: string) =>
  text.split(/(\d+)/).map((part, index) =>
    /\d/.test(part) ? (
      <span key={index} className="num nw gg-number">
        {part}
      </span>
    ) : (
      <span key={index}>{part}</span>
    ),
  );

function gapGroups(gaps: readonly CatalogGap[]) {
  const groups: { zh: string; ids: number[] }[] = [];
  for (const gap of gaps) {
    const last = groups[groups.length - 1];
    if (last?.zh === gap.zh) last.ids.push(gap.id);
    else groups.push({ zh: gap.zh, ids: [gap.id] });
  }
  return groups;
}

export default function HousingCard({ facts = housingFacts() }: { facts?: HousingFacts }) {
  const groups = gapGroups(facts.gaps);
  return (
    <section className="gg-modes" id={HOUSING_ANCHOR} data-testid="housing-pop" aria-labelledby="housing-title">
      <p className="gg-kicker gg-modes-kicker">
        <Icon name="users" />
        人口与房屋
      </p>
      <h2 id="housing-title">这些建筑各提供多少人口</h2>
      <p>{HOUSING_LEAD}</p>
      <p data-housing="cap">{HOUSING_CAP_NOTE}</p>
      <p className="note">{HOUSING_BONUS_NOTE}</p>
      {facts.rows.length > 0 ? (
        <table aria-label="各建筑提供人口">
          <thead>
            <tr>
              <th scope="col">建筑</th>
              <th scope="col">提供人口</th>
            </tr>
          </thead>
          <tbody>
            {facts.rows.map((row) => (
              <tr key={row.id} data-housing-id={row.id}>
                <th scope="row">
                  <Link className="community-tool-entry" to={buildingPopHref(row.id)}>
                    {row.zh ?? '待确认'}
                  </Link>
                </th>
                <td>
                  <span className="num nw gg-number">{row.pop}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p data-housing="empty">建筑资料里没有写明提供人口的建筑：待确认。</p>
      )}
      {groups.length > 0 && (
        <div data-housing="pending">
          {groups.map((group) => (
            <p key={group.zh}>{numerals(gapText(group.zh, group.ids))}</p>
          ))}
        </div>
      )}
      <div className="gg-mode-sources" aria-label="人口与房屋出处" data-housing="sources">
        <section className="gg-source">
          <Link className="community-tool-entry" to="/about-data">
            数据说明
          </Link>
          <p className="note">
            DE Update <span className="num nw gg-number">{facts.patchBuild ?? '待确认'}</span>
            {facts.patchDate ? (
              <>
                （<time dateTime={facts.patchDate}>{facts.patchDate}</time>）
              </>
            ) : null}
            。与页脚数据版本相同。建筑页「提供人口」读的是同一份资料。
          </p>
        </section>
        <section className="gg-source">
          <a className="community-tool-entry" href={UGC_HOUSING_SOURCE.url} target="_blank" rel="noopener noreferrer">
            {UGC_HOUSING_SOURCE.title}
          </a>
          <p className="note">
            Last-Modified{' '}
            <time className="gg-number nw" dateTime={UGC_HOUSING_SOURCE.lastModified}>
              {UGC_HOUSING_SOURCE.lastModified}
            </time>
            。本站核对{' '}
            <time className="gg-number nw" dateTime={UGC_HOUSING_SOURCE.checkedAt}>
              {UGC_HOUSING_SOURCE.checkedAt}
            </time>
            。
          </p>
          <p className="note" data-housing="ugc">
            {numerals(UGC_HOUSING_NOTE)}
          </p>
          <p className="note">站内经济数据里的文明人口加成不写入本表。</p>
        </section>
      </div>
    </section>
  );
}
