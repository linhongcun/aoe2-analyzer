import { useCallback, useEffect, useState, type SetStateAction } from 'react';
import { resetStart, type StartState } from '../../domain/startGame';
import { loadMaps } from './components/startGameEarly';
import { browserStartStorage, decodeStartGame, readStartGame, writeStartGame, type StartStorage } from './startGamePersistence';

const INVALID = '保存的本局进度无法恢复，已显示空局。可以重新选择。';
interface Options {
  storage: () => StartStorage | undefined;
  maps: () => Promise<readonly { id: string }[]>;
}
const DEFAULT: Options = { storage: browserStartStorage, maps: loadMaps };
interface Session {
  state: StartState;
  status: 'ready' | 'pending' | 'failed';
  notice: string | null;
  raw: string | null;
  attempt: number;
  write: boolean;
}
function initial(storage: Options['storage']): Session {
  const raw = readStartGame(storage);
  const restored = raw === null ? null : decodeStartGame(raw);
  return {
    state: restored && restored.kind !== 'invalid' ? restored.state : resetStart(),
    status: restored?.kind === 'needs-maps' ? 'pending' : 'ready',
    notice: restored?.kind === 'invalid' ? INVALID : null,
    raw,
    attempt: 0,
    write: false,
  };
}

/** 单局恢复门控：未验证存档不交给可操作流程，也不写回空态。 */
export function useStartGamePersistence(options: Options = DEFAULT) {
  const { storage, maps: loadCatalog } = options;
  const [session, setSession] = useState(() => initial(storage));
  useEffect(() => {
    if (session.status !== 'pending' || session.raw === null) return;
    let live = true;
    const raw = session.raw;
    const attempt = session.attempt;
    const pending = (current: Session) => current.status === 'pending' && current.raw === raw && current.attempt === attempt;
    void loadCatalog()
      .then((maps) => {
        if (!live) return;
        const result = decodeStartGame(raw, new Set(maps.map((map) => map.id)));
        setSession((current) =>
          !pending(current)
            ? current
            : {
                ...current,
                state: result.kind === 'valid' ? result.state : resetStart(),
                status: 'ready',
                notice: result.kind === 'valid' ? null : INVALID,
                write: false,
              },
        );
      })
      .catch(() => {
        if (live) setSession((current) => (pending(current) ? { ...current, status: 'failed' } : current));
      });
    return () => {
      live = false;
    };
  }, [loadCatalog, session.status, session.raw, session.attempt]);
  useEffect(() => {
    if (session.status === 'ready' && session.write) writeStartGame(storage, session.state);
  }, [storage, session.state, session.status, session.write]);
  const onChange = useCallback((action: SetStateAction<StartState>) => {
    setSession((current) =>
      current.status !== 'ready'
        ? current
        : {
            ...current,
            state: typeof action === 'function' ? action(current.state) : action,
            notice: null,
            raw: null,
            write: true,
          },
    );
  }, []);
  const abandon = () => setSession((current) => ({ ...current, state: resetStart(), status: 'ready', notice: null, raw: null, write: true }));
  const retry = () => setSession((current) => ({ ...current, status: 'pending', attempt: current.attempt + 1 }));
  return { state: session.state, status: session.status, notice: session.notice, onChange, abandon, retry };
}
