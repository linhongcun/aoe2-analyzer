import { Icon } from '../../shared/ui/Icon';
import { SD3_SOURCE, SD3_WATCH_CHECKED_AT, SD3_WATCH_ROWS, sd3WatchPhase } from './sd3Watch';
import './sudden-dessaster.css';

function WatchBody() {
  return (
    <>
      <p className="note">只列出手册上的开打时间，本站没有直播。</p>
      <ul className="sd3-watch-rows">
        {SD3_WATCH_ROWS.map((row) => (
          <li key={row.id} data-round={row.id}>
            <span className="sd3-watch-round">{row.label}</span>
            <span className="sd3-watch-time">
              <span className="nw">Asia/Shanghai</span>
              <time className="num nw" dateTime={row.utc}>
                {row.shanghai}
              </time>
            </span>
            <span className="sd3-watch-time">
              <span className="nw">UTC</span>
              <time className="num nw" dateTime={row.utc}>
                {row.utcText}
              </time>
            </span>
          </li>
        ))}
      </ul>
      <p className="note">
        开打时间据{' '}
        <a href={SD3_SOURCE} target="_blank" rel="noopener noreferrer">
          <Icon name="external-link" />
          Sudden Dessaster 3 赛事页
        </a>
        ，于{' '}
        <time className="num nw" dateTime={SD3_WATCH_CHECKED_AT}>
          {SD3_WATCH_CHECKED_AT}
        </time>{' '}
        核对。
      </p>
    </>
  );
}

export default function SuddenDessasterWatch({ now = new Date() }: { now?: Date }) {
  const phase = sd3WatchPhase(now);
  if (phase === 'ended') {
    return (
      <section className="sd3-watch" data-testid="sd3-watch" data-state="ended" aria-label="SD3 观赛窗口">
        <details className="sd3-watch-ended">
          <summary>
            <Icon name="calendar" />
            SD3 观赛窗口，本届已结束
          </summary>
          <div className="sd3-watch-body">
            <WatchBody />
          </div>
        </details>
      </section>
    );
  }
  return (
    <section className="sd3-watch" data-testid="sd3-watch" data-state="open" aria-label="SD3 观赛窗口">
      <h3>
        <Icon name="calendar" />
        SD3 观赛窗口
      </h3>
      <WatchBody />
    </section>
  );
}
