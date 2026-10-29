import { useEffect } from 'react';
import { DetailSection } from '../../../shared/ui/DetailBlocks';
import { PRO_SOURCES, readProSources } from '../proSources';
import './civ-professional-view.css';

function SourceUrl({ url }: { url: string }) {
  return (
    <p className="civ-pro-url note">
      {url.split(/(\d{4}-\d{2}-\d{2})/).map((part, index) =>
        /^\d{4}-\d{2}-\d{2}$/.test(part) ? (
          <span className="num nw" key={index}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </p>
  );
}

export default function CivProfessionalView({ catalogue = PRO_SOURCES }: { catalogue?: unknown }) {
  const state = readProSources(catalogue);
  useEffect(() => {
    // Native focus can leave the long label partially clipped when its center is visible.
    const tab = document.querySelector<HTMLElement>('#detail .dtabs [aria-selected="true"]');
    const scroller = tab?.parentElement;
    if (!tab || !scroller) return;
    const reveal = () => {
      const selected = tab.getBoundingClientRect();
      const clip = scroller.getBoundingClientRect();
      if (selected.right > clip.right - 4) scroller.scrollLeft += selected.right - clip.right + 4;
      else if (selected.left < clip.left + 4) scroller.scrollLeft += selected.left - clip.left - 4;
    };
    reveal();
    tab.addEventListener('focus', reveal);
    return () => tab.removeEventListener('focus', reveal);
  }, []);
  return (
    <DetailSection title="职业选手原始资料" className="civ-pro">
      <p className="note">概览与数据页的能力评分为本站综合参考。</p>
      <p>未摘录本文明的名次、档位或分数，请查看原视频了解完整观点。</p>
      {state.status === 'empty' && <p role="status">暂无已核对原链接</p>}
      {state.status === 'unavailable' && <p role="status">资料暂不可用</p>}
      {state.status === 'ready' &&
        state.sources.map((source) => (
          <article className="civ-pro-card" key={source.id} aria-label={`${source.author} 原视频`}>
            <div className="civ-pro-author">
              <strong>{source.author}</strong>
              <span className="tag">仅参考</span>
            </div>
            <h3>{source.originalTitle}</h3>
            <ul className="civ-pro-unknowns">
              <li>原视频发布日期未核实</li>
              <li>适用游戏版本未核实</li>
              <li>地图范围未核实</li>
            </ul>
            <p className="note">
              核对日期 <span className="num nw">{source.checkedAt}</span>
            </p>
            <div className="civ-pro-links">
              <div>
                <a className="ulink" href={source.originalUrl} target="_blank" rel="noopener noreferrer">
                  查看原视频
                </a>
                <SourceUrl url={source.originalUrl} />
              </div>
              <div>
                <a className="ulink" href={source.discoveryUrl} target="_blank" rel="noopener noreferrer">
                  查看发现索引
                </a>
                <SourceUrl url={source.discoveryUrl} />
                <p className="note">发现线索，索引日期不代表原视频发布日期。</p>
              </div>
            </div>
          </article>
        ))}
    </DetailSection>
  );
}
