import { Link } from 'react-router-dom';
import { EVENT_CATALOG } from '../../data/events';
import { PLAYER_CATALOG } from '../../data/players';
import { playerById, playerPath, type PlayerCatalog } from '../../domain/playerCatalog.mjs';
import type { Event, EventCatalog } from '../../domain/eventCatalog.mjs';
import { ListHead } from '../../shared/ui/layout';
import './events.css';

function EventCard({ event, catalog, players }: { event: Event; catalog: EventCatalog; players: PlayerCatalog }) {
  const evidence = [...event.evidence, ...event.participants.flatMap((participant) => participant.roles.flatMap((role) => role.evidence))];
  return (
    <article className="event-card" data-event={event.id} aria-labelledby={`event-${event.id}`}>
      <p className="event-eyebrow">主办方公告资料</p>
      <h2 id={`event-${event.id}`}>{event.title}</h2>
      <p>{event.game}</p>
      <p className="event-dates">
        公告中的赛事日期：
        <time className="num nw" dateTime={event.startDate}>
          {event.startDate}
        </time>
        <span> 至 </span>
        <time className="num nw" dateTime={event.endDate}>
          {event.endDate}
        </time>
      </p>
      <p>
        公布赛制：
        {event.formats.map((format, index) => (
          <span key={format}>
            {index > 0 && '；'}
            {format === '1v1' ? (
              <>
                <span className="nw">1v1</span> 赛事
              </>
            ) : (
              <>
                The League <span className="nw">3v3</span> 决赛
              </>
            )}
          </span>
        ))}
        。
      </p>
      <p className="note">日期按公告原文记录为日历日期。</p>
      <h3>部分已公布参赛选手</h3>
      <ul className="event-participants">
        {event.participants.map((participant) => {
          const player = playerById(players, participant.playerId)!;
          return (
            <li key={player.id} data-participant={player.id}>
              <Link to={playerPath(player)}>{player.handle}</Link>
              <ul>
                {participant.roles.map((role) => (
                  <li key={role.format}>
                    {role.format === '1v1' ? (
                      <>
                        <span className="nw">1v1</span> 赛事
                      </>
                    ) : (
                      <>
                        The League <span className="nw">3v3</span> 决赛 · {role.team}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      <p className="note">仅列出已核对的公布角色，实际出场以主办方公告为准。选手资料可继续查看具体对局中的文明来源。</p>
      <details className="event-sources">
        <summary>来源与核对说明</summary>
        <p className="note">以下为赛事公告与公布名单；日历日期和来源发布日期分别记录。</p>
        <ul>
          {catalog.sources
            .filter((source) => evidence.some((item) => item.sourceId === source.id))
            .map((source) => (
              <li key={source.id}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.kind}
                </a>
                <p lang="en">{source.title}</p>
                <p>
                  {source.publishedAt ? (
                    <>
                      公开（北京时间）：<span className="num nw">{source.publishedAt}</span>
                    </>
                  ) : (
                    '发布日期未核实'
                  )}
                  ；核对：<span className="num nw">{source.checkedAt}</span>。
                </p>
                <ul>
                  {[...new Set(evidence.filter((item) => item.sourceId === source.id).map((item) => item.locator))].map((locator) => (
                    <li key={locator}>{locator}</li>
                  ))}
                </ul>
              </li>
            ))}
        </ul>
      </details>
    </article>
  );
}

export default function Events() {
  const catalog = EVENT_CATALOG.status === 'unavailable' ? null : EVENT_CATALOG.catalog;
  const players = PLAYER_CATALOG.status === 'unavailable' ? null : PLAYER_CATALOG.catalog;
  return (
    <section className="pane events-page" data-testid="events-page">
      <ListHead level={1} title="赛事公告" desc="查看已核对的公告、日期范围与部分参赛选手。" />
      <p className="event-maintenance">人工维护；以主办方最新公告为准。</p>
      {!catalog || !players ? (
        <p className="event-state" role="status">
          赛事资料暂不可用，请稍后再查看。
        </p>
      ) : catalog.events.length === 0 ? (
        <p className="event-state" role="status">
          暂无已核对赛事。
        </p>
      ) : (
        <>
          <p className="note">
            本页核对日：<span className="num nw">{catalog.checkedAt}</span>。
          </p>
          {catalog.events.map((event) => (
            <EventCard key={event.id} event={event} catalog={catalog} players={players} />
          ))}
        </>
      )}
    </section>
  );
}
