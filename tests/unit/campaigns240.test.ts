import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import CampaignsPage from '../../src/features/campaigns/Campaigns';
import {
  CAMPAIGNS,
  CAMPAIGN_CATALOG,
  CAMPAIGN_QUERY_LIMIT,
  CAMPAIGN_URL_LIMIT,
  campaignCatalogErrors,
  campaignFilterErrors,
  campaignHistoricalRange,
  campaignShareUrl,
  campaignSwordLabel,
  decodeCampaignFilters,
  defaultCampaignFilters,
  encodeCampaignFilters,
  filterCampaigns,
  type Campaign,
  type CampaignFilters,
} from '../../src/domain/campaigns';
import { civByEn } from '../../src/data';

const defaults = defaultCampaignFilters();
const filters = (patch: Partial<CampaignFilters> = {}): CampaignFilters => ({ ...defaults, ...patch });
const ids = (patch: Partial<CampaignFilters> = {}) => filterCampaigns(filters(patch)).map((entry) => entry.id);
const fixture = (id: string, patch: Partial<Campaign> = {}): Campaign => ({ ...CAMPAIGNS[0]!, id, ...patch });

const NAME_SOURCES_TEXT =
  '战役名称取自第三方存档的游戏内文字（英文与简体中文）。华莱士的玩家文明依据官方教程；其余战役的玩家文明参考 Steam 社区玩家进游戏逐个查看后整理的指南，更新于 2024-05-12。这份指南只用来确认玩家文明，不用于年代或剑级。这些资料都没有标明对应的游戏版本，可能与你当前游戏里的显示略有不同。';

describe('#268 玩家可见来源', () => {
  it('包括折叠区的全部渲染文本不泄露内部审计信息', () => {
    const html = renderToStaticMarkup(createElement(StaticRouter, { location: '/campaigns' }, createElement(CampaignsPage)));
    const text = html.replace(/<[^>]*>/g, ' ');
    expect(text).not.toMatch(/string \d+|CSV|§|issue ?\d+|[0-9a-f]{7,40}|SHA-?256|Site editorial classification|Existing historical release table/i);
    expect(text).toContain('本站整理');
    expect(text).toContain('关于数据');
    expect(html).not.toContain('<dt>官方剑级</dt>');
    expect(html).not.toContain('campaign-evidence');
    expect(html.match(/class="campaign-source-row"/g)).toHaveLength(CAMPAIGNS.length);
    expect(html).toContain(`href="${CAMPAIGN_CATALOG.sources['fe-campaigns']!.url}"`);
    expect(html).toContain(`href="${CAMPAIGN_CATALOG.sources['ign-conquerors-2000']!.url}"`);
    // 来源必须是公开可核实页面，不链接本站仓库源码。
    expect(html).not.toContain('github.com/linhongcun/aoe2-analyzer');
    expect(text).not.toMatch(/固定语言镜像|社区客户端抄录|稳定条目编号/);
    // 名称与文明来源只讲一次：合并为一段，不再单独渲染 versionNote。
    const plain = html.replace(/<[^>]*>/g, '');
    expect(plain).toContain(NAME_SOURCES_TEXT);
    expect(plain.match(/第三方存档的游戏内文字/g)).toHaveLength(1);
    expect(plain.match(/没有标明对应的游戏版本/g)).toHaveLength(1);
    expect(CAMPAIGN_CATALOG).not.toHaveProperty('versionNote');
  });
});

describe('#240 有限目录与来源', () => {
  it('固定10项，教程、7战役与2历史战役，来源引用完整', () => {
    expect(CAMPAIGNS).toHaveLength(10);
    expect(CAMPAIGNS.map((entry) => entry.id).sort()).toEqual([
      'agincourt',
      'attila-the-hun',
      'barbarossa',
      'el-cid',
      'genghis-khan',
      'hastings',
      'joan-of-arc',
      'montezuma',
      'saladin',
      'william-wallace',
    ]);
    expect(CAMPAIGNS.filter((entry) => entry.kind === 'tutorial').map((entry) => entry.id)).toEqual(['william-wallace']);
    expect(CAMPAIGNS.filter((entry) => entry.kind === 'campaign')).toHaveLength(7);
    expect(CAMPAIGNS.filter((entry) => entry.kind === 'historical-battle')).toHaveLength(2);
    expect(campaignCatalogErrors()).toEqual([]);
    expect(CAMPAIGNS.every((entry) => entry.civilizationIds.every((id) => civByEn(id)))).toBe(true);
    expect(CAMPAIGNS.every((entry) => entry.contentPackId === 'base' && entry.modeId === 'aoe2')).toBe(true);
  });
  it('年代只引开发方时间表，保留贞德1428与两个1191重叠终点', () => {
    for (const entry of CAMPAIGNS) expect(entry.fieldEvidence.historicalRange?.sourceIds).toEqual(['fe-timeline']);
    expect(CAMPAIGNS.find((entry) => entry.id === 'joan-of-arc')?.historicalStartYear).toBe(1428);
    expect(
      CAMPAIGNS.filter((entry) => entry.historicalEndYear === 1191)
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(['barbarossa', 'saladin']);
    expect(CAMPAIGN_CATALOG.sources['client-zh']?.version).toContain('12d8d5280e0b0a85f8dfdc558b4ad79279f8b73c');
    expect(CAMPAIGN_CATALOG.sources['guide-civs-2024']?.updatedAt).toBe('2024-05-12');
    expect(CAMPAIGNS.find((entry) => entry.id === 'el-cid')?.civilizationIds).toEqual(['Spanish', 'Saracens']);
  });
  it('未知剑级不是零，1至3剑必须逐条有来源', () => {
    expect(CAMPAIGNS.every((entry) => entry.swords === null)).toBe(true);
    expect(campaignSwordLabel(null)).toBeNull();
    expect(campaignSwordLabel(2)).toBe('2剑');
    for (const swords of [0, 4, 1]) {
      const entry = fixture('swords', { swords: swords as Campaign['swords'] });
      expect(campaignCatalogErrors({ sources: CAMPAIGN_CATALOG.sources, campaigns: [entry] })).not.toEqual([]);
    }
  });
  it('拒绝重复编号、颠倒年代、缺字段证据与未知来源', () => {
    const bad = fixture('same', {
      historicalStartYear: 1200,
      historicalEndYear: 1100,
      fieldEvidence: { swords: { sourceIds: ['absent'], status: 'verified' } },
    });
    expect(campaignCatalogErrors({ sources: CAMPAIGN_CATALOG.sources, campaigns: [bad, bad] }).join(' ')).toMatch(/重复.*区间颠倒.*字段出处.*未知来源/);
  });
});

describe('#240 搜索和交集', () => {
  it.each(CAMPAIGNS.map((entry) => [entry.id, entry.nameZh, entry.nameEn]))('%s的中文和英文均可独立查到', (id, zh, en) => {
    expect(ids({ q: zh })).toEqual([id]);
    expect(ids({ q: en })).toEqual([id]);
  });
  it.each([
    ['ＥＬ　ＣＩＤ', 'el-cid'],
    [' joAN  of Arc ', 'joan-of-arc'],
    ['威廉华莱士', 'william-wallace'],
    ['蒙特祖玛', 'montezuma'],
    ['蒙特苏马', 'montezuma'],
  ])('归一名称%s', (q, id) => {
    expect(ids({ q })).toEqual([id]);
  });
  it('只按名称查询，不把文明名或正则表达式解释为结果规则', () => {
    expect(ids({ q: 'Franks' })).toEqual([]);
    expect(ids({ q: '.*' })).toEqual([]);
    expect(ids({ q: '[abc' })).toEqual([]);
    expect(ids({ q: '   ' })).toHaveLength(10);
  });
  it('地区、类型、首发包和名称取交集，跨洲条目按成员命中', () => {
    const patch = { type: 'historical-battle', releasePack: 'the-conquerors', region: 'europe' };
    expect(ids(patch)).toEqual(['agincourt', 'hastings']);
    expect(ids({ ...patch, q: 'Hastings' })).toEqual(['hastings']);
    expect(ids({ ...patch, releasePack: 'age-of-kings' })).toEqual([]);
    expect(ids({ region: 'africa' })).toEqual(['saladin']);
    expect(ids({ region: 'asia' })).toEqual(['barbarossa', 'genghis-khan', 'saladin']);
  });
});

describe('#240 不同排序口径', () => {
  it('首发同年按稳定ID，历史按已核对起点排序', () => {
    expect(ids()).toEqual([
      'barbarossa',
      'genghis-khan',
      'joan-of-arc',
      'saladin',
      'william-wallace',
      'agincourt',
      'attila-the-hun',
      'el-cid',
      'hastings',
      'montezuma',
    ]);
    expect(ids({ sort: 'history' })).toEqual([
      'attila-the-hun',
      'el-cid',
      'hastings',
      'barbarossa',
      'saladin',
      'genghis-khan',
      'william-wallace',
      'agincourt',
      'joan-of-arc',
      'montezuma',
    ]);
  });
  it('同年稳定ID，未知年份末尾，不按结束年或输入顺序偷偷重排', () => {
    const entries = [
      fixture('z', { historicalStartYear: 1000, historicalEndYear: 1001 }),
      fixture('a', { historicalStartYear: 1000, historicalEndYear: 1400 }),
      fixture('end-only', { historicalStartYear: null, historicalEndYear: 500 }),
      fixture('unknown', { historicalStartYear: null, historicalEndYear: null }),
    ];
    const before = entries.map((entry) => entry.id);
    expect(filterCampaigns(filters({ sort: 'history' }), entries).map((entry) => entry.id)).toEqual(['a', 'z', 'end-only', 'unknown']);
    expect(entries.map((entry) => entry.id)).toEqual(before);
    expect(filterCampaigns(filters(), [fixture('null', { releaseYear: null }), fixture('known', { releaseYear: 2000 })]).map((entry) => entry.id)).toEqual([
      'known',
      'null',
    ]);
  });
  it('单年、重叠区间与单边缺失均如实展示', () => {
    expect(campaignHistoricalRange({ historicalStartYear: 1066, historicalEndYear: 1066 })).toBe('1066年');
    expect(campaignHistoricalRange({ historicalStartYear: 1152, historicalEndYear: 1191 })).toBe('1152–1191年');
    expect(campaignHistoricalRange({ historicalStartYear: null, historicalEndYear: 1200 })).toBe('起点未核实，止于1200年');
    expect(campaignHistoricalRange({ historicalStartYear: 1200, historicalEndYear: null })).toBe('1200年起，终点未核实');
    expect(campaignHistoricalRange({ historicalStartYear: null, historicalEndYear: null })).toBe('未核实');
  });
});

describe('#240 完整、严格的URL', () => {
  const query = encodeCampaignFilters(defaults);
  it('空访问默认，完整带版本状态无损往返', () => {
    expect(decodeCampaignFilters('')).toEqual({ filters: defaults, locked: false, errors: [], raw: '' });
    const config = filters({ q: ' 圣女 & El Cid + 贞德 ', region: 'europe', type: 'campaign', releasePack: 'age-of-kings', sort: 'history' });
    expect(decodeCampaignFilters('?' + encodeCampaignFilters(config))).toMatchObject({ filters: config, locked: false, errors: [] });
  });
  it.each([
    query + '&q=other',
    query + '&%71=other',
    query + '&unknown=1',
    query.replace('v=1&', ''),
    query.replace('v=1', 'v=2'),
    'q=Wallace',
    query + '&',
    query + '&flag',
    query.replace('q=', 'q=%'),
    query.replace('q=', 'q=%C0%AF'),
    query.replace('q=', 'q=%ED%A0%80'),
    query.replace('q=', 'q=%E2%82'),
    'q=' + 'x'.repeat(CAMPAIGN_URL_LIMIT),
  ])('结构损坏暂停恢复且保留原串：%s', (search) => {
    const decoded = decodeCampaignFilters(search);
    expect(decoded.locked).toBe(true);
    expect(decoded.errors.length).toBeGreaterThan(0);
    expect(decoded.raw).toBe(search);
  });
  it('非法枚举与超长搜索保留原值，可逐字段修正，禁止展示结果或分享', () => {
    const params = new URLSearchParams(query);
    params.set('q', '中'.repeat(CAMPAIGN_QUERY_LIMIT + 1));
    params.set('region', 'moon');
    params.set('sort', 'random');
    const result = decodeCampaignFilters(params.toString());
    expect(result.locked).toBe(false);
    expect(result.filters.region).toBe('moon');
    expect(result.filters.q).toBe('中'.repeat(CAMPAIGN_QUERY_LIMIT + 1));
    expect(result.errors).toHaveLength(3);
    expect(filterCampaigns(result.filters)).toEqual([]);
    expect(() => encodeCampaignFilters(result.filters)).toThrow();
  });
  it('拒绝控制字符和损坏的Unicode，边界搜索不会被截断', () => {
    expect(campaignFilterErrors(filters({ q: 'a\nb' }))).not.toEqual([]);
    expect(campaignFilterErrors(filters({ q: '\uD800' }))).not.toEqual([]);
    const q = '中'.repeat(CAMPAIGN_QUERY_LIMIT);
    expect(decodeCampaignFilters(encodeCampaignFilters(filters({ q }))).filters.q).toBe(q);
  });
  it('分享规范化部署子路径、清理外部参数，保留所有状态', () => {
    const config = filters({ q: '蒙提祖马', sort: 'history', releasePack: 'the-conquerors' });
    for (const base of ['https://example.com/aoe2-analyzer/?tracking=1#/campaigns', 'https://example.com/aoe2-analyzer/campaigns/?tracking=1#anything']) {
      const url = new URL(campaignShareUrl(config, base));
      expect(url.pathname).toBe('/aoe2-analyzer/');
      expect(url.search).toBe('');
      expect(decodeCampaignFilters(url.hash.slice(url.hash.indexOf('?'))).filters).toEqual(config);
    }
    expect(new URL(campaignShareUrl(defaults, 'https://example.com/')).pathname).toBe('/');
  });
});
