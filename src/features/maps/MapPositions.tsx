import { Link } from 'react-router-dom';
import { civByEn } from '../../data';
import { CivIcon } from '../../shared/ui/art';
import FeedbackLink from '../../shared/ui/FeedbackLink';
import { Icon } from '../../shared/ui/Icon';
import { mapPosTips, type MapPosTip } from './positions';

const SIDES = [
  { id: 'flank', title: '边路推荐', en: 'Flank', empty: '边路推荐待补' },
  { id: 'pocket', title: '中路推荐', en: 'Pocket', empty: '中路推荐待补' },
] as const;

function PosRows({ tips }: { tips: MapPosTip[] }) {
  return tips.map((tip) => {
    const civ = civByEn(tip.civ);
    if (!civ) return null;
    return (
      <Link className="map-pos-row" key={civ.en} to={`/civ/${civ.en}`}>
        <CivIcon alt="" c={civ} />
        <span className="map-pos-who">
          <span className="map-pos-zh">{civ.zh}</span>
          <span className="map-pos-en nw" lang="en">
            {civ.en}
          </span>
        </span>
        <span className="map-pos-why">{tip.reason}</span>
      </Link>
    );
  });
}

export function MapPositions({ mapId }: { mapId: string }) {
  return (
    <section className="map-positions" data-testid="map-positions" aria-label="边路与中路推荐">
      <div className="map-pos-meta">
        <span className="map-pos-mode" data-testid="map-pos-mode">
          适用：<span className="nw">开图 4v4</span>
        </span>
        <p className="map-pos-disc" data-testid="map-pos-disclaimer">
          <Icon name="info" />
          编辑口径，非官方推荐
        </p>
      </div>
      <div className="map-pos-cols">
        {SIDES.map((side) => {
          const tips = mapPosTips(mapId, side.id);
          return (
            <div className="map-pos-col" data-testid={`map-pos-${side.id}`} key={side.id}>
              <h3>
                {side.title}{' '}
                <span className="map-pos-kicker" lang="en">
                  {side.en}
                </span>
              </h3>
              {tips.length > 0 ? (
                <PosRows tips={tips} />
              ) : (
                <div className="map-pos-empty" data-testid="map-pos-empty" role="status">
                  <Icon name="inbox" />
                  <p>{side.empty}</p>
                  <FeedbackLink kind="data" label="反馈数据缺口" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
