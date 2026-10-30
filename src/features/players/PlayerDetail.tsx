import { Link, useLocation, useParams } from 'react-router-dom';
import { PLAYER_CATALOG } from '../../data/players';
import { civs } from '../../data';
import { playerById, playerPath, type Player, type PlayerCatalog } from '../../domain/playerCatalog.mjs';
import { sharePageUrl } from '../../domain/sharePage';
import { Breadcrumbs } from '../../shared/ui/layout';
import { Icon } from '../../shared/ui/Icon';
import { useShareLink } from '../../shared/ui/useShareLink';
import './players.css';

function Profile({ player, catalog }: { player: Player; catalog: PlayerCatalog }) {
  const { copy, status, statusProps, manualLink } = useShareLink({
    stateKey: player.id,
    successMessage: '选手链接已复制。',
    failureMessage: '自动复制失败，请手动复制下方完整选手链接。',
  });
  const evidence = [
    ...player.identityEvidence.map((entry) => ({ ...entry, fact: '身份' })),
    ...player.achievement.evidence.map((entry) => ({ ...entry, fact: '年度战绩' })),
    ...player.match.evidence.map((entry) => ({ ...entry, fact: '对局文明' })),
  ];
  const citedSources = catalog.sources.filter((source) => evidence.some((entry) => entry.sourceId === source.id));
  const civName = (id: string) => civs.find((civ) => civ.en === id)!.zh;
  const opponent = playerById(catalog, player.match.opponentId)!;
  return (
    <>
      <Breadcrumbs current={player.handle} />
      <header className="player-heading">
        <div>
          <p className="note">公开选手资料</p>
          <h1>{player.handle}</h1>
          <p lang="en">{player.fullName}</p>
          <p>{player.country}</p>
        </div>
        <button className="btn" type="button" onClick={() => void copy(() => sharePageUrl(playerPath(player), '', document.baseURI))}>
          <Icon name="copy" />
          复制选手链接
        </button>
      </header>
      {status && <p {...statusProps}>{status}</p>}
      {manualLink && (
        <label className="player-manual">
          完整选手链接
          <input aria-label="完整选手链接" readOnly value={manualLink} onFocus={(event) => event.target.select()} />
        </label>
      )}
      <section className="player-section" aria-labelledby="player-achievement">
        <h2 id="player-achievement">年度战绩</h2>
        <p>
          <span className="num nw">{player.achievement.year} 年</span> {player.achievement.event} {player.achievement.result}
        </p>
        <p className="note">年份来自赛事记录，来源发布日期不表示决赛日期。</p>
      </section>
      <section className="player-section" aria-labelledby="player-match">
        <h2 id="player-match">赛事回顾中的对局文明</h2>
        <p>
          <span className="num nw">{player.match.year} 年</span> {player.match.event} {player.match.stage}
          {player.match.game}；{player.match.map ? `地图 ${player.match.map}` : '该段地图未核实'}。
        </p>
        <p>
          {player.handle} 使用 <Link to={`/civ/${player.match.civId}`}>{civName(player.match.civId)}</Link>；对手{' '}
          <Link to={playerPath(opponent)}>{opponent.handle}</Link> 使用{' '}
          <Link to={`/civ/${player.match.opponentCivId}`}>{civName(player.match.opponentCivId)}</Link>。
        </p>
        <p className="note">这是赛事回顾中的单局记录，不表示选手的代表、擅长或最爱文明。</p>
        <p>
          {civName(player.match.civId)}：
          <Link className="player-link" to={`/builds?civ=${player.match.civId}`}>
            该文明开局 <Icon name="arrow-right" />
          </Link>
        </p>
        <p className="note">使用站内现有开局模板，并非该场比赛的实战流程。</p>
        {player.id === 'hera' && (
          <div className="player-video">
            <Link className="player-link" to={`/civ/${player.match.civId}?tab=pro`}>
              Hera 原视频视角 <Icon name="arrow-right" />
            </Link>
            <p className="note">
              原视频覆盖全部 <span className="num nw">56 个文明</span>；本站未摘录当前文明的名次、档位或分数。
            </p>
          </div>
        )}
      </section>
      <details className="player-sources">
        <summary>来源与核对说明</summary>
        <p className="note">公开日期按来源完整时间戳换算为北京时间，与赛事年份、决赛日期分开记录。</p>
        <ul>
          {citedSources.map((source) => (
            <li key={source.id}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title}
              </a>
              <p>
                {source.kind}；
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
                {evidence
                  .filter((entry) => entry.sourceId === source.id)
                  .map((entry, index) => (
                    <li key={index}>
                      {entry.fact}：{entry.locator}
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
        <p className="note">
          本页核对日：<span className="num nw">{catalog.checkedAt}</span>。原文仅支持所列事实；未核实的日期与偏好不作推断。
        </p>
      </details>
      <nav className="player-returns" aria-label="选手相关入口">
        <Link className="player-link" to="/events">
          <Icon name="arrow-left" />
          返回赛事公告
        </Link>
        <Link className="player-link" to="/players">
          <Icon name="arrow-left" />
          返回选手目录
        </Link>
      </nav>
    </>
  );
}

export default function PlayerDetail() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const candidate = PLAYER_CATALOG.status !== 'unavailable' ? playerById(PLAYER_CATALOG.catalog, id) : undefined;
  const player = candidate && pathname === playerPath(candidate) ? candidate : undefined;
  return (
    <article className="pane players-page player-detail" data-testid="player-detail">
      {PLAYER_CATALOG.status === 'unavailable' ? (
        <>
          <Breadcrumbs current="资料暂不可用" />
          <h1>资料暂不可用</h1>
          <p role="status">选手资料未能通过校验，请稍后再查看。</p>
          <Link className="player-link" to="/players">
            返回选手目录
          </Link>
        </>
      ) : player ? (
        <Profile key={player.id} player={player} catalog={PLAYER_CATALOG.catalog} />
      ) : (
        <>
          <Breadcrumbs current="未收录该选手" />
          <h1>未收录该选手</h1>
          <p>这个地址没有已收录的选手资料，请从目录选择。</p>
          <Link className="player-link" to="/players">
            返回选手目录
          </Link>
        </>
      )}
    </article>
  );
}
