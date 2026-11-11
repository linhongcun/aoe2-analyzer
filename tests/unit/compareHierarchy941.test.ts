import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RATING_BASIS, RATING_FILE_VERIFIED_AT } from '../../src/data/ratingBasis';
import { AXES } from '../../src/domain/ratings';
import { defaultTeamBonusConfig, encodeTeamBonuses, updateTeamRoster } from '../../src/domain/teamBonuses';
import Compare, {
  COMPARE_AXIS_NAMES_NOTE,
  COMPARE_FACT_NOTE,
  COMPARE_LEDE,
  CompareRatingDetail,
  compareRatingSummary,
} from '../../src/features/compare/components/Compare';

const SUMMARY =
  '八维分数是维护者整理的 1–10 整数，用来对照和画雷达，不是胜率或精确战力。各轴没有单独的量化规则，规则待核。分数适用的游戏补丁未知。同一分数没有按地图、时代或打法拆开，这些边界未知。可复查的记录是维护者主观判断，没有逐条出处，缺出处的部分待核。旧说明写过团战排位社区的普遍看法。这份文件没有可复查的社区出处，该依据待核，不能当成已证实来源。文件复核日 2026-11-10 只表示本文件结构和口径查过，不是逐文明重打分，也不表示已经对齐当前资料版本。';

function page(path: string) {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Compare)));
}

function text(html: string) {
  return html.replace(/<[^>]+>/g, '');
}

describe('#941 文明对比信息层级', () => {
  it('短摘要逐字保留裁定文案，复核日来自评分文件', () => {
    expect(RATING_FILE_VERIFIED_AT).toBe('2026-11-10');
    expect(compareRatingSummary(RATING_FILE_VERIFIED_AT)).toBe(SUMMARY);
    expect(SUMMARY).toContain('没有按地图、时代或打法拆开');
    expect(SUMMARY).toContain('不能当成已证实来源');
  });

  it('默认收起完整口径，摘要、对照表和雷达按顺序出现', () => {
    const html = page('/compare?a=Franks&b=Britons');
    const body = text(html);
    expect(body).toContain(COMPARE_LEDE);
    expect(html).toContain(`data-testid="compare-rating-summary"`);
    expect(body).toContain(SUMMARY);
    expect(html).not.toContain('>完整评分口径<');
    expect(html).toContain('查看完整评分口径');
    expect(html.indexOf('compare-toolbar')).toBeLessThan(html.indexOf('compare-rating-basis'));
    expect(html.indexOf('compare-rating-basis')).toBeLessThan(html.indexOf('id="compare-scores-title"'));
    expect(html.indexOf('id="compare-scores-title"')).toBeLessThan(html.indexOf('>能力评分<'));
    expect(html.indexOf('>能力评分<')).toBeLessThan(html.indexOf('id="compare-facts-title"'));
    expect(html.indexOf('id="compare-facts-title"')).toBeLessThan(html.indexOf('团战位置适配'));
    expect(body.indexOf('查看这两个文明的团队加成来源')).toBeLessThan(body.indexOf('评分性质'));
    expect(body).toContain('以下条目来自文明资料字段，不由上表分数推导。');
    expect(body).toContain('参考开局');
    expect(html).toContain('href="/team-bonuses?');
    expect(html).toContain(encodeTeamBonuses(updateTeamRoster(defaultTeamBonusConfig(), ['Franks', 'Britons'])).replace(/&/g, '&amp;'));
    expect(html).not.toMatch(/href="\/team-bonuses"/);
    expect(body).not.toContain('赢家');
    expect(body).not.toContain('总分');
    expect(body).not.toContain('compare-r1-theme');
  });

  it('展开区保留原句、全部轴名，且不再逐轴重复 axisGap', () => {
    const html = renderToStaticMarkup(createElement(CompareRatingDetail));
    const body = text(html);
    expect(body).toContain(RATING_BASIS.axisRule);
    expect(body).toContain(`刻度是 1–10 的整数。文件复核日 ${RATING_FILE_VERIFIED_AT}。`);
    expect(body).toContain(RATING_BASIS.verifiedAtMeans);
    expect(body).toContain(COMPARE_AXIS_NAMES_NOTE);
    expect(body).toContain(RATING_BASIS.reviewableEvidence);
    expect(body).toContain(RATING_BASIS.communityClaimNote);
    expect(body).toContain(RATING_BASIS.uncertainty);
    expect(body).toContain(RATING_BASIS.highlight);
    expect(body).toContain(COMPARE_FACT_NOTE);
    expect(RATING_BASIS.axes).toEqual([...AXES]);
    for (const axis of RATING_BASIS.axes) expect(html).toContain(`<li>${axis}</li>`);
    expect(body.split(RATING_BASIS.axisGap).length - 1).toBe(0);
    expect(body).not.toContain('188329');
  });

  it('同文明不加高亮，非法和缺侧沿用原提示，团队链接跟当前双方', () => {
    expect(page('/compare?a=Franks&b=Franks')).not.toContain('compare-higher');
    expect(text(page('/compare?a=Nope&b=Britons'))).toContain('链接中的文明无效，已整组回退为默认对比。');
    expect(text(page('/compare?a=Britons'))).toContain('链接缺少对手文明，已自动选择「亚美尼亚」，请按实际补选。');
    expect(page('/compare?a=Japanese&b=Mongols')).toContain('players=Japanese%2CMongols');
  });
});
