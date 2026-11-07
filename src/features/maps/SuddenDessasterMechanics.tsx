import { Icon } from '../../shared/ui/Icon';
import {
  SD3_MECHANICS,
  SD3_MECHANICS_CHECKED_AT,
  SD3_MECHANICS_LEAD,
  SD3_MECHANICS_LINK,
  SD3_MECHANICS_SOURCE_NOTE,
  SD3_SOURCE,
  mechanicPieces,
} from './sd3Mechanics';
import './sudden-dessaster.css';

function MechanicText({ text }: { text: string }) {
  return mechanicPieces(text).map((piece, index) =>
    piece.kind === 'num' ? (
      <span className="num nw" key={`${piece.kind}-${piece.value}-${index}`}>
        {piece.value}
      </span>
    ) : (
      <span key={`${piece.kind}-${index}`}>{piece.value}</span>
    ),
  );
}

export default function SuddenDessasterMechanics() {
  return (
    <details className="sd3-collection" data-testid="sd3-mechanics" open>
      <summary>
        猝死赛图特殊机制 · <span className="num nw">{SD3_MECHANICS.length} 张</span>
      </summary>
      <div className="sd3-body">
        <h3>
          <Icon name="map" />
          猝死赛图特殊机制
        </h3>
        <p>{SD3_MECHANICS_LEAD}</p>
        <ul className="sd3-cards">
          {SD3_MECHANICS.map((map) => (
            <li className="sd3-card" key={map.id} data-sd3-mechanic={map.id}>
              <h4>
                {map.name} <span className="sd3-english">{`${map.en} · ${map.author}`}</span>
              </h4>
              <ul>
                {map.facts.map((fact) => (
                  <li key={fact} data-kind="fact">
                    <MechanicText text={fact} />
                  </li>
                ))}
                {map.pending.map((item) => (
                  <li key={item} data-kind="pending">
                    {item}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <p className="note">
          据{' '}
          <a href={SD3_SOURCE} target="_blank" rel="noopener noreferrer">
            <Icon name="external-link" />
            {SD3_MECHANICS_LINK}
          </a>
          ，于{' '}
          <time className="num nw" dateTime={SD3_MECHANICS_CHECKED_AT}>
            {SD3_MECHANICS_CHECKED_AT}
          </time>{' '}
          核对。{SD3_MECHANICS_SOURCE_NOTE}
        </p>
      </div>
    </details>
  );
}
