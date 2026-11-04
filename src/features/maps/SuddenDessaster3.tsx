import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SD3_CHECKED_AT, SD3_MAPS, SD3_SOURCE } from './suddenDessaster3';
import './sudden-dessaster.css';

const normalize = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

export default function SuddenDessaster3() {
  const [query, setQuery] = useState('');
  const term = normalize(query);
  const maps = SD3_MAPS.filter((map) => [map.en, map.name, map.id].some((name) => normalize(name).includes(term)));
  return (
    <details className="sd3-collection" data-testid="sd3-collection">
      <summary>
        SD3 猝死赛事图合集 · <span className="num nw">{SD3_MAPS.length} 张</span>
      </summary>
      <div className="sd3-body">
        <h3>SD3 猝死赛事图</h3>
        <p>以下是 Sudden Dessaster 3 赛事版本，不表示当前天梯图池或平衡结论。不能另建城镇中心，最后一座城镇中心被毁即败。</p>
        <p className="note">
          描述据{' '}
          <a href={SD3_SOURCE} target="_blank" rel="noopener noreferrer">
            主办方赛事公开手册
          </a>
          ，于{' '}
          <time className="nw" dateTime={SD3_CHECKED_AT}>
            {SD3_CHECKED_AT}
          </time>{' '}
          核对。中文为本站检索译名，英文名沿用赛事手册；规则仅适用于该图包，不套用于同名标准地图。
        </p>
        <div className="sd3-controls">
          <label className="sd3-search">
            <span>搜索猝死赛事地图</span>
            <input type="search" value={query} placeholder="圣谷、Holy Hollow、猴岛" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button type="button" onClick={() => setQuery('')}>
            清除赛事搜索
          </button>
        </div>
        <p role="status" className="note">
          {maps.length ? (
            <>
              赛事地图{' '}
              <span className="num nw">
                {maps.length} / {SD3_MAPS.length} 张
              </span>
            </>
          ) : (
            '没有匹配的赛事地图，请换一个名称或清除赛事搜索。'
          )}
        </p>
        <ul className="sd3-cards">
          {maps.map((map) => (
            <li className="sd3-card" key={map.id} data-sd3-id={map.id}>
              <h4>
                {map.name} <span className="sd3-english">{map.en}</span>
              </h4>
              <p className="sd3-preview">暂无预览</p>
              <p className="sd3-tip">{map.tip}</p>
            </li>
          ))}
        </ul>
        <div className="sd3-tool">
          <Link to="/siege?unit=1258&n=1&bldg=109">用攻城拆建筑估算拆主城</Link>
          <p className="note">工具按站内固定 DE 版本估算普通城镇中心，不模拟赛事特殊机关或多主城失败条件。</p>
        </div>
      </div>
    </details>
  );
}
