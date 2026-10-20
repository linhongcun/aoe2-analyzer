import { useMemo, useState } from 'react';
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
import './campaigns.css';

const DATA_ERRORS = campaignCatalogErrors();

const FIELD_NAMES: Record<string, string> = {
  nameZh: '中文名称',
  nameEn: '英文名称',
  aliases: '搜索别名',
  kind: '条目类型',
  modeId: '游戏模式',
  civilizationIds: '玩家文明',
  regionIds: '地区归纳',
  originalContentPackId: '首发内容包',
  contentPackId: '当前内容导航',
  releaseYear: '首发年',
  releaseDate: '精确首发日',
  historicalRange: '游戏覆盖年代',
  swords: '官方剑级',
};
const EVIDENCE_NAMES: Record<string, string> = {
  'snapshot-verified': '固定快照已核对',
  verified: '来源已核对',
  editorial: '本站搜索整理',
  official: '官方说明',
  'community-transcription': '社区客户端抄录',
  'editorial-derived': '本站按剧情地点归纳',
  'external-reference': '关联内容导航',
  'verified-existing-catalogue': '既有发行目录已核对',
  'developer-verified': '开发方时间表已核对',
  'not-verified': '未核实',
  'not-provided': '未提供',
};
const SOURCE_NAMES: Record<string, string> = {
  developer: '开发方资料',
  official: '官方资料',
  'client-mirror': '固定语言镜像',
  'community-client-transcription': '社区客户端抄录',
  repository: '既有固定发行表',
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
        {SOURCE_NAMES[source.kind] ?? '未核实来源'} · 核对于 <span className="campaign-nowrap">{source.checkedAt}</span>
        {source.publishedAt && (
          <>
            {' '}
            · 发布于 <span className="campaign-nowrap">{source.publishedAt}</span>
          </>
        )}
        {source.updatedAt && (
          <>
            {' '}
            · 更新于 <span className="campaign-nowrap">{source.updatedAt}</span>
          </>
        )}
      </p>
      <p>{source.version}</p>
      {source.sha256 && <p className="campaign-hash">SHA256：{source.sha256}</p>}
    </div>
  );
}
function CampaignCard({ entry }: { entry: Campaign }) {
  const sourceIds = [...new Set(Object.values(entry.fieldEvidence).flatMap((evidence) => evidence.sourceIds))];
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
        <dd className="campaign-nowrap">{campaignHistoricalRange(entry)}</dd>
        <dt>首发内容包</dt>
        <dd>
          {CAMPAIGN_RELEASE_PACKS[entry.originalContentPackId]} ·{' '}
          <span className="campaign-nowrap">{entry.releaseYear === null ? '年份未核实' : `${entry.releaseYear}年`}</span>
        </dd>
        <dt>玩家文明</dt>
        <dd>{entry.civilizationIds.map((id) => civByEn(id)?.zh ?? `${id}（名称未核实）`).join('、')}</dd>
        <dt>剧情地区</dt>
        <dd>
          {entry.regionIds.map((id) => CAMPAIGN_REGIONS[id]).join('、')}
          <span className="campaign-setting">{entry.settingZh}</span>
        </dd>
        <dt>官方剑级</dt>
        <dd>{campaignSwordLabel(entry.swords)}</dd>
      </dl>
      <p className="campaign-note">{entry.id === 'william-wallace' ? '文明关联有官方教程说明。' : '文明关联依据社区客户端抄录（2024-05-12）。'}</p>
      <Link className="campaign-content-link" to={`/content-guide?pack=${encodeURIComponent(entry.contentPackId)}`}>
        查看当前内容与购买要求 <Icon name="arrow-right" />
      </Link>
      <details className="campaign-sources">
        <summary>字段来源与核对版本</summary>
        <p className="campaign-note">核对日期：{entry.verifiedAt}。来源性质逐字段列出；固定语言镜像和社区抄录均不代表当前客户端实测。</p>
        <dl className="campaign-evidence">
          {Object.entries(entry.fieldEvidence).map(([field, evidence]) => (
            <div key={field}>
              <dt>{FIELD_NAMES[field] ?? field}</dt>
              <dd>
                <strong>{EVIDENCE_NAMES[evidence.status] ?? '未核实'}</strong>
                {evidence.locator && <p>{evidence.locator}</p>}
                {evidence.note && <p>{evidence.note}</p>}
                {evidence.sourceIds.length > 0 && <p>依据：{evidence.sourceIds.map((id) => CAMPAIGN_CATALOG.sources[id]?.title ?? '来源未核实').join('；')}</p>}
              </dd>
            </div>
          ))}
        </dl>
        <div className="campaign-source-list">
          {sourceIds.map((id) => {
            const source = CAMPAIGN_CATALOG.sources[id];
            return source && <Source key={id} source={source} />;
          })}
        </div>
        {entry.aliases.length > 0 && <p>本站搜索别名：{entry.aliases.join('、')}。它们不是官方替代标题。</p>}
      </details>
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
  const [copy, setCopy] = useState<{ key: string; message: string; link?: string } | null>(null);
  const copyState = copy?.key === location.search ? copy : null;
  const update = (patch: Partial<CampaignFilters>, replace = false) => {
    if (locked) return;
    // Do not discard other invalid semantic fields while one field is being corrected.
    const search = new URLSearchParams({ v: '1', ...filters, ...patch }).toString();
    navigate({ pathname: '/campaigns', search: '?' + search }, { replace });
    setCopy(null);
  };
  const reset = () => {
    navigate({ pathname: '/campaigns', search: '?' + encodeCampaignFilters(defaultCampaignFilters()) });
    setCopy(null);
  };
  const share = async () => {
    if (!valid) return;
    const key = location.search;
    const url = campaignShareUrl(filters, document.baseURI);
    try {
      await navigator.clipboard.writeText(url);
      setCopy({ key, message: '目录链接已复制，包含名称、地区、类型、首发内容包和排序。' });
    } catch {
      setCopy({ key, message: '自动复制失败，请手动复制下方完整链接。', link: url });
    }
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
          支持中英文名称与已整理别名，最多<span className="campaign-nowrap">{CAMPAIGN_QUERY_LIMIT}个字符</span>。
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
      {copyState && <p role="status">{copyState.message}</p>}
      {copyState?.link && (
        <label className="campaign-manual">
          手动复制目录链接
          <textarea readOnly rows={3} value={copyState.link} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
      <aside className="campaign-coverage" aria-label="收录范围">
        <p>
          首批<span className="campaign-nowrap">10项</span>：华莱士教程、国王时代<span className="campaign-nowrap">4个战役</span>、征服者
          <span className="campaign-nowrap">3个战役</span>与<span className="campaign-nowrap">2场历史战役</span>。并非完整目录。
        </p>
        <p>Chronicles（编年史）、Return of Rome（罗马归来）、孙子兵法、其他战役、合作变体与社区模组暂未收录。</p>
      </aside>
      {valid && (
        <>
          <p className="campaign-count" role="status">
            当前
            <span className="campaign-nowrap">
              {entries.length} / {CAMPAIGNS.length}项
            </span>
            。{filters.sort === 'history' ? '按已核实起始年排列，重叠区间照实保留。' : '按首发年排列，同年按稳定条目编号排序。'}
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
        <summary>怎样理解年代、剑级与首发顺序</summary>
        <p>游戏覆盖年代来自开发方战役时间表，描述游戏剧情所跨越的区间，不是英雄生卒年，也不宣称剧情严格等同史实。区间可以重叠；排序仅提供查找方式。</p>
        <p>首发内容包表示历史上的首次发行。当前包含关系与购买条件请查看内容导航；年代排序与首发顺序彼此独立，缺失年份排在末尾，同年按稳定条目编号排序。</p>
        <p>官方剑级是战役挑战标记，与进入游戏时选择的标准、中等、困难不同。本批尚无逐条官方剑级证据，均显示“未提供”，不表示零剑或最容易。</p>
        <p>地区是本站按剧情地点归纳的标签，可跨洲；它不是游戏战役菜单的位置。</p>
        <Source source={CAMPAIGN_CATALOG.sources['official-swords']!} />
      </details>
      <details className="campaign-boundaries">
        <summary>资料核对范围与版本限制</summary>
        <p>{CAMPAIGN_CATALOG.versionNote}</p>
        <p>
          资料核对于<span className="campaign-nowrap">{CAMPAIGN_CATALOG.verifiedAt}</span>
          。仅收录已列明的条目，不提供逐关攻略、剧情剧透、主观难度总榜或成就与存档同步。
        </p>
      </details>
    </section>
  );
}
