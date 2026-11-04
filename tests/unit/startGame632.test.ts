import { createElement, StrictMode, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import {
  armTeam,
  resetStart,
  choose1v1,
  chooseLane,
  chooseMap,
  chooseTeamSize,
  civPanels,
  editorialReason,
  enterLobby,
  finishFlow,
  jumpTo,
  laneRowVisible,
  pickCiv,
  skipStep,
} from '../../src/domain/startGame';

import {
  decodeStartSearch,
  encodeStartGame,
  encodeStartSearch,
  START_GAME_LIMIT,
  START_SEARCH_LIMIT,
  type StartStorage,
} from '../../src/features/home/startGamePersistence';
import { useStartGamePersistence } from '../../src/features/home/useStartGamePersistence';

describe('大厅入口只记录实际输入 #632', () => {
  it('未填写的模式和地图是已跳过，不把示例当作已预填', () => {
    const state = enterLobby();
    expect(state.choice).toEqual({ mode: null, teamSize: null, mapId: null, lane: null, civ: null });
    expect(state.skipped).toEqual({ mode: true, map: true });
    expect(state.prefilled).toEqual({});
    expect(state.teamArmed).toBe(false);
    expect(state.current).toBe('civ');
    expect(civPanels(state)).toEqual({ kind: 'empty' });
    const summary = finishFlow(pickCiv(state, 'Franks'));
    expect(summary.choice.civ).toBe('Franks');
    expect(editorialReason(summary)).toBeNull();
    expect(laneRowVisible(summary)).toBe(false);
  });

  it('自己补单挑或只补地图，不借用组队编辑推荐', () => {
    const lobby = enterLobby();
    const solo = chooseMap(choose1v1(jumpTo(lobby, 'mode')), 'arabia');
    expect(civPanels(solo)).toEqual({ kind: 'empty' });
    expect(editorialReason(pickCiv(solo, 'Franks'))).toBeNull();
    const mapOnly = chooseMap(jumpTo(lobby, 'map'), 'arabia');
    expect(civPanels(mapOnly)).toEqual({ kind: 'empty' });
    expect(editorialReason(pickCiv(mapOnly, 'Franks'))).toBeNull();
  });

  it('组队也须明确选图；有真实模式与地图才恢复按侧推荐', () => {
    const team = chooseTeamSize(jumpTo(enterLobby(), 'mode'), '4v4');
    const noMap = skipStep(team);
    expect(civPanels(noMap)).toEqual({ kind: 'empty' });
    expect(editorialReason(pickCiv(noMap, 'Franks'))).toBeNull();
    const mapped = chooseMap(team, 'arabia');
    expect(mapped.current).toBe('lane');
    expect(civPanels(mapped).kind).toBe('empty');
    const picked = pickCiv(chooseLane(mapped, 'pocket'), 'Franks');
    expect(editorialReason(picked)).toContain('中路适合');
    expect(picked.choice).toMatchObject({ mode: 'team', teamSize: '4v4', mapId: 'arabia', lane: 'pocket', civ: 'Franks' });
  });
});

const MAPS = new Set(['arabia', 'arena']);
const team = () => pickCiv(chooseLane(chooseMap(chooseTeamSize(resetStart(), '4v4'), 'arabia'), 'pocket'), 'Franks');
const query = (sg: string, version = '1') => `?${new URLSearchParams({ sgv: version, sg })}`;

describe('完整本局URL codec #669', () => {
  it('保留完整状态、flags false、显式空局、摘要与大厅，输出固定参数顺序', () => {
    for (const state of [
      resetStart(),
      armTeam(resetStart()),
      enterLobby(),
      pickCiv(enterLobby(), 'Franks'),
      team(),
      finishFlow(team()),
      skipStep(team()),
      jumpTo(finishFlow(team()), 'map'),
    ]) {
      const encoded = encodeStartSearch(state);
      expect(encoded.startsWith('?sgv=1&sg=')).toBe(true);
      expect(decodeStartSearch(encoded, MAPS)).toEqual({ kind: 'valid', state });
    }
    expect(decodeStartSearch('')).toEqual({ kind: 'absent' });
    expect(decodeStartSearch(encodeStartSearch(team())).kind).toBe('needs-maps');
    expect(decodeStartSearch(encodeStartSearch(team()), new Set(['arena']))).toEqual({ kind: 'invalid' });
  });
  it('严格拒绝缺/重/unknown参数、版本、坏编码/JSON、独立JSON注入和非法状态', () => {
    const valid = encodeStartSearch(resetStart());
    const badState = { ...resetStart(), current: 'civ' };
    const invalid = [
      '?',
      'sgv=1&sg={}',
      '?sgv=1',
      '?sg={}',
      '?sgv=1&sg=',
      valid + '&extra=1',
      valid + '&sgv=1',
      valid + '&sg={}',
      valid.replace('sgv=1', 'sgv=01'),
      ...['', '1.0', ' 1', '2'].map((v) => query(JSON.stringify(resetStart()), v)),
      '?sgv=1&sg=%',
      '?sgv=1&sg=%C0%AF',
      '?sgv=1&sg=%E0%A4%A',
      query('{'),
      query('null'),
      query('[]'),
      query(JSON.stringify(badState)),
      query(encodeURIComponent(JSON.stringify(resetStart()))),
      query('{} , "version":1, "state":' + JSON.stringify(resetStart())),
      query(JSON.stringify({ ...resetStart(), choice: { ...resetStart().choice, civ: 'unknown' } })),
      '?' + 'x'.repeat(START_SEARCH_LIMIT),
    ];
    for (const search of invalid) expect(decodeStartSearch(search, MAPS), search).toEqual({ kind: 'invalid' });
  });
  it('在parse前按原始UTF-8字节限制，不能先去掉JSON空白再放行', () => {
    const raw = JSON.stringify(resetStart());
    const bytes = new TextEncoder().encode(`{"version":1,"state":${raw}}`).length;
    const exact = raw + ' '.repeat(START_GAME_LIMIT - bytes);
    expect(decodeStartSearch(query(exact), MAPS).kind).toBe('valid');
    expect(decodeStartSearch(query(exact + ' '), MAPS).kind).toBe('invalid');
    expect(decodeStartSearch(query(raw + '中'.repeat(1500)), MAPS).kind).toBe('invalid');
  });
});

function deferred() {
  let resolve!: (maps: { id: string }[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ id: string }[]>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
interface Setup {
  search: string;
  stored?: string | null;
  maps?: () => Promise<readonly { id: string }[]>;
  storage?: () => StartStorage | undefined;
  stageBeforeEffects?: string;
}
async function mount(options: Setup) {
  let live = options.search;
  let stored = options.stored ?? null;
  let reads = 0;
  let mapCalls = 0;
  let setSearch!: (value: string) => void;
  const writes: string[] = [];
  const replacements: string[] = [];
  const storage =
    options.storage ??
    (() => ({
      getItem: () => {
        reads++;
        return stored;
      },
      setItem: (_key: string, value: string) => {
        writes.push(value);
        stored = value;
      },
    }));
  const maps = () => {
    mapCalls++;
    return options.maps?.() ?? Promise.resolve([{ id: 'arabia' }, { id: 'arena' }]);
  };
  const bridge = {
    isCurrent: (expected: string) => live === expected,
    replace: (next: string, expected: string) => {
      if (live !== expected) return false;
      live = next;
      replacements.push(next);
      setSearch(next);
      return true;
    },
  };
  let result!: ReturnType<typeof useStartGamePersistence>;
  function Probe() {
    const [search, update] = useState(options.search);
    setSearch = update;
    result = useStartGamePersistence({ search, bridge, storage, maps });
    return null;
  }
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(StrictMode, null, createElement(Probe)));
    if (options.stageBeforeEffects !== undefined) live = options.stageBeforeEffects;
  });
  return {
    get result() {
      return result;
    },
    get live() {
      return live;
    },
    get stored() {
      return stored;
    },
    get reads() {
      return reads;
    },
    get mapCalls() {
      return mapCalls;
    },
    writes,
    replacements,
    navigate(next: string) {
      live = next;
      setSearch(next);
    },
    stage(next: string) {
      live = next;
    },
    commit(next: string) {
      setSearch(next);
    },
    unmount() {
      act(() => renderer.unmount());
    },
  };
}

describe('实际地址与存储协调hook #669', () => {
  it('合法URL胜冲突local，pending零写；canonical确认不重新加载地图或重复写', async () => {
    const wait = deferred();
    const state = team();
    const url = encodeStartSearch(state);
    const view = await mount({ search: url, stored: encodeStartGame(choose1v1(resetStart())), maps: () => wait.promise });
    expect(view.reads).toBe(0);
    expect(view.result.status).toBe('pending');
    expect(view.writes).toEqual([]);
    expect(view.replacements).toEqual([]);
    await act(async () => wait.resolve([{ id: 'arabia' }]));
    expect(view.result.state).toEqual(state);
    expect(view.result.status).toBe('ready');
    expect(view.writes).toHaveLength(1);
    expect(view.mapCalls).toBe(1);
    await act(async () => view.result.onChange(finishFlow));
    expect(view.live).toBe(encodeStartSearch(finishFlow(state)));
    expect(view.result.status).toBe('ready');
    expect(view.mapCalls).toBe(1);
    expect(view.writes).toHaveLength(2);
    expect(view.replacements).toHaveLength(1);
    view.unmount();
  });
  it('非法URL不读/不覆盖旧local或地址，玩家动作才写完整新状态', async () => {
    const raw = encodeStartGame(team());
    const view = await mount({ search: '?sgv=9&sg=bad', stored: raw });
    expect(view.reads).toBe(0);
    expect(view.stored).toBe(raw);
    expect(view.writes).toEqual([]);
    expect(view.replacements).toEqual([]);
    expect(view.result.state).toEqual(resetStart());
    expect(view.result.notice).toContain('链接');
    await act(async () => view.result.onChange(choose1v1));
    expect(view.live).toBe(encodeStartSearch(choose1v1(resetStart())));
    expect(JSON.parse(view.stored!).state).toEqual(choose1v1(resetStart()));
    view.unmount();
  });
  it('无URL才恢复local；显式空局URL优先旧local，storage拒绝仍可使用', async () => {
    const state = team();
    const local = await mount({ search: '', stored: encodeStartGame(state) });
    expect(local.result.state).toEqual(state);
    expect(local.live).toBe(encodeStartSearch(state));
    expect(local.writes).toEqual([]);
    local.unmount();
    const blank = await mount({ search: encodeStartSearch(resetStart()), stored: encodeStartGame(state) });
    expect(blank.reads).toBe(0);
    expect(blank.result.state).toEqual(resetStart());
    blank.unmount();
    for (const storage of [
      () => {
        throw new Error('getter');
      },
      () => ({
        getItem: () => {
          throw new Error('read');
        },
        setItem: () => {
          throw new Error('write');
        },
      }),
      () => undefined,
    ]) {
      const view = await mount({ search: encodeStartSearch(choose1v1(resetStart())), storage });
      expect(view.result.state.choice.mode).toBe('1v1');
      await act(async () => view.result.onChange(skipStep));
      expect(view.result.status).toBe('ready');
      view.unmount();
    }
  });
  it('目录失败不写，可重试；真实未知ID不回退冲突local', async () => {
    const first = deferred();
    const second = deferred();
    let calls = 0;
    const raw = encodeStartGame(choose1v1(resetStart()));
    const url = encodeStartSearch(team());
    const view = await mount({ search: url, stored: raw, maps: () => (++calls === 1 ? first.promise : second.promise) });
    await act(async () => first.reject(new Error('offline')));
    expect(view.result.status).toBe('failed');
    expect(view.live).toBe(url);
    expect(view.stored).toBe(raw);
    expect(view.writes).toEqual([]);
    await act(async () => view.result.retry());
    await act(async () => second.resolve([{ id: 'arena' }]));
    expect(view.result.state).toEqual(resetStart());
    expect(view.result.notice).toContain('链接');
    expect(view.stored).toBe(raw);
    expect(view.writes).toEqual([]);
    view.unmount();
  });
  it('外部地址同act替换后迟到成功/失败不写，旧UI回调不改变新来源', async () => {
    for (const fail of [false, true]) {
      const wait = deferred();
      const a = encodeStartSearch(team());
      const b = encodeStartSearch(choose1v1(resetStart()));
      const view = await mount({ search: a, maps: () => wait.promise });
      const stale = view.result;
      await act(async () => {
        view.navigate(b);
        if (fail) wait.reject(new Error('late'));
        else wait.resolve([{ id: 'arabia' }]);
      });
      await act(async () => {
        stale.abandon();
        stale.retry();
        stale.onChange(() => enterLobby());
      });
      expect(view.result.state).toEqual(choose1v1(resetStart()));
      expect(view.live).toBe(b);
      expect(view.writes.every((raw) => JSON.parse(raw).state.choice.mode === '1v1')).toBe(true);
      view.unmount();
    }
  });
  it('同raw不同来源代次，canonical回到原地址后旧promise/旧按钮仍不能提交', async () => {
    for (const fail of [false, true]) {
      const first = deferred();
      const second = deferred();
      let calls = 0;
      const state = team();
      const a = encodeStartSearch(state);
      const p = new URLSearchParams(a);
      const b = `?sg=${encodeURIComponent(p.get('sg')!)}&sgv=1`;
      const view = await mount({ search: a, maps: () => (++calls === 1 ? first.promise : second.promise) });
      const stale = view.result;
      await act(async () => view.navigate(b));
      await act(async () => second.resolve([{ id: 'arabia' }]));
      expect(view.live).toBe(a);
      expect(view.result.state).toEqual(state);
      expect(view.mapCalls).toBe(2);
      await act(async () => {
        if (fail) first.reject(new Error('late'));
        else first.resolve([{ id: 'arena' }]);
        stale.abandon();
      });
      expect(view.result.state).toEqual(state);
      expect(view.result.status).toBe('ready');
      expect(view.writes).toHaveLength(1);
      view.unmount();
    }
  });
  it('实际hash先变而Router prop尚未提交时，旧publish不能写local或replace', async () => {
    const a = encodeStartSearch(choose1v1(resetStart()));
    const b = encodeStartSearch(resetStart());
    const view = await mount({ search: a, stageBeforeEffects: b });
    expect(view.writes).toEqual([]);
    expect(view.replacements).toEqual([]);
    await act(async () => view.commit(b));
    expect(view.result.state).toEqual(resetStart());
    expect(view.writes).toHaveLength(1);
    expect(JSON.parse(view.writes[0]!).state).toEqual(resetStart());
    view.unmount();
  });
  it('back到曾写过的URL仍恢复，放弃与卸载后的旧结果不能复活', async () => {
    const a = encodeStartSearch(choose1v1(resetStart()));
    const view = await mount({ search: a });
    await act(async () => view.result.onChange(skipStep));
    const b = view.live;
    expect(b).not.toBe(a);
    await act(async () => view.navigate(a));
    expect(view.result.state).toEqual(choose1v1(resetStart()));
    view.unmount();
    for (const fail of [false, true]) {
      const wait = deferred();
      const pending = await mount({ search: encodeStartSearch(team()), maps: () => wait.promise });
      await act(async () => {
        pending.result.abandon();
        if (fail) wait.reject(new Error('late'));
        else wait.resolve([{ id: 'arabia' }]);
      });
      expect(pending.result.state).toEqual(resetStart());
      expect(pending.live).toBe(encodeStartSearch(resetStart()));
      pending.unmount();
    }
    const wait = deferred();
    const gone = await mount({ search: encodeStartSearch(team()), maps: () => wait.promise });
    gone.unmount();
    await act(async () => wait.resolve([{ id: 'arabia' }]));
    expect(gone.writes).toEqual([]);
  });
});
