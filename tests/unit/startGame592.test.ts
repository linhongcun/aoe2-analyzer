import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
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

const home = () => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(Home)));
const frank = '骑兵从封建时代起生命更高，磨坊科技免费，中路适合发育后出骑士。';

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

  it('已在大厅从文明起，预填组队 4v4 和阿拉伯半岛，路位先不占格', () => {
    const lobby = enterLobby();
    expect(lobby.current).toBe('civ');
    expect(lobby.prefilled).toEqual({ mode: true, map: true });
    expect(lobby.choice).toMatchObject({ mode: 'team', teamSize: '4v4', mapId: 'arabia', lane: null });
    expect(decisionSteps(lobby)).toEqual(['mode', 'map', 'civ', 'opponent']);
    expect(laneRowVisible(lobby)).toBe(false);
    const panel = civPanels(lobby);
    expect(panel.kind).toBe('split');
    if (panel.kind !== 'split') return;
    expect(panel.groups.map((group) => group.side)).toEqual(['pocket', 'flank']);
    expect(panel.groups[0]?.tips[0]).toEqual({ civ: 'Franks', reason: frank });
    expect(panel.groups[1]?.tips[0]?.civ).toBe('Britons');
    const picked = pickCiv(lobby, 'Franks', 'pocket');
    expect(picked.choice).toMatchObject({ lane: 'pocket', civ: 'Franks' });
    expect(picked.current).toBe('opponent');
    expect(laneRowVisible(picked)).toBe(true);
    expect(editorialReason(picked)).toBe(frank);
    const opened = openLane(lobby);
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

  it('首页第一屏是开一局，工具入口还在，先练文明不是链接', () => {
    const html = home();
    expect(html).toContain('>开一局<');
    expect(html).toContain('data-testid="start-game"');
    expect(html).toContain('data-testid="start-steps"');
    expect(html).toContain('data-step="mode"');
    expect(html).not.toContain('data-step="lane"');
    expect(html).toContain('data-testid="start-back"');
    expect(html).toContain('data-testid="start-skip"');
    expect(html).toContain('data-testid="start-lobby"');
    expect(html).toContain('data-testid="start-practice"');
    expect(html).toContain('data-testid="start-more-tools"');
    expect(html).toContain('先练某个文明 · 首刀不做');
    expect(html).toContain('搜索文明、单位、科技、开局…');
    expect(html).toContain('更多工具');
    expect(html).not.toMatch(/<a[^>]*data-testid="start-practice"/);
    expect(html).not.toMatch(/<button[^>]*data-testid="start-practice"/);
    expect(html.indexOf('data-testid="start-game"')).toBeLessThan(html.indexOf('class="hgrid"'));
    const flowHtml = html.slice(html.indexOf('data-testid="start-game"'), html.indexOf('data-testid="start-more-tools"'));
    expect(flowHtml).not.toMatch(/胜率\s*\d|\d+(?:\.\d+)?\s*%|热门|常打|出场率/);
  });
});
