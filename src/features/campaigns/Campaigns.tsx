import { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { civByEn } from '../../data';
import {
  CAMPAIGNS,
  CAMPAIGN_CATALOG,
  CAMPAIGN_KINDS,
  CAMPAIGN_QUERY_LIMIT,
  CAMPAIGN_REGIONS,
  CAMPAIGN_RELEASE_PACKS,
  campaignCatalogErrors,
  campaignHistoricalRange,
  campaignShareUrl,
  campaignSwordLabel,
  decodeCampaignFilters,
  defaultCampaignFilters,
  encodeCampaignFilters,
  filterCampaigns,
  type Campaign,
  type CampaignFilters,
  type CampaignSource,
} from '../../domain/campaigns';
import { Icon } from '../../shared/ui/Icon';
import { useShareLink } from '../../shared/ui/useShareLink';
import './campaigns.css';

const DATA_ERRORS = campaignCatalogErrors();

const SOURCE_NAMES: Record<string, string> = {
  developer: '开发方资料',
  official: '官方资料',
  'client-mirror': '游戏文字存档（第三方）',
  'community-client-transcription': '玩家社区整理',
  media: '游戏媒体报道',
  editorial: '本站整理',
};
function Source({ source }: { source: CampaignSource }) {
  return (
    <div className="campaign-source">
      {source.url ? (
        <a href={source.url} target="_blank" rel="noopener noreferrer">
          {source.title}
        </a>
      ) : (
        <strong>{source.title}</strong>
      )}
      <p>
        {SOURCE_NAMES[source.kind] ?? '未核实来源'} · 核对于 <span className="num campaign-nowrap">{source.checkedAt}</span>
        {source.publishedAt && (
          <>
            {' '}
            · 发布于 <span className="num campaign-nowrap">{source.publishedAt}</span>
          </>
        )}
        {source.updatedAt && (
          <>
            {' '}
            · 更新于 <span className="num campaign-nowrap">{source.updatedAt}</span>
          </>
        )}
      </p>
    </div>
  );
}
function CampaignCard({ entry }: { entry: Campaign }) {
  const swordLabel = campaignSwordLabel(entry.swords);
  return (
    <article className="campaign-card" data-testid="campaign-card" data-campaign={entry.id} aria-labelledby={`campaign-${entry.id}`}>
      <div className="campaign-card-heading">
        <p className="campaign-kind">{CAMPAIGN_KINDS[entry.kind]} · 常规 AoE2 单人</p>
        <h2 id={`campaign-${entry.id}`}>{entry.nameZh}</h2>
        <p className="campaign-english" lang="en">
          {entry.nameEn}
        </p>
      </div>
      <dl className="campaign-facts">
        <dt>游戏覆盖年代</dt>
        <dd className="num campaign-nowrap">{campaignHistoricalRange(entry)}</dd>
        <dt>首发内容包</dt>
        <dd>
          {CAMPAIGN_RELEASE_PACKS[entry.originalContentPackId]} ·{' '}
          <span className="num campaign-nowrap">{entry.releaseYear === null ? '年份未核实' : `${entry.releaseYear}年`}</span>
        </dd>
        <dt>玩家文明</dt>
        <dd>{entry.civilizationIds.map((id) => civByEn(id)?.zh ?? `${id}（名称未核实）`).join('、')}</dd>
        <dt>剧情地区</dt>
        <dd>
          {entry.regionIds.map((id) => CAMPAIGN_REGIONS[id]).join('、')}
          <span className="campaign-setting">{entry.settingZh}</span>
        </dd>
        {swordLabel && (
          <>
            <dt>官方剑级</dt>
            <dd className="num campaign-nowrap">{swordLabel}</dd>
          </>
        )}
      </dl>
      <Link className="campaign-content-link" to={`/content-guide?pack=${encodeURIComponent(entry.contentPackId)}`}>
        查看当前内容与购买要求 <Icon name="arrow-right" />
      </Link>
      <p className="campaign-source-row">
        <span>来源：</span>
        <a href={CAMPAIGN_CATALOG.sources['fe-campaigns']!.url} target="_blank" rel="noopener noreferrer">
          战役目录
        </a>
        <a href={CAMPAIGN_CATALOG.sources['fe-timeline']!.url} target="_blank" rel="noopener noreferrer">
          年代时间表
        </a>
      </p>
    </article>
  );
}
function FilterOptions({ value, options, all = true }: { value: string; options: Record<string, string>; all?: boolean }) {
  const known = Object.hasOwn(options, value) || (all && value === 'all');
  return (
    <>
      {all && <option value="all">全部</option>}
      {!known && <option value={value}>未识别：{value || '空值'}</option>}
      {Object.entries(options).map(([id, label]) => (
        <option key={id} value={id}>
          {label}
        </option>
      ))}
    </>
  );
}
export default function Campaigns() {
  const location = useLocation();
  const navigate = useNavigate();
  const decoded = useMemo(() => decodeCampaignFilters(location.search), [location.search]);
  const { filters, locked, errors } = decoded;
  const valid = !locked && errors.length === 0;
  const entries = valid ? filterCampaigns(filters) : [];
  const {
    copy,
    status,
    manualLink,
    reset: resetShare,
    statusProps,
  } = useShareLink({
    stateKey: JSON.stringify([location.search, filters]),
    successMessage: '目录链接已复制，包含名称、地区、类型、首发内容包和排序。',
    failureMessage: '自动复制失败，请手动复制下方完整链接。',
  });
  const update = (patch: Partial<CampaignFilters>, replace = false) => {
    if (locked) return;
    // Do not discard other invalid semantic fields while one field is being corrected.
    const search = new URLSearchParams({ v: '1', ...filters, ...patch }).toString();
    navigate({ pathname: '/campaigns', search: '?' + search }, { replace });
    resetShare();
  };
  const reset = () => {
    navigate({ pathname: '/campaigns', search: '?' + encodeCampaignFilters(defaultCampaignFilters()) });
    resetShare();
  };
  const share = async () => {
    if (!valid) return;
    await copy(() => campaignShareUrl(filters, document.baseURI));
  };
  if (DATA_ERRORS.length)
    return (
      <section className="pane campaigns-page" data-testid="campaigns-page">
        <h1>战役入门目录</h1>
        <div role="alert">
          <h2>目录资料暂不可用</h2>
          <p>字段核对未通过，请稍后刷新重试。当前不展示未经核对的条目。</p>
        </div>
      </section>
    );
  return (
    <section className="pane campaigns-page" data-testid="campaigns-page">
      <header className="campaign-heading">
        <h1>战役入门目录</h1>
        <p>从名称、地区或首发内容包查找，按发售或游戏覆盖年代安排自己的顺序。</p>
      </header>
      {errors.length > 0 && (
        <div className="campaign-error" role="alert">
          <h2>{locked ? '目录链接未能恢复' : '请修正筛选条件'}</h2>
          <p>{errors.join(' ')}</p>
          <p>{locked ? '未展示默认结果。原链接保留，明确重置后才能开始查找。' : '原值保留在对应控件中，修正后恢复结果。'}</p>
          <label>
            原始目录链接
            <textarea readOnly rows={3} value={window.location.href} onFocus={(event) => event.currentTarget.select()} />
          </label>
          <button type="button" onClick={reset}>
            重置目录条件
          </button>
        </div>
      )}
      <form className="campaign-filters" aria-label="战役目录筛选" onSubmit={(event) => event.preventDefault()}>
        <label className="campaign-search">
          搜索战役名称
          <span>
            <Icon name="search" />
            <input
              type="search"
              value={filters.q}
              placeholder="中文或英文，如华莱士、El Cid"
              disabled={locked}
              onChange={(event) => update({ q: event.target.value }, true)}
              aria-describedby="campaign-search-help"
            />
          </span>
        </label>
        <p id="campaign-search-help" className="campaign-note">
          支持中英文名称与已整理别名，最多<span className="num campaign-nowrap">{CAMPAIGN_QUERY_LIMIT}个字符</span>。
        </p>
        <div className="campaign-filter-grid">
          <label>
            地区
            <select value={filters.region} disabled={locked} onChange={(event) => update({ region: event.target.value })}>
              <FilterOptions value={filters.region} options={CAMPAIGN_REGIONS} />
            </select>
          </label>
          <label>
            类型
            <select value={filters.type} disabled={locked} onChange={(event) => update({ type: event.target.value })}>
              <FilterOptions value={filters.type} options={CAMPAIGN_KINDS} />
            </select>
          </label>
          <label>
            首发内容包
            <select value={filters.releasePack} disabled={locked} onChange={(event) => update({ releasePack: event.target.value })}>
              <FilterOptions value={filters.releasePack} options={CAMPAIGN_RELEASE_PACKS} />
            </select>
          </label>
          <label>
            排序
            <select value={filters.sort} disabled={locked} onChange={(event) => update({ sort: event.target.value })}>
              <FilterOptions value={filters.sort} options={{ release: '原始发售顺序', history: '游戏覆盖历史起始时间' }} all={false} />
            </select>
          </label>
        </div>
        <div className="campaign-actions">
          <button type="button" disabled={locked} onClick={() => update({ ...defaultCampaignFilters(), type: 'tutorial' })}>
            先找基础教程
          </button>
          <button type="button" onClick={reset}>
            清除条件
          </button>
          <button type="button" disabled={!valid} onClick={() => void share()}>
            <Icon name="copy" />
            复制目录链接
          </button>
        </div>
      </form>
      {status && <p {...statusProps}>{status}</p>}
      {manualLink && (
        <label className="campaign-manual">
          手动复制目录链接
          <textarea readOnly rows={3} value={manualLink} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
      <aside className="campaign-coverage" aria-label="收录范围">
        <p>
          首批<span className="num campaign-nowrap">10项</span>：华莱士教程、国王时代<span className="num campaign-nowrap">4个战役</span>、征服者
          <span className="num campaign-nowrap">3个战役</span>与<span className="num campaign-nowrap">2场历史战役</span>。并非完整目录。
        </p>
        <p>Chronicles（编年史）、Return of Rome（罗马归来）、孙子兵法、其他战役、合作变体与社区模组暂未收录。</p>
      </aside>
      {valid && (
        <>
          <p className="campaign-count" role="status">
            当前
            <span className="num campaign-nowrap">
              {entries.length} / {CAMPAIGNS.length}项
            </span>
            。
            {filters.sort === 'history'
              ? '按已核实起始年排列，重叠区间照实保留，起始年相同的按英文名字母顺序排列。'
              : '按首发年排列，同一年发行的按英文名字母顺序排列。'}
          </p>
          {entries.length > 0 ? (
            <div className="campaign-results">
              {entries.map((entry) => (
                <CampaignCard key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            <div className="campaign-empty" data-testid="campaign-empty">
              <h2>当前目录没有符合条件的条目</h2>
              <p>可能暂未收录，或与当前条件不符。条件已保留，可修改筛选或清除条件；这不表示游戏中不存在该内容。</p>
              <button type="button" onClick={reset}>
                查看首批全部条目
              </button>
            </div>
          )}
        </>
      )}
      <details className="campaign-boundaries">
        <summary>关于数据</summary>
        <p>游戏覆盖年代来自开发方战役时间表，描述游戏剧情所跨越的区间，不是英雄生卒年，也不宣称剧情严格等同史实。区间可以重叠；排序仅提供查找方式。</p>
        <p>
          首发内容包表示历史上的首次发行。当前包含关系与购买条件请查看内容导航；年代排序与首发顺序彼此独立，缺失年份排在末尾，同一年发行的按英文名字母顺序排列。
        </p>
        <p>官方剑级是战役挑战标记，与进入游戏时选择的标准、中等、困难不同。本批尚无逐条官方剑级证据，暂不展示剑级，不表示零剑或最容易。</p>
        <p>本站整理：地区按剧情地点归纳，可跨洲，并非游戏战役菜单的位置；搜索别名帮助查找，不是官方替代标题。</p>
        <p data-testid="campaign-name-sources">
          {
            '战役名称取自第三方存档的游戏内文字（英文与简体中文）。华莱士的玩家文明依据官方教程；其余战役的玩家文明参考 Steam 社区玩家进游戏逐个查看后整理的指南，更新于 '
          }
          <span className="num campaign-nowrap">2024-05-12</span>
          {'。这份指南只用来确认玩家文明，不用于年代或剑级。这些资料都没有标明对应的游戏版本，可能与你当前游戏里的显示略有不同。'}
        </p>
        <p>
          资料核对于<span className="num campaign-nowrap">{CAMPAIGN_CATALOG.verifiedAt}</span>
          。仅收录已列明的条目，不提供逐关攻略、剧情剧透、主观难度总榜或成就与存档同步。
        </p>
        <div className="campaign-source-list">
          {Object.entries(CAMPAIGN_CATALOG.sources)
            .filter(([, source]) => source.url)
            .map(([id, source]) => (
              <Source key={id} source={source} />
            ))}
        </div>
      </details>
    </section>
  );
}
