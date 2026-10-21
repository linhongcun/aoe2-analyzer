// issue 312：切换情境时「我的当前阶段」跟随情境；分享链接里显式的 stage 原样保留。
import { describe, expect, it } from 'vitest';
import { analyseScouting, decodeScouting, defaultScoutingConfig, encodeScouting, withScenario } from '../../src/domain/scouting';

describe('issue 312 withScenario：阶段跟随情境', () => {
  it('默认（早期 · 封建时代）切到城堡阶段后为城堡时代，其他选项不变，直接覆盖到 3 条信号', () => {
    const base = defaultScoutingConfig();
    const next = withScenario(base, 'walled');
    expect(next).toEqual({ ...base, scenario: 'walled', stage: 'castle' });
    const analysis = analyseScouting(next);
    expect(analysis.status).toBe('covered');
  });
  it('切回早期后为封建时代', () => {
    const back = withScenario(withScenario(defaultScoutingConfig(), 'walled'), 'early');
    expect(back.stage).toBe('feudal');
    expect(analyseScouting(back).status).toBe('covered');
  });
  it('手动选过的其他阶段（帝王 / 未知）在切换情境时同样同步为该情境的阶段', () => {
    for (const stage of ['dark', 'imperial', 'unknown'] as const) {
      expect(withScenario({ ...defaultScoutingConfig(), stage }, 'walled').stage).toBe('castle');
      expect(withScenario({ ...defaultScoutingConfig(), scenario: 'walled', stage }, 'early').stage).toBe('feudal');
    }
  });
  it('不改入参', () => {
    const base = defaultScoutingConfig();
    withScenario(base, 'walled');
    expect(base.stage).toBe('feudal');
  });
  it('分享链接含显式 stage（城堡阶段情境 + 封建时代）：解码后保持封建时代', () => {
    const search = '?' + encodeScouting({ ...defaultScoutingConfig(), scenario: 'walled', stage: 'feudal' });
    const decoded = decodeScouting(search);
    expect(decoded.config.scenario).toBe('walled');
    expect(decoded.config.stage).toBe('feudal');
  });
});
