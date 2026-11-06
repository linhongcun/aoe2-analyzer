import { Link } from 'react-router-dom';
import { Icon } from '../../shared/ui/Icon';
import {
  CLIFF_PENDING,
  ELEVATION_HIGHER_RES,
  ELEVATION_LOWER_RES,
  elevationFacts,
  formatElevationNumber,
  HIGHER_BASE,
  HOTFIX_82587,
  LOWER_BASE,
  TERRAIN_OMISSION,
  UGC_ELEVATION_SOURCE,
  type ElevationCiv,
  type ElevationFacts,
  type ResourceAdd,
} from './elevation';

const num = (value: string | number) => <span className="num nw gg-number">{value}</span>;
const baseHigher = formatElevationNumber(HIGHER_BASE) ?? '待确认';
const baseLower = formatElevationNumber(LOWER_BASE) ?? '待确认';

function addPhrase(add: ResourceAdd, text: string | null) {
  if (add.state === 'absent') return '没有这项增量';
  if (add.state === 'pending' || text === null) return '待确认';
  return num(text);
}

function factorPhrase(text: string | null) {
  if (text === null) return '待确认';
  return num(`×${text}`);
}

function CivLine({ civ }: { civ: ElevationCiv }) {
  return (
    <p>
      {civ.zh ?? civ.en}：资源 {num(ELEVATION_HIGHER_RES)} {addPhrase(civ.higherAdd, civ.higherAddText)}，高打低 {factorPhrase(civ.higher)}；资源{' '}
      {num(ELEVATION_LOWER_RES)} {addPhrase(civ.lowerAdd, civ.lowerAddText)}，低打高 {factorPhrase(civ.lower)}。
    </p>
  );
}

export default function ElevationCard({ facts = elevationFacts() }: { facts?: ElevationFacts }) {
  const tatars = facts.tatars;
  const bonusHref = tatars.bonusIndex === null ? null : `/civ/${tatars.en}/bonus/${tatars.bonusIndex}`;
  return (
    <section className="gg-modes" id="elevation-bonus" data-testid="elevation-bonus" aria-labelledby="elevation-bonus-title">
      <p className="gg-kicker gg-modes-kicker">
        <Icon name="map" />
        高地伤害
      </p>
      <h2 id="elevation-bonus-title">高打低、低打高各乘多少</h2>
      <p>高处的单位打低处，和低处打高处，乘子不一样。这里只写已经核对过的伤害乘子。</p>

      <h3>默认</h3>
      <p data-elevation="default">
        高打低 {factorPhrase(facts.defaultHigher)}，低打高 {factorPhrase(facts.defaultLower)}。资源 {num(ELEVATION_HIGHER_RES)} 是{' '}
        {num(facts.defaultHigherAdd ?? '待确认')}，资源 {num(ELEVATION_LOWER_RES)} 是 {num(facts.defaultLowerAdd ?? '待确认')}。
      </p>
      <p className="note">
        公式：高打低 ×（{num(baseHigher)} + 资源 {num(ELEVATION_HIGHER_RES)}），低打高 ×（{num(baseLower)} + 资源 {num(ELEVATION_LOWER_RES)}）。
      </p>
      <p className="note">没有写出这两项的文明，按增量 {num(0)} 计算。</p>

      <h3>鞑靼</h3>
      <div data-elevation="tatars">
        <CivLine civ={tatars} />
        {tatars.catalogMatches && tatars.bonusZh && tatars.higher ? (
          <p data-elevation="aligned">
            文明页：「{tatars.bonusZh}」对应资源 {num(ELEVATION_HIGHER_RES)} 增量 {num(tatars.higherAddText ?? '待确认')}，高打低是{' '}
            {factorPhrase(tatars.higher)}。
          </p>
        ) : (
          <p data-elevation="alignment-pending">文明页原文和资源 {num(ELEVATION_HIGHER_RES)} 的增量是否同一件事：待确认。</p>
        )}
        {tatars.techs.length > 0 && (
          <p className="note">
            经济数据科技{' '}
            {tatars.techs.map((tech, index) => (
              <span key={tech}>
                {index > 0 ? '、' : null}
                {num(tech)}
              </span>
            ))}
            。
          </p>
        )}
        <p className="community-tool-row">
          {tatars.zh && (
            <Link className="community-tool-entry" to={`/civ/${tatars.en}`}>
              {tatars.zh}文明
            </Link>
          )}
          {bonusHref && (
            <Link className="community-tool-entry" to={bonusHref}>
              这条高地加成
            </Link>
          )}
        </p>
      </div>

      <h3>站内伤害计算</h3>
      <p data-elevation="terrain">{TERRAIN_OMISSION}</p>
      <p className="community-tool-row">
        <Link className="community-tool-entry" to="/duel">
          单位 PK
        </Link>
        <Link className="community-tool-entry" to="/matchup">
          对局助手
        </Link>
      </p>

      <h3>悬崖</h3>
      <p data-elevation="cliff">{CLIFF_PENDING}</p>
      {facts.others.length > 0 ? (
        <div data-elevation="others">
          {facts.others.map((civ) => (
            <CivLine key={civ.en} civ={civ} />
          ))}
        </div>
      ) : (
        <p className="note" data-elevation="others">
          目前这份经济数据里，没有其它文明改写资源 {num(ELEVATION_HIGHER_RES)} 或资源 {num(ELEVATION_LOWER_RES)}。
        </p>
      )}

      <div className="gg-mode-sources" aria-label="高地出处" data-elevation="sources">
        <section className="gg-source">
          <a className="community-tool-entry" href={UGC_ELEVATION_SOURCE.url} target="_blank" rel="noopener noreferrer">
            {UGC_ELEVATION_SOURCE.title}
          </a>
          <p className="note">
            Last-Modified{' '}
            <time className="gg-number nw" dateTime={UGC_ELEVATION_SOURCE.lastModified}>
              {UGC_ELEVATION_SOURCE.lastModified}
            </time>
            。资源 {num(ELEVATION_HIGHER_RES)}、{num(ELEVATION_LOWER_RES)} 的公式写在这一页。
          </p>
        </section>
        <section className="gg-source">
          <p className="note">
            DE Update {num(facts.patchBuild ?? '待确认')}
            {facts.patchDate ? (
              <>
                （<time dateTime={facts.patchDate}>{facts.patchDate}</time>）
              </>
            ) : null}{' '}
            civEco。鞑靼增量从这份经济数据读取。
          </p>
        </section>
        <section className="gg-source">
          <a className="community-tool-entry" href={HOTFIX_82587.url} target="_blank" rel="noopener noreferrer">
            {HOTFIX_82587.title}
          </a>
          <p className="note">
            发布于{' '}
            <time className="gg-number nw" dateTime={HOTFIX_82587.publishedAt}>
              {HOTFIX_82587.publishedAt}
            </time>
            。原文：{HOTFIX_82587.quote}。这只说明高地加成存在，乘子以上面的 UGC 公式和 civEco 为准。
          </p>
        </section>
      </div>
    </section>
  );
}
