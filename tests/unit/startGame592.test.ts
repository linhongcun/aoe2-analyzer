import { createElement, StrictMode, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';
import StartCivPicker from '../../src/features/home/components/StartCivPicker';
import type { CivPickerProps } from '../../src/shared/ui/CivPicker';
import { mapPosTips } from '../../src/domain/mapPositions';
import {
  armTeam,
  backStep,
  choose1v1,
  chooseLane,
  chooseMap,
  chooseTeamSize,
  civPanels,
  decisionSteps,
  editStep,
  editorialReason,
  enterLobby,
  finishFlow,
  jumpTo,
  laneRowVisible,
  openLane,
  pickCiv,
  resetStart,
  skipStep,
} from '../../src/domain/startGame';
import Home from '../../src/features/home/components/Home';
import { DEFAULT_SCENE, DEFAULT_ROUTE } from '../../src/domain/startGameInputs';
import { OpponentStep, Summary } from '../../src/features/home/components/startGameLater';
import { decodeStartGame, encodeStartGame, START_GAME_KEY, type StartStorage } from '../../src/features/home/startGamePersistence';
import { useStartGamePersistence } from '../../src/features/home/useStartGamePersistence';

const home = () => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(Home)));
const frank = '骑兵从封建时代起生命更高，磨坊科技免费，中路适合发育后出骑士。';

describe('#672 首页文明选项异步边界', () => {
  it('真实入口图另有断言；延迟加载接收最新值，失败重试不修改本局', async () => {
    const onChange = vi.fn();
    let resolve!: (module: { CivPicker: typeof Picker }) => void;
    let reject!: (error: Error) => void;
    const Picker = (props: CivPickerProps) => createElement('button', { id: props.id, onClick: () => props.onChange('Japanese') }, props.value);
    const load = vi.fn(
      () =>
        new Promise<{ CivPicker: typeof Picker }>((yes, no) => {
          resolve = yes;
          reject = no;
        }),
    );
    let view!: ReactTestRenderer;
    const props = { id: 'start-opponent', label: '对手', value: 'Franks', onChange, load };
    await act(async () => {
      view = create(createElement(StartCivPicker, props));
    });
    expect(view.root.findByProps({ role: 'status' }).children.join('')).toContain('加载');
    await act(async () => {
      reject(new Error('network'));
    });
    expect(view.root.findByProps({ role: 'alert' }).children.join('')).toContain('已填信息保留');
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => {
      view.root.findByType('button').props.onClick();
    });
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => {
      view.update(createElement(StartCivPicker, { ...props, value: 'Mongols' }));
      resolve({ CivPicker: Picker });
    });
    expect(view.root.findByType('button').props.id).toBe(props.id);
    expect(view.root.findByType('button').children).toEqual(['Mongols']);
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => {
      view.root.findByType('button').props.onClick();
    });
    expect(onChange).toHaveBeenCalledWith('Japanese');
    await act(async () => {
      view.unmount();
    });
  });
  it.each(['resolve', 'reject'])('离开后忽略旧模块%s', async (outcome) => {
    let resolve!: (module: { CivPicker: typeof Picker }) => void;
    let reject!: (error: Error) => void;
    const Picker = () => createElement('button');
    const onChange = vi.fn();
    const load = () =>
      new Promise<{ CivPicker: typeof Picker }>((yes, no) => {
        resolve = yes;
        reject = no;
      });
    let view!: ReactTestRenderer;
    await act(async () => {
      view = create(createElement(StartCivPicker, { id: 'late', value: '', label: '对手', onChange, load }));
    });
    await act(async () => {
      view.unmount();
      if (outcome === 'resolve') resolve({ CivPicker: Picker });
      else reject(new Error('late'));
    });
    expect(view.toJSON()).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('开一局步骤 #592', () => {
  it('还没选模式时没有路位，1v1 走完也不插入', () => {
    const start = resetStart();
    expect(decisionSteps(start)).toEqual(['mode', 'map', 'civ', 'opponent']);
    const picked = chooseMap(choose1v1(start), 'arabia');
    expect(decisionSteps(picked)).toEqual(['mode', 'map', 'civ', 'opponent']);
    expect(laneRowVisible(finishFlow(skipStep(skipStep(picked))))).toBe(false);
    expect(civPanels(picked).kind).toBe('empty');
  });

  it('组队选了人数之后，路位才出现在地图和文明之间', () => {
    const armed = armTeam(resetStart());
    expect(armed.current).toBe('mode');
    expect(armed.choice.mode).toBeNull();
    expect(decisionSteps(armed)).not.toContain('lane');
    const team = chooseTeamSize(armed, '4v4');
    expect(team.current).toBe('map');
    expect(decisionSteps(team)).toEqual(['mode', 'map', 'lane', 'civ', 'opponent']);
    const lane = chooseMap(team, 'arabia');
    expect(lane.current).toBe('lane');
    expect(civPanels(chooseLane(lane, 'pocket'))).toEqual({
      kind: 'side',
      side: 'pocket',
      tips: mapPosTips('arabia', 'pocket'),
    });
  });

  it('改成 1v1 会丢掉路位，并清掉后面的选择', () => {
    const lane = chooseLane(chooseMap(chooseTeamSize(resetStart(), '2v2'), 'arena'), 'flank');
    const back = jumpTo(lane, 'mode');
    const solo = choose1v1(back);
    expect(solo.choice).toMatchObject({ mode: '1v1', teamSize: null, mapId: null, lane: null, civ: null });
    expect(decisionSteps(solo)).not.toContain('lane');
    expect(laneRowVisible(solo)).toBe(false);
  });

  it('跳过不写入默认值；上一步保留已经点过的值', () => {
    const skipped = skipStep(resetStart());
    expect(skipped.current).toBe('map');
    expect(skipped.choice.mode).toBeNull();
    expect(skipped.skipped.mode).toBe(true);
    expect(civPanels(skipped).kind).toBe('empty');
    const mapped = chooseMap(choose1v1(resetStart()), 'black-forest');
    const returned = backStep(mapped);
    expect(returned.current).toBe('map');
    expect(returned.choice.mapId).toBe('black-forest');
    expect(backStep(resetStart())).toEqual(resetStart());
  });

  it('还没到的步骤不能点；点已完成的名字会回去', () => {
    const team = chooseTeamSize(resetStart(), '3v3');
    expect(jumpTo(team, 'civ')).toBe(team);
    const back = jumpTo(team, 'mode');
    expect(back.current).toBe('mode');
    expect(back.choice.teamSize).toBe('3v3');
  });

  it('同一人数再点一次不会清掉已经选的地图', () => {
    const mapped = chooseMap(chooseTeamSize(resetStart(), '4v4'), 'arabia');
    const again = chooseTeamSize(jumpTo(mapped, 'mode'), '4v4');
    expect(again.choice.mapId).toBe('arabia');
    expect(again.current).toBe('map');
  });

  it('换人数会清掉地图和路位', () => {
    const lane = chooseLane(chooseMap(chooseTeamSize(resetStart(), '4v4'), 'arabia'), 'pocket');
    const resized = chooseTeamSize(jumpTo(lane, 'mode'), '2v2');
    expect(resized.choice).toMatchObject({ teamSize: '2v2', mapId: null, lane: null });
  });

  it('已在大厅先跳过模式和地图，自己补选组队与地图后按侧推荐', () => {
    const lobby = enterLobby();
    expect(lobby.current).toBe('civ');
    expect(lobby.prefilled).toEqual({});
    expect(lobby.skipped).toEqual({ mode: true, map: true });
    expect(lobby.choice).toMatchObject({ mode: null, teamSize: null, mapId: null, lane: null });
    expect(decisionSteps(lobby)).toEqual(['mode', 'map', 'civ', 'opponent']);
    expect(laneRowVisible(lobby)).toBe(false);
    const configured = chooseMap(chooseTeamSize(jumpTo(lobby, 'mode'), '4v4'), 'arabia');
    expect(configured.current).toBe('lane');
    const panel = civPanels(chooseLane(configured, 'pocket'));
    expect(panel.kind).toBe('side');
    if (panel.kind !== 'side') return;
    expect(panel.side).toBe('pocket');
    expect(panel.tips[0]).toEqual({ civ: 'Franks', reason: frank });
    const flank = civPanels(chooseLane(configured, 'flank'));
    expect(flank.kind === 'side' && flank.tips[0]?.civ).toBe('Britons');
    const picked = pickCiv(chooseLane(configured, 'pocket'), 'Franks');
    expect(picked.choice).toMatchObject({ lane: 'pocket', civ: 'Franks' });
    expect(picked.current).toBe('opponent');
    expect(laneRowVisible(picked)).toBe(true);
    expect(editorialReason(picked)).toBe(frank);
    const opened = openLane(configured);
    expect(opened.current).toBe('lane');
    expect(decisionSteps(opened)).toContain('lane');
  });

  it('跳过路位后摘要仍有这一行，值是空的', () => {
    const skipped = skipStep(chooseMap(chooseTeamSize(resetStart(), '4v4'), 'arabia'));
    expect(skipped.current).toBe('civ');
    expect(skipped.choice.lane).toBeNull();
    expect(skipped.skipped.lane).toBe(true);
    expect(civPanels(skipped).kind).toBe('empty');
    const done = finishFlow(skipStep(skipStep(skipped)));
    expect(done.current).toBeNull();
    expect(laneRowVisible(done)).toBe(true);
    expect(done.choice.civ).toBeNull();
  });

  it('对手没有选择；完成本局进入摘要', () => {
    const done = finishFlow(pickCiv(chooseLane(chooseMap(chooseTeamSize(resetStart(), '4v4'), 'arabia'), 'pocket'), 'Franks'));
    expect(done.current).toBeNull();
    expect(done.choice.civ).toBe('Franks');
    expect(done.skipped.opponent).toBe(false);
    const edited = editStep(done, 'lane');
    expect(edited.current).toBe('lane');
    expect(edited.choice.civ).toBe('Franks');
  });

  it('首页只在目录放一条开一局，不嵌向导', () => {
    const html = home();
    expect(html).toContain('查阅文明、单位与科技，并使用计算工具。');
    expect(html).toContain('>开一局<');
    expect(html).not.toContain('data-testid="home-configure"');
    expect(html).not.toContain('>已在大厅<');
    expect(html).toContain('搜索文明、单位、科技、开局…');
    expect(html).toContain('工具与资料');
    expect(html).not.toContain('data-testid="start-steps"');
    expect(html).not.toContain('规划中');
    expect(html).not.toContain('设计选例');
    expect(html.match(/href="\/start"/g)).toEqual(['href="/start"']);
    expect(html.indexOf('id="site-title"')).toBeLessThan(html.indexOf('id="home-catalog-title"'));
  });
});

const MAP_IDS = new Set(['arabia', 'arena', 'black-forest']);
const configured674 = () => chooseLane(chooseMap(chooseTeamSize(jumpTo(enterLobby(), 'mode'), '4v4'), 'arabia'), 'pocket');

describe('本局严格存档 #674', () => {
  it('合法UI事件序列保留全部选择、false标记、current与大厅语义', () => {
    const configured = configured674();
    const summary = finishFlow(pickCiv(configured, 'Franks'));
    const skipped = skipStep(chooseMap(chooseTeamSize(resetStart(), '4v4'), 'arabia'));
    const states = [
      resetStart(),
      armTeam(resetStart()),
      enterLobby(),
      pickCiv(enterLobby(), 'Franks'),
      choose1v1(resetStart()),
      chooseMap(choose1v1(resetStart()), 'black-forest'),
      configured,
      summary,
      { ...summary, skipped: { ...summary.skipped, opponent: false } },
      { ...summary, skipped: { ...summary.skipped, opponent: undefined } },
      skipStep(pickCiv(configured, 'Franks')),
      skipStep(skipStep(skipStep(skipStep(resetStart())))),
      backStep(skipped),
      jumpTo(summary, 'map'),
      editStep(skipStep(pickCiv(configured, 'Franks')), 'opponent'),
      chooseTeamSize(jumpTo(configured, 'mode'), '4v4'),
      choose1v1(jumpTo(openLane(configured), 'mode')),
      armTeam(jumpTo(chooseMap(choose1v1(jumpTo(configured, 'mode')), 'arabia'), 'mode')),
    ];
    for (const state of states) {
      const normalized = JSON.parse(JSON.stringify(state));
      expect(decodeStartGame(encodeStartGame(state), MAP_IDS), JSON.stringify(state)).toEqual({ kind: 'valid', state: normalized });
    }
  });

  it('有地图时仅待完整目录，未知ID拒绝；无地图不必等待', () => {
    const state = configured674();
    expect(decodeStartGame(encodeStartGame(state)).kind).toBe('needs-maps');
    expect(decodeStartGame(encodeStartGame(state), new Set(['arena'])).kind).toBe('invalid');
    expect(decodeStartGame(encodeStartGame(resetStart())).kind).toBe('valid');
  });

  it('拒绝字段、版本、类型、组合、前置步骤、未知ID和超长输入，不发明默认值', () => {
    const base = () => JSON.parse(encodeStartGame(resetStart()));
    const invalidFields: [string[], unknown][] = [
      [['version'], '1'],
      [['version'], 2],
      [['extra'], true],
      [['state', 'extra'], true],
      [['state', 'choice', 'extra'], true],
      [['state', 'skipped'], []],
      [['state', 'prefilled'], null],
      [['state', 'skipped', 'mode'], 'false'],
      [['state', 'skipped', 'extra'], false],
      [['state', 'prefilled', 'civ'], false],
      [['state', 'teamArmed'], 1],
      [['state', 'lobby'], 'true'],
      [['state', 'laneOpen'], null],
      [['state', 'choice', 'mode'], '4v4'],
      [['state', 'choice', 'teamSize'], '5v5'],
      [['state', 'choice', 'lane'], 'left'],
      [['state', 'current'], 'lane'],
      [['state', 'choice', 'civ'], 'unknown'],
      [['state', 'choice', 'mapId'], 'unknown'],
      [['state', 'choice', 'mode'], 'team'],
      [['state', 'choice', 'teamSize'], '4v4'],
      [['state', 'choice', 'lane'], 'pocket'],
      [['state', 'prefilled', 'mode'], true],
      [['state', 'current'], 'map'],
      [['state', 'current'], null],
    ];
    const patch = (path: string[], value: unknown, remove = false) => {
      const input = base();
      let target = input as Record<string, unknown>;
      for (const key of path.slice(0, -1)) target = target[key] as Record<string, unknown>;
      if (remove) delete target[path.at(-1)!];
      else target[path.at(-1)!] = value;
      return input;
    };
    const invalid = invalidFields.map(([path, value]) => patch(path, value));
    for (const key of ['choice', 'skipped', 'prefilled', 'teamArmed', 'lobby', 'laneOpen', 'current']) invalid.push(patch(['state', key], null, true));
    for (const key of ['mode', 'teamSize', 'mapId', 'lane', 'civ']) invalid.push(patch(['state', 'choice', key], null, true));
    invalid.push(patch(['state'], null, true));
    const armedSolo = base();
    armedSolo.state.choice.mode = '1v1';
    armedSolo.state.teamArmed = true;
    invalid.push(armedSolo);
    const skippedSolo = base();
    skippedSolo.state.choice.mode = '1v1';
    skippedSolo.state.skipped.mode = true;
    invalid.push(skippedSolo);
    for (const value of invalid) {
      expect(decodeStartGame(JSON.stringify(value), MAP_IDS), JSON.stringify(value)).toEqual({ kind: 'invalid' });
    }
    for (const raw of ['null', '[]', '{', '{}', ' '.repeat(4097), JSON.stringify({ text: '中'.repeat(1500) })]) {
      expect(decodeStartGame(raw, MAP_IDS)).toEqual({ kind: 'invalid' });
    }
    const skippedCurrent = jumpTo(enterLobby(), 'map');
    expect(skippedCurrent.skipped.map).toBe(true);
    expect(decodeStartGame(encodeStartGame(skippedCurrent), MAP_IDS).kind).toBe('valid');
    expect(decodeStartGame(encodeStartGame(chooseMap(resetStart(), 'arabia')), MAP_IDS).kind).toBe('invalid');
  });
});

function deferred674() {
  let resolve!: (maps: { id: string }[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ id: string }[]>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function mount674(raw: string | null, maps: () => Promise<readonly { id: string }[]>, storageOverride?: () => StartStorage | undefined) {
  const writes: string[] = [];
  let stored = raw;
  const storage =
    storageOverride ??
    (() => ({
      getItem: (key: string) => {
        expect(key).toBe(START_GAME_KEY);
        return stored;
      },
      setItem: (key: string, value: string) => {
        expect(key).toBe(START_GAME_KEY);
        stored = value;
        writes.push(value);
      },
    }));
  let live = '';
  let updateSearch: (search: string) => void;
  const bridge = {
    isCurrent: (expected: string) => live === expected,
    replace: (next: string, expected: string) => {
      if (live !== expected) return false;
      live = next;
      updateSearch(next);
      return true;
    },
  };
  let result!: ReturnType<typeof useStartGamePersistence>;
  function Probe() {
    const [search, setSearch] = useState('');
    updateSearch = setSearch;
    result = useStartGamePersistence({ storage, maps, search, bridge });
    return null;
  }
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(StrictMode, null, createElement(Probe)));
  });
  return {
    get result() {
      return result;
    },
    writes,
    get stored() {
      return stored;
    },
    unmount: () => act(() => renderer.unmount()),
  };
}

describe('本局实际恢复hook #674', () => {
  it('等待地图时无写入，验证成功恢复完整状态；正常操作后才保存', async () => {
    const wait = deferred674();
    const state = configured674();
    state.choice.opponent = 'Japanese';
    state.choice.mates = ['Persians', 'Persians'];
    const view = await mount674(encodeStartGame(state), () => wait.promise);
    expect(view.result.status).toBe('pending');
    expect(view.writes).toEqual([]);
    await act(async () => view.result.onChange(() => resetStart()));
    expect(view.result.status).toBe('pending');
    await act(async () => wait.resolve([{ id: 'arabia' }]));
    expect(view.result.state).toEqual(state);
    expect(view.writes).toEqual([]);
    await act(async () => view.result.onChange((current) => pickCiv(current, 'Franks')));
    expect(JSON.parse(view.stored!).state.choice.civ).toBe('Franks');
    view.unmount();
  });

  it('失败保留原存档、可重试；未知ID安全空态且不写回，玩家操作后才替换', async () => {
    const first = deferred674();
    const second = deferred674();
    let calls = 0;
    const raw = encodeStartGame(configured674());
    const view = await mount674(raw, () => (++calls === 1 ? first.promise : second.promise));
    await act(async () => first.reject(new Error('offline')));
    expect(view.result.status).toBe('failed');
    expect(view.stored).toBe(raw);
    expect(view.writes).toEqual([]);
    await act(async () => view.result.retry());
    await act(async () => second.resolve([{ id: 'arena' }]));
    expect(view.result.status).toBe('ready');
    expect(view.result.state).toEqual(resetStart());
    expect(view.result.notice).toContain('无法恢复');
    expect(view.stored).toBe(raw);
    expect(view.writes).toEqual([]);
    await act(async () => view.result.onChange(choose1v1));
    expect(JSON.parse(view.stored!).state.choice.mode).toBe('1v1');
    view.unmount();
  });

  it('同批次放弃与成功/失败迟到均不能复活旧局；卸载不写入', async () => {
    for (const fail of [false, true]) {
      const wait = deferred674();
      const view = await mount674(encodeStartGame(configured674()), () => wait.promise);
      await act(async () => {
        view.result.abandon();
        if (fail) wait.reject(new Error('late'));
        else wait.resolve([{ id: 'arabia' }]);
        await Promise.resolve();
      });
      expect(view.result.status).toBe('ready');
      expect(view.result.state).toEqual(resetStart());
      expect(JSON.parse(view.stored!).state).toEqual(resetStart());
      view.unmount();
    }
    const wait = deferred674();
    const view = await mount674(encodeStartGame(configured674()), () => wait.promise);
    view.unmount();
    await act(async () => wait.resolve([{ id: 'arabia' }]));
    expect(view.writes).toEqual([]);
  });

  it('无效原记录不自动覆盖；storage getter/get/set失败与无storage仍可操作', async () => {
    const invalid = await mount674('{bad', async () => []);
    expect(invalid.result.state).toEqual(resetStart());
    expect(invalid.result.notice).toContain('无法恢复');
    expect(invalid.writes).toEqual([]);
    invalid.unmount();
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
      () => ({
        getItem: () => null,
        setItem: () => {
          throw new Error('write');
        },
      }),
      () => undefined,
    ]) {
      const view = await mount674(null, async () => [], storage);
      await act(async () => view.result.onChange(choose1v1));
      expect(view.result.state.choice.mode).toBe('1v1');
      view.unmount();
    }
  });
});

describe('首页工具上下文与对手状态 #671', () => {
  const render = (state: ReturnType<typeof resetStart>, summary = false) =>
    renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(summary ? Summary : OpponentStep, { state, onChange: () => {} })));
  it('带真实己方且缺方保持空白，开局仅带文明上下文', () => {
    const state = pickCiv(chooseMap(choose1v1(resetStart()), 'arabia'), 'Mongols');
    for (const summary of [false, true]) {
      const html = render(state, summary);
      expect(html).toContain('href="/matchup?pair=explicit&amp;me=Mongols"');
      expect(html).toContain('未选一方保持空白');
      expect(html).not.toContain('opp=');
    }
    const html = render(finishFlow(state), true);
    expect(html).toContain('href="/builds?civ=Mongols"');
    expect(html).toContain('列表仍为全部开局');
    expect(html).toContain('未选择');
    expect(html).not.toContain('已跳过');
  });
  it('空局不伪造文明；只有真实跳过显示已跳过且历史标记保留', () => {
    const state = skipStep(skipStep(chooseMap(choose1v1(resetStart()), 'arena')));
    const html = render(state, true);
    expect(html).toContain('href="/matchup?pair=explicit"');
    expect(html).toContain('href="/builds"');
    expect(html).toContain('未带入本局文明');
    expect(html).toContain('已跳过');
    expect(html).not.toContain('暂无数据');
    expect(render(finishFlow(editStep(state, 'opponent')), true)).toContain('已跳过');
  });
});

describe('本局两份输入归属 #667', () => {
  const chosen = () => ({
    ...pickCiv(chooseLane(chooseMap(chooseTeamSize(resetStart(), '4v4'), 'arabia'), 'pocket'), 'Huns'),
    sceneConfig: { ...DEFAULT_SCENE, distance: 10, deadline: 1200 },
    routeConfig: { ...DEFAULT_ROUTE, distance: 60, deadline: 60 },
  });
  it('同值/返回/文明/完成/打开路位保留独立输入', () => {
    const state = chosen();
    for (const next of [
      chooseTeamSize(state, '4v4'),
      chooseMap(state, 'arabia'),
      chooseLane(state, 'pocket'),
      pickCiv(state, 'Franks'),
      pickCiv(state, 'Huns', 'pocket'),
      backStep(state),
      jumpTo(state, 'map'),
      editStep(state, 'lane'),
      openLane(state),
      armTeam(state),
      finishFlow(state),
      skipStep(state),
      skipStep({ ...state, current: 'civ' }),
    ]) {
      expect(next.sceneConfig).toEqual(state.sceneConfig);
      expect(next.routeConfig).toEqual(state.routeConfig);
    }
    expect(skipStep({ ...state, current: 'civ' }).choice.civ).toBeNull();
  });
  it('每个真实条件变化/条件skip都清两份，保留文明；reset/lobby清空', () => {
    const state = chosen();
    for (const next of [
      choose1v1(state),
      chooseTeamSize(state, '3v3'),
      chooseMap(state, 'arena'),
      chooseLane(state, 'flank'),
      pickCiv(state, 'Huns', 'flank'),
      ...(['mode', 'map', 'lane'] as const).map((current) => skipStep({ ...state, current })),
    ]) {
      expect(next.sceneConfig).toBeNull();
      expect(next.routeConfig).toBeNull();
      expect(next.choice.civ).toBe('Huns');
    }
    for (const next of [resetStart(), enterLobby(), armTeam({ ...state, choice: { ...state.choice, mode: '1v1', teamSize: null, lane: null } })]) {
      expect(next.sceneConfig).toBeNull();
      expect(next.routeConfig).toBeNull();
    }
  });
  it('同值solo与大厅同地图开放路位不会额外清输入', () => {
    const state = chosen();
    const solo = { ...state, choice: { ...state.choice, mode: '1v1' as const, teamSize: null, lane: null } };
    expect(choose1v1(solo).sceneConfig).toEqual(state.sceneConfig);
    const lobby = { ...state, lobby: true, laneOpen: false };
    expect(chooseMap(lobby, 'arabia')).toMatchObject({ sceneConfig: state.sceneConfig, routeConfig: state.routeConfig, laneOpen: true });
  });
});
