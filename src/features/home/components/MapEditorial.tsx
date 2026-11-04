import { Link } from 'react-router-dom';
import type { MapGuide } from '../../../domain/mapGuides';
import { pickCiv, type StartState } from '../../../domain/startGame';
import { CivRow, type Update } from './startGameEarly';

export default function MapEditorial({ guide, state, onChange }: { guide: MapGuide; state: StartState; onChange: Update }) {
  return (
    <section data-testid="start-editorial" aria-labelledby="start-editorial-h">
      <p className="start-ask-title" id="start-editorial-h">
        地图编辑参考
      </p>
      <p className="start-why">当前条件暂无机制建议；模式、地图或路位的机制场景尚未覆盖。以下为地图通用编辑参考，不按本局模式或路位计算，也不是胜率。</p>
      <p className="start-hint">{guide.opening.replace('下面的', '地图页的')}</p>
      {guide.civs.map(([en, reason]) => (
        <CivRow key={en} en={en} reason={reason} pressed={state.choice.civ === en} onPick={() => onChange((current) => pickCiv(current, en))} />
      ))}
      <p className="start-hint">
        参考来源：
        {guide.sources.map(([label, url]) => (
          <a key={url} className="start-link" href={url} target="_blank" rel="noreferrer">
            {label}
          </a>
        ))}
      </p>
      <Link className="start-link" to="/maps">
        查看地图攻略（需在页内选图）
      </Link>
    </section>
  );
}
