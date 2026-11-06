import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { GAME_GUIDE_CARDS } from '../../src/domain/gameGuide';
import SuddenDessaster3 from '../../src/features/maps/SuddenDessaster3';
import VictoryModesCard, {
  AOE_BUDDY_SD3_SOURCE,
  OFFICIAL_MULTIPLAYER_SOURCE,
  SD3_HANDBOOK_SOURCE,
  VICTORY_MODE_COPY,
  victoryModeVisibleText,
} from '../../src/features/gameGuide/victoryModes';

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('#729 胜利条件短卡只写已核对的句子', () => {
  it('征服段与现有本局目标卡的第一段相同', () => {
    const goal = GAME_GUIDE_CARDS.find((card) => card.id === 'goal');
    expect(goal?.paragraphs[0]).toBe(VICTORY_MODE_COPY.conquest);
    expect(VICTORY_MODE_COPY.lead).toContain('不能用征服示例代替');
  });

  it('猝死写出不能再建城镇中心，以及主城被毁即负', () => {
    expect(VICTORY_MODE_COPY.suddenDeath).toContain('不能再建城镇中心');
    expect(VICTORY_MODE_COPY.suddenDeath).toContain('主城（home Town Center）被毁就会输掉');
    expect(OFFICIAL_MULTIPLAYER_SOURCE.updatedAt).toBe('2026-01-16');
    expect(OFFICIAL_MULTIPLAYER_SOURCE.url).toBe(
      'https://support.ageofempires.com/hc/en-us/articles/360047306372-How-do-I-create-a-multiplayer-match-in-Age-of-Empires-II-Definitive-Edition',
    );
  });

  it('赛事手册单独使用最后一座城镇中心，不把赛程写进正文', () => {
    expect(VICTORY_MODE_COPY.sd3).toContain('不能再建城镇中心');
    expect(VICTORY_MODE_COPY.sd3).toContain('最后一座城镇中心被毁就会立刻输掉');
    expect(SD3_HANDBOOK_SOURCE.url).toBe('https://www.twestaoe.net/events/suddendessaster3');
    expect(SD3_HANDBOOK_SOURCE.checkedAt).toBe('2026-11-06');
    expect(AOE_BUDDY_SD3_SOURCE.updatedAt).toBe('2026-10-11');
    expect(victoryModeVisibleText()).not.toMatch(/半决赛|奖金|\$20|签表|Round of/);
  });

  it('弑君只保留官方那三句，不写人数或未核对能力', () => {
    expect(VICTORY_MODE_COPY.regicide).toBe('同一篇官方说明把它列为可另选的次要游戏模式：开局会生成一位国王，并额外带村民。失去国王即负。');
    expect(VICTORY_MODE_COPY.regicide).not.toMatch(/\d/);
  });

  it('奇观和圣物没有核验出处，短卡不写', () => {
    expect(victoryModeVisibleText()).not.toMatch(/奇观|圣物|Wonder|Relic/);
  });

  it('卡片渲染出官方链接、更新日期，以及三处出处', () => {
    const html = renderToStaticMarkup(createElement(VictoryModesCard));
    const visible = text(html);
    expect(html).toContain(`href="${OFFICIAL_MULTIPLAYER_SOURCE.url}"`);
    expect(html).toContain('dateTime="2026-01-16"');
    expect(visible).toContain('更新于 2026-01-16');
    expect(visible).toContain('不能再建城镇中心');
    expect(visible).toContain('主城（home Town Center）被毁就会输掉');
    expect(visible).toContain('最后一座城镇中心被毁就会立刻输掉');
    expect(visible).toContain('失去国王即负');
    expect(visible).toContain('不能用征服示例代替');
    expect(visible).toContain(VICTORY_MODE_COPY.conquest);
    expect(visible).not.toMatch(/奇观|圣物/);
    expect(html).toContain(SD3_HANDBOOK_SOURCE.url);
    expect(html).toContain(AOE_BUDDY_SD3_SOURCE.url);
    expect(html).not.toContain('<table');
  });
});

describe('#729 SD3 合集只加短链', () => {
  it('链到入门页，不写赛程或比分', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(SuddenDessaster3)));
    expect(html).toContain('data-testid="sd3-victory-link"');
    expect(html).toContain('href="/game-guide"');
    expect(html).toContain('查看胜利条件说明');
    expect(text(html)).not.toMatch(/半决赛|奖金|\$20|签表|Round of|比分/);
  });
});
