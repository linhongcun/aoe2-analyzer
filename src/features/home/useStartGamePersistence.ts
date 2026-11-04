import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { resetStart, type StartState } from '../../domain/startGame';
import { loadMaps } from './components/startGameEarly';
import {
  browserStartStorage,
  decodeStartGame,
  decodeStartSearch,
  encodeStartGame,
  encodeStartSearch,
  readStartGame,
  writeStartGame,
  type StartStorage,
} from './startGamePersistence';

const INVALID_LOCAL = '保存的本局进度无法恢复，已显示空局。可以重新选择。';
const INVALID_URL = '链接中的本局进度无法恢复，已显示空局。可以重新选择。';
export interface StartAddressBridge {
  isCurrent(expectedSearch: string): boolean;
  replace(nextSearch: string, expectedSearch: string): boolean;
}
interface Options {
  search: string;
  bridge: StartAddressBridge;
  storage?: () => StartStorage | undefined;
  maps?: () => Promise<readonly { id: string }[]>;
}
interface Session {
  state: StartState;
  status: 'ready' | 'pending' | 'failed';
  notice: string | null;
  source: 'url' | 'local' | 'empty';
  raw: string | null;
  attempt: number;
  address: string;
  epoch: number;
  revision: number;
  canPublish: boolean;
  writeLocal: boolean;
}
function prepare(search: string, storage: () => StartStorage | undefined, epoch: number): Session {
  const url = decodeStartSearch(search);
  const fromUrl = url.kind !== 'absent';
  const raw = fromUrl ? (url.kind === 'invalid' ? null : encodeStartGame(url.state)) : readStartGame(storage);
  const result = fromUrl ? url : raw === null ? null : decodeStartGame(raw);
  const invalid = result?.kind === 'invalid';
  return {
    state: result && (result.kind === 'valid' || result.kind === 'needs-maps') ? result.state : resetStart(),
    status: result?.kind === 'needs-maps' ? 'pending' : 'ready',
    notice: invalid ? (fromUrl ? INVALID_URL : INVALID_LOCAL) : null,
    source: fromUrl ? 'url' : raw === null ? 'empty' : 'local',
    raw,
    attempt: 0,
    address: search,
    epoch,
    revision: 0,
    canPublish: !invalid && result?.kind !== 'needs-maps',
    writeLocal: fromUrl && !invalid,
  };
}

/** 地址与代次一起恢复；未验证候选没有写URL/local的权限。 */
export function useStartGamePersistence(options: Options) {
  const { search, bridge } = options;
  const storage = options.storage ?? browserStartStorage;
  const loadCatalog = options.maps ?? loadMaps;
  const [session, setSession] = useState(() => prepare(search, storage, 0));
  const localAttempt = useRef<string | null>(null);
  let active = session;
  if (session.address !== search) {
    const ownAck = session.status === 'ready' && session.canPublish && search === encodeStartSearch(session.state);
    active = ownAck ? { ...session, address: search } : prepare(search, storage, session.epoch + 1);
    setSession(active);
  }
  useEffect(() => {
    if (active.status !== 'pending' || active.raw === null) return;
    let live = true;
    const request = { raw: active.raw, address: active.address, epoch: active.epoch, attempt: active.attempt };
    const pending = (current: Session) =>
      current.status === 'pending' &&
      current.raw === request.raw &&
      current.address === request.address &&
      current.epoch === request.epoch &&
      current.attempt === request.attempt;
    void Promise.resolve()
      .then(loadCatalog)
      .then((maps) => {
        if (!live || !bridge.isCurrent(request.address)) return;
        const result = decodeStartGame(request.raw, new Set(maps.map((map) => map.id)));
        setSession((current) =>
          !pending(current)
            ? current
            : {
                ...current,
                state: result.kind === 'valid' ? result.state : resetStart(),
                status: 'ready',
                notice: result.kind === 'valid' ? null : current.source === 'url' ? INVALID_URL : INVALID_LOCAL,
                canPublish: result.kind === 'valid',
              },
        );
      })
      .catch(() => {
        if (live && bridge.isCurrent(request.address)) setSession((current) => (pending(current) ? { ...current, status: 'failed' } : current));
      });
    return () => {
      live = false;
    };
  }, [active, loadCatalog, bridge]);
  useEffect(() => {
    if (active.status !== 'ready' || !active.canPublish || active.address !== search || !bridge.isCurrent(active.address)) return;
    const token = `${active.epoch}:${active.revision}`;
    if (active.writeLocal && localAttempt.current !== token) {
      writeStartGame(storage, active.state);
      localAttempt.current = token;
    }
    const next = encodeStartSearch(active.state);
    if (next !== search) bridge.replace(next, active.address);
  }, [active, search, storage, bridge]);
  const { address, epoch } = active;
  const onChange = useCallback(
    (action: SetStateAction<StartState>) => {
      if (!bridge.isCurrent(address)) return;
      setSession((current) =>
        current.status !== 'ready' || current.address !== address || current.epoch !== epoch
          ? current
          : {
              ...current,
              state: typeof action === 'function' ? action(current.state) : action,
              notice: null,
              raw: null,
              canPublish: true,
              writeLocal: true,
              revision: current.revision + 1,
            },
      );
    },
    [address, epoch, bridge],
  );
  const abandon = useCallback(() => {
    if (!bridge.isCurrent(address)) return;
    setSession((current) =>
      current.address !== address || current.epoch !== epoch
        ? current
        : {
            ...current,
            state: resetStart(),
            status: 'ready',
            notice: null,
            raw: null,
            canPublish: true,
            writeLocal: true,
            revision: current.revision + 1,
          },
    );
  }, [address, epoch, bridge]);
  const retry = useCallback(() => {
    if (!bridge.isCurrent(address)) return;
    setSession((current) =>
      current.status !== 'failed' || current.address !== address || current.epoch !== epoch
        ? current
        : { ...current, status: 'pending', attempt: current.attempt + 1 },
    );
  }, [address, epoch, bridge]);
  return { state: active.state, status: active.status, notice: active.notice, onChange, abandon, retry };
}
