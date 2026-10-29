import { Link } from 'react-router-dom';
import { PLAYER_CATALOG } from '../../data/players';
import { playerPath } from '../../domain/playerCatalog.mjs';
import { ListHead } from '../../shared/ui/layout';
import { Icon } from '../../shared/ui/Icon';
import './players.css';

export default function Players() {
  return (
    <section className="pane players-page" data-testid="players-page">
      <ListHead level={1} title="职业选手资料" desc="查阅公开身份、年度战绩与明确赛事语境中的对局文明。" />
      <p className="note">资料按公开来源收录；单场使用的文明不代表偏好、风格或当前实力。</p>
      {PLAYER_CATALOG.status === 'unavailable' ? (
        <p role="status">资料暂不可用，请稍后再查看。</p>
      ) : PLAYER_CATALOG.status === 'empty' ? (
        <p role="status">暂无已收录选手。</p>
      ) : (
        <div className="players-grid">
          {PLAYER_CATALOG.catalog.players.map((player) => (
            <article className="player-card" key={player.id}>
              <Icon name="users" />
              <h2>
                <Link to={playerPath(player)}>{player.handle}</Link>
              </h2>
              <p lang="en">{player.fullName}</p>
              <p>{player.country}</p>
              <p>
                <span className="num nw">{player.achievement.year} 年</span> {player.achievement.event} {player.achievement.result}
              </p>
              <Link className="player-link" to={playerPath(player)}>
                查看 {player.handle} 资料 <Icon name="arrow-right" />
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
