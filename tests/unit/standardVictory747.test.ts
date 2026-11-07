import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { VICTORY_MODE_COPY, victoryModeVisibleText } from '../../src/features/gameGuide/victoryModes';
import StandardVictoryCard from '../../src/features/gameGuide/standardVictoryCard';
import {
  BASE_COUNTDOWN,
  OFFICIAL_185872,
  RANKED_ENDING,
  agreedCount,
  standardVictoryFacts,
  type StandardVictoryFacts,
} from '../../src/features/gameGuide/standardVictory';

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const render = (facts?: StandardVictoryFacts) =>
  text(renderToStaticMarkup(createElement(MemoryRouter, null, createElement(StandardVictoryCard, facts ? { facts } : {}))));

describe('#747 Standard 倒计时只写有出处的句子', () => {
  it('年数和削减比例必须中英说明一致，对不上就空', () => {
    expect(agreedCount('倒计时 +100 年', 'takes +100 years', /倒计时 \+(\d+) 年/, /takes \+(\d+) years/)).toBe(100);
    expect(agreedCount('倒计时 +100 年', 'takes +90 years', /倒计时 \+(\d+) 年/, /takes \+(\d+) years/)).toBeNull();
    expect(agreedCount(undefined, 'takes +100 years', /倒计时 \+(\d+) 年/, /takes \+(\d+) years/)).toBeNull();
  });

  it('真实科技说明给出 100 年，效果导出没有 196 和 198，基础秒数保持空', () => {
    const facts = standardVictoryFacts();
    expect(facts.techId).toBe(21);
    expect(facts.techZh).toBe('无神论');
    expect(facts.civZh).toBe('匈奴');
    expect(facts.years).toBe(100);
    expect(facts.relicCutPercent).toBe(50);
    expect(facts.flag).toEqual({ state: 'value', op: 'set', value: 56 });
    expect(facts.wonder).toEqual({ state: 'absent', op: null, value: null });
    expect(facts.relic).toEqual({ state: 'absent', op: null, value: null });
    expect(facts.baseSeconds).toBeNull();
    expect(facts.patchBuild).toBe('188329');
    expect(facts.patchDate).toBe('2026-10-28');
    expect(BASE_COUNTDOWN).toBe('随地图尺寸变化');
  });

  it('导出里若出现资源规则，只保留原值，仍不产生秒数', () => {
    const facts = standardVictoryFacts(
      [
        {
          id: 21,
          en: 'Atheism',
          zh: '无神论',
          desc: '敌方圣物产生的资源 -50%；世界奇观和圣物胜利的倒计时 +100 年。',
          descEn: 'Enemy Relics generate -50% resources; Wonder and Relic victory takes +100 years.',
          civs: ['Huns'],
        },
      ],
      {
        techs: {
          Atheism: {
            id: 21,
            eco: [
              { res: 33, op: 'set', v: 56 },
              { res: 196, op: 'set', v: 1000 },
            ],
          },
        },
      },
      [{ en: 'Huns', zh: '匈奴' }],
    );
    expect(facts.wonder).toEqual({ state: 'value', op: 'set', value: 1000 });
    expect(facts.relic.state).toBe('absent');
    expect(facts.baseSeconds).toBeNull();
    expect(render(facts)).toContain('设为 1000');
    expect(render(facts)).not.toMatch(/\d+\s*秒/);
  });

  it('说明对不上时年数待确认，不回退成 100', () => {
    const facts = standardVictoryFacts(
      [
        {
          id: 21,
          en: 'Atheism',
          zh: '无神论',
          desc: '世界奇观和圣物胜利的倒计时 +90 年。',
          descEn: 'Wonder and Relic victory takes +100 years.',
          civs: ['Huns'],
        },
      ],
      { techs: {} },
      [{ en: 'Huns', zh: '匈奴' }],
    );
    expect(facts.years).toBeNull();
    const visible = render(facts);
    expect(visible).toContain('年数待确认');
    expect(visible).not.toContain('+100 年');
    expect(visible).not.toContain('+90 年');
  });

  it('卡片写清 Standard 不是天梯征服，并链到产金和无神论', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(StandardVictoryCard)));
    const visible = text(html);
    expect(visible).toContain('不是本页六张卡使用的征服示例，也不是天梯默认');
    expect(visible).toContain('不要用奇观或圣物倒计时代替它');
    expect(visible).toContain('基础倒计时随地图尺寸变化');
    expect(visible).toContain('具体秒数待确认');
    expect(visible).toContain('+100 年');
    expect(visible).toContain('只加给敌方和中立玩家');
    expect(visible).toContain('可以叠加');
    expect(visible).toContain('没有规则，要加多少待确认');
    expect(visible).toContain(OFFICIAL_185872.timer);
    expect(visible).toContain(RANKED_ENDING.quote);
    expect(html).toContain('href="/relic-income"');
    expect(html).toContain('圣物收益（只算产金）');
    expect(html).toContain('href="/tech/21"');
    expect(html).toContain(`href="${OFFICIAL_185872.url}"`);
    expect(html).toContain(`href="${RANKED_ENDING.url}"`);
    expect(html).toContain(`href="${'https://ugc.aoe2.rocks/general/resources/resources/'}"`);
    expect(html).not.toContain('<table');
    expect(visible).not.toMatch(/\d+\s*秒/);
    expect(visible).not.toMatch(/\d+:\d+/);
    expect(visible).not.toMatch(/奇观流|速奇观|开局推荐|何时造/);
  });

  it('源码不写死年数、秒数或 UGC 附加时间', () => {
    const source = [
      readFileSync('src/features/gameGuide/standardVictory.ts', 'utf8'),
      readFileSync('src/features/gameGuide/standardVictoryCard.tsx', 'utf8'),
    ].join('\n');
    expect(source).not.toMatch(/\+100|100 年|1000|16:40|2000 年|\d+\s*秒/);
  });

  it('不改写 #729 已落地的猝死句子', () => {
    expect(VICTORY_MODE_COPY.suddenDeath).toContain('不能再建城镇中心');
    expect(VICTORY_MODE_COPY.suddenDeath).toContain('主城（home Town Center）被毁就会输掉');
    expect(victoryModeVisibleText()).not.toMatch(/奇观|圣物/);
  });
});
