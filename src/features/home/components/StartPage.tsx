import { useMemo } from 'react';
import { parsePath, useLocation, useNavigate } from 'react-router-dom';
import { useStartGamePersistence } from '../useStartGamePersistence';
import StartGame from './StartGame';

function currentStartSearch(): string | null {
  if (typeof window === 'undefined') return null;
  const path = parsePath(window.location.hash.slice(1) || '/');
  return (path.pathname ?? '/') === '/start' ? (path.search ?? '') : null;
}

export default function StartPage() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const bridge = useMemo(
    () => ({
      isCurrent: (expected: string) => currentStartSearch() === expected,
      replace: (next: string, expected: string) => {
        if (currentStartSearch() !== expected) return false;
        navigate({ pathname: '/start', search: next }, { replace: true });
        return true;
      },
    }),
    [navigate],
  );
  const { state: flow, onChange, status, notice, retry, abandon } = useStartGamePersistence({ search, bridge });

  return (
    <section id="start" className="pane">
      {notice ? <p role="alert">{notice}</p> : null}
      {status !== 'ready' ? (
        <section className="start-game" aria-labelledby="start-restore-h" data-testid="start-restore">
          <h2 id="start-restore-h">恢复本局进度</h2>
          <p role={status === 'failed' ? 'alert' : 'status'}>
            {status === 'failed' ? '地图目录加载失败，原进度已保留。可以重试或放弃恢复。' : '正在核对本局地图，原进度已保留。'}
          </p>
          {status === 'failed' ? (
            <button className="start-btn" type="button" onClick={retry}>
              重试恢复
            </button>
          ) : null}
          <button className="start-btn" type="button" onClick={abandon}>
            放弃恢复，重新开始
          </button>
        </section>
      ) : (
        <StartGame state={flow} onChange={onChange} />
      )}
    </section>
  );
}
