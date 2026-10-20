import { describe, expect, it } from 'vitest';
import {
  GAME_GUIDE_CARDS,
  GAME_GUIDE_CARD_IDS,
  GAME_GUIDE_CATALOG,
  GAME_GUIDE_CONTEXTS,
  GAME_GUIDE_URL_LIMIT,
  GAME_GUIDE_VICTORIES,
  decodeGameGuideState,
  defaultGameGuideState,
  encodeGameGuideState,
  gameGuideCatalogErrors,
  gameGuideScope,
  gameGuideShareUrl,
  type GameGuideState,
} from '../../src/domain/gameGuide';

describe('#256 入门状态与适用范围', () => {
  it('裸入口有明确征服/通用示例默认，不推断其他模式', () => {
    expect(decodeGameGuideState('')).toEqual({ state: { card: 'goal', context: 'standard', victory: 'conquest' }, errors: [], raw: '' });
    expect(decodeGameGuideState('?').errors).toEqual([]);
    expect(gameGuideScope(defaultGameGuideState())).toEqual({ supported: true, reasons: [] });
  });
  it('六卡及全部合法范围可以完整往返，范围外选择不被替换', () => {
    for (const card of GAME_GUIDE_CARD_IDS)
      for (const context of Object.keys(GAME_GUIDE_CONTEXTS))
        for (const victory of Object.keys(GAME_GUIDE_VICTORIES)) {
          const state = { card, context, victory } as GameGuideState;
          const decoded = decodeGameGuideState('?' + encodeGameGuideState(state));
          expect(decoded.errors).toEqual([]);
          expect(decoded.state).toEqual(state);
          expect(gameGuideScope(decoded.state).supported).toBe(context === 'standard' && victory === 'conquest');
        }
  });
  it('特殊开局和未知胜利同时保留两个未覆盖理由', () => {
    const state: GameGuideState = { card: 'roles', context: 'special-civ', victory: 'unknown' };
    const scope = gameGuideScope(state);
    expect(scope.supported).toBe(false);
    expect(scope.reasons).toHaveLength(2);
    expect(scope.reasons[0]).toContain('起始配置');
    expect(scope.reasons[1]).toContain('胜利设置未知');
  });
  it.each([
    'card=roles',
    'v=1&card=goal&context=standard',
    'v=2&card=goal&context=standard&victory=conquest',
    'v=1&card=future&context=standard&victory=conquest',
    'v=1&card=goal&context=future&victory=conquest',
    'v=1&card=goal&context=standard&victory=future',
    'v=1&card=goal&context=standard&victory=conquest&other=1',
    'v=1&card=goal&card=roles&context=standard&victory=conquest',
    'v=1&%76=1&card=goal&context=standard&victory=conquest',
    'v=1&card=%FF&context=standard&victory=conquest',
    'v=1&card=%E0%A4%A&context=standard&victory=conquest',
    'v=1&card=%&context=standard&victory=conquest',
    'v=1&card=goal&context=standard&victory=conquest&',
    'v=1&card=goal&context=standard&victory=conquest&x',
    'v=1&card=goal&context=standard&victory=',
    'v=1&card=goal&context=standard&victory=conquest&=bad',
    'v=1&card=goal&context=standard&victory=conquest&toString=x',
    'v=1&card=goal&context=__proto__&victory=conquest',
    'v=1&card=goal&context=standard&victory=constructor',
  ])('无效链接暂停恢复并保留原文：%s', (raw) => {
    const result = decodeGameGuideState('?' + raw);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.raw).toBe('?' + raw);
  });
  it('超长链接被拒绝，不截断成有效默认卡', () => {
    const raw = '?v=1&card=' + 'a'.repeat(GAME_GUIDE_URL_LIMIT);
    expect(decodeGameGuideState(raw).errors.join()).toContain('过长');
    expect(decodeGameGuideState(raw).raw).toBe(raw);
  });
  it('非 ASCII 编码虽可解码，未知枚举仍不能变为标准配置', () => {
    const result = decodeGameGuideState('?v=1&card=roles&context=%E6%B8%B8%E7%89%A7&victory=unknown');
    expect(result.errors).toContain('开局或模式未识别。');
    expect(result.state.context).toBe('游牧');
  });
});

describe('#256 完整分享链接', () => {
  it.each([
    'https://example.org/aoe2-analyzer/',
    'https://example.org/aoe2-analyzer/index.html?tracking=1#/other',
    'https://example.org/aoe2-analyzer/game-guide/',
    'https://example.org/aoe2-analyzer/game-guide/index.html?tracking=1',
  ])('保留项目路径且清除外层跟踪与旧片段：%s', (base) => {
    const state: GameGuideState = { card: 'watching', context: 'nomad', victory: 'other' };
    const url = new URL(gameGuideShareUrl(state, base));
    expect(url.pathname).toBe('/aoe2-analyzer/game-guide/');
    expect(url.hash).toBe('');
    expect(decodeGameGuideState(url.search).state).toEqual(state);
    expect(url.searchParams.has('tracking')).toBe(false);
  });
  it('非法状态或超长基地址不能生成看似成功的链接', () => {
    expect(() => encodeGameGuideState({ ...defaultGameGuideState(), card: 'missing' } as unknown as GameGuideState)).toThrow();
    expect(() => gameGuideShareUrl(defaultGameGuideState(), 'https://example.org/' + 'a'.repeat(GAME_GUIDE_URL_LIMIT) + '/')).toThrow('分享地址过长');
  });
});

describe('#256 六卡与来源完整性', () => {
  it('固定六卡、例子、自查与逐卡可追溯来源完整', () => {
    expect(gameGuideCatalogErrors()).toEqual([]);
    expect(GAME_GUIDE_CARDS.map((card) => card.id)).toEqual(['goal', 'roles', 'resources', 'ages', 'counters', 'watching']);
    for (const card of GAME_GUIDE_CARDS) {
      expect(card.question.endsWith('？')).toBe(true);
      expect(card.answer.length).toBeGreaterThan(10);
      expect(card.boundary.length).toBeGreaterThan(10);
      expect(card.sourceIds.every((id) => GAME_GUIDE_CATALOG.sources[id]?.checkedAt === '2026-10-20')).toBe(true);
    }
  });
  it('缺卡、重复卡或丢失自查会阻断展示', () => {
    const missing = structuredClone(GAME_GUIDE_CATALOG);
    missing.cards.pop();
    expect(gameGuideCatalogErrors(missing).join()).toContain('六卡');
    const duplicate = structuredClone(GAME_GUIDE_CATALOG);
    duplicate.cards[1]!.id = 'goal';
    expect(gameGuideCatalogErrors(duplicate).join()).toContain('六卡');
    const noAnswer = structuredClone(GAME_GUIDE_CATALOG);
    noAnswer.cards[0]!.answer = '';
    expect(gameGuideCatalogErrors(noAnswer).join()).toContain('自查');
  });
  it('缺失/重复引用、不安全来源或坏链接可被发现', () => {
    const bad = structuredClone(GAME_GUIDE_CATALOG);
    bad.cards[0]!.sourceIds = ['missing', 'missing'];
    bad.cards[1]!.links[0]!.to = 'javascript:alert(1)';
    bad.sources['official-start']!.url = 'http://example.org/';
    const errors = gameGuideCatalogErrors(bad).join();
    expect(errors).toContain('重复');
    expect(errors).toContain('未收录');
    expect(errors).toContain('链接无效');
    expect(errors).toContain('来源信息');
  });
  it('来源的未知发布日期保留 null，不用版权年份填补', () => {
    expect(GAME_GUIDE_CATALOG.sources['official-start']!.publishedAt).toBeNull();
    const bad = structuredClone(GAME_GUIDE_CATALOG);
    bad.sources['official-start']!.publishedAt = '2026';
    expect(gameGuideCatalogErrors(bad).join()).toContain('发布日期');
  });
});
