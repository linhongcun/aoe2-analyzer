import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ECO as eco } from '../../src/data/eco';
import { buildOrders } from '../../src/data/buildOrders';
import { civSimNotes, simulateBuild } from '../../src/domain/buildSim';
import { NumUnitText } from '../../src/features/builds/NumUnitText';
import { TimelineSummary } from '../../src/features/builds/TimelineSummary';
import { noHouseCompareText, prereqDetail } from '../../src/features/builds/timelineModel';
import { buildShareCard, type ShareInput } from '../../src/features/builds/shareCard';
import { UPS } from '../../src/features/builds/upgrades';

const render = (text: string) => renderToStaticMarkup(createElement(NumUnitText, { text }));
const EXPECTED_UNIT_RE = /\d+(?:\.\d+)?\s*(?:名村民|个村民|人口|村民|民兵|分钟|食物|木材|黄金|石料|名|个|座|头|只|人|格|步|秒|艘|辆|块|套|木|食|金|石)/g;
const ANY_NUM_ZH_RE = /\d+(?:\.\d+)?\s*[\u4e00-\u9fff]+/g;

describe('#1454 NumUnitText 统一正则与全量开局语料保护', () => {
  it('全称资源词、复合量词与新增民兵/套/辆均完整包入单个 .nw，不切裂全称', () => {
    expect(render('1 食物')).toBe('<span class="nw">1 食物</span>');
    expect(render('1 食物')).not.toContain('<span class="nw">1 食</span>物');
    expect(render('15食物、80木材、200黄金、100石料')).toBe(
      '<span class="nw">15食物</span>、<span class="nw">80木材</span>、<span class="nw">200黄金</span>、<span class="nw">100石料</span>',
    );
    expect(render('1辆骡车')).toBe('<span class="nw">1辆</span>骡车');
    expect(render('27 村民 + 3 民兵')).toBe('<span class="nw">27 村民</span> + <span class="nw">3 民兵</span>');
    expect(render('8套开局不研究织布机，8套模板未驻军')).toBe('<span class="nw">8套</span>开局不研究织布机，<span class="nw">8套</span>模板未驻军');
    expect(render('升城堡需先建完 2 座封建建筑')).toBe('升城堡需先建完 <span class="nw">2 座</span>封建建筑');
    expect(render('借 1 名村民（优先伐木者）盖房，7 格走路距离')).toBe(
      '借 <span class="nw">1 名村民</span>（优先伐木者）盖房，<span class="nw">7 格</span>走路距离',
    );
    expect(render('21 个村民与起始少 100 木，按 0.1秒 步长')).toBe(
      '<span class="nw">21 个村民</span>与起始少 <span class="nw">100 木</span>，按 <span class="nw">0.1秒</span> 步长',
    );
    expect(render('')).toBe('');
  });

  it('不将非量词动词（9:15 到达）或非单位连接词误包入 .nw', () => {
    expect(render('2 个伐木，研究织布机后点封建（理想 9:15 到达）。')).toBe('<span class="nw">2 个</span>伐木，研究织布机后点封建（理想 9:15 到达）。');
    expect(render('人口余量 ≤ 2 且没有在建房子时，木材够 25 才盖')).toBe('人口余量 ≤ 2 且没有在建房子时，木材够 25 才盖');
  });

  it('遍历全部 8 套开局 JSON（summary 与 steps[].note），所有数字+单位完整包裹且无全称切裂', () => {
    expect(buildOrders).toHaveLength(8);
    let matchedCount = 0;
    for (const bo of buildOrders) {
      const texts = [bo.summary, ...bo.steps.map((step) => step.note ?? '')];
      for (const text of texts) {
        const html = render(text);
        // 禁止把全称资源词切裂为单字 .nw + 余字
        expect(html).not.toMatch(/<span class="nw">[^<]*[木食金石]<\/span>[物材金料]/);
        // 移除 .nw 后不应残余任何未包裹的数字+单位
        const stripped = html.replace(/<span class="nw">[^<]*<\/span>/g, '');
        expect(stripped.match(EXPECTED_UNIT_RE) ?? [], `${bo.id}: ${text}`).toEqual([]);
        // 除明确排除的非量词「15 到达」（9:15 到达）外，所有数字+中文词组均已覆盖
        const unmatchedNumZh = (stripped.match(ANY_NUM_ZH_RE) ?? []).filter((frag) => frag !== '15 到达');
        expect(unmatchedNumZh, `${bo.id}: ${text}`).toEqual([]);
        matchedCount += (text.match(EXPECTED_UNIT_RE) ?? []).length;
      }
    }
    expect(matchedCount).toBeGreaterThan(50);
  });

  it('通用估算假设、文明注释、前置等待、分享卡口径与无房对比行均被完整包裹', () => {
    const bo = buildOrders.find((entry) => entry.id === 'feudal-drush-18')!;
    const tl = simulateBuild(bo, 'Generic', eco, UPS);
    const assumptionsHtml = tl.model.assumptions.map((line) => render(line)).join('\n');
    expect(assumptionsHtml).toContain('<span class="nw">1 名村民</span>');
    expect(assumptionsHtml).toContain('<span class="nw">7 格</span>');

    const chineseNotes = civSimNotes(eco, 'Chinese', 'feudal-drush-18')
      .map((line) => render(line))
      .join('；');
    expect(chineseNotes).toContain('<span class="nw">6村民</span>');
    expect(chineseNotes).toContain('<span class="nw">15人口</span>');

    const jurchenAssumptions = simulateBuild(bo, 'Jurchens', eco, UPS)
      .model.assumptions.map((line) => render(line))
      .join('\n');
    expect(jurchenAssumptions).toContain('<span class="nw">8套</span>');

    const gurjaraAssumptions = simulateBuild(bo, 'Gurjaras', eco, UPS)
      .model.assumptions.map((line) => render(line))
      .join('\n');
    expect(gurjaraAssumptions).toContain('<span class="nw">3名村民</span>');
    expect(gurjaraAssumptions).toContain('<span class="nw">1名</span>');

    expect(render(prereqDetail({ age: 3, need: 2, missing: ['市场'] }))).toContain('<span class="nw">2 座</span>');
    expect(render('等前置建筑 约 12 秒')).toContain('<span class="nw">12 秒</span>');
    expect(render('模拟超过 60 分钟仍未完成（资源或建筑条件无法满足）')).toContain('<span class="nw">60 分钟</span>');

    const compare = noHouseCompareText({ earlierSec: 21, startWoodDelta: -100, woodNet: 0 }, '封建');
    const summaryHtml = renderToStaticMarkup(createElement(TimelineSummary, { extra: compare, children: createElement('div') }));
    expect(summaryHtml).toContain('<span class="nw">100 木</span>');
    // 保留 data-t="sum-compare" 下 2 个直接子 <span> 结构（兼容 huns42flag）
    expect(summaryHtml.match(/<p class="tl-cmp" data-t="sum-compare"><span>.*<\/span> <span>.*<\/span><\/p>/)).not.toBeNull();

    const card = buildShareCard({
      view: { top: null, timeout: false, tcIdleTotal: 0 } as ShareInput['view'],
      target: undefined,
      boId: 'feudal-drush-18',
      boNameZh: bo.name.zh,
      civEn: '',
      civZh: '通用',
      targetZh: '封建',
      dist: 4,
      defaultDist: 4,
      house: true,
      patchBuild: __DATA_SOURCES__.patch.build,
      siteRoot: 'example/',
    });
    expect(render(card.basis)).toContain('<span class="nw">4 格</span>');
  });
});
