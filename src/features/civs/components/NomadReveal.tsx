import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { nomadReveal, type NomadReveal as NomadRevealCard, type NomadRevealLine } from '../nomadReveal';
import { Icon } from '../../../shared/ui/Icon';

function Chunks({ line }: { line: NomadRevealLine }) {
  return line.parts.map((part, index) => {
    if (part.kind === 'text') return <span key={index}>{part.text}</span>;
    return (
      <span className="nw" key={index}>
        {part.parts.map((item, itemIndex) =>
          item.kind === 'num' ? (
            <span className="num" key={itemIndex}>
              {item.text}
            </span>
          ) : (
            <span key={itemIndex}>{item.text}</span>
          ),
        )}
      </span>
    );
  });
}

/** 只挂在越南文明详情的概览。其他文明、加成详情和工具页不渲染。 */
export function NomadReveal({ en }: { en: string }) {
  const card = nomadReveal(en);
  if (!card) return null;
  return <NomadRevealView card={card} />;
}

export function NomadRevealView({ card }: { card: NomadRevealCard }) {
  return (
    <section
      className="detail-section civ-nomad-reveal"
      aria-label={card.title}
      data-testid="nomad-reveal"
      data-civ={card.civ}
      data-bonus-index={card.bonusIndex}
    >
      <h2>
        <Icon name="map" className="ic" />
        {card.title}
      </h2>
      <p>{card.summary}</p>
      <dl className="detail-cost-grid">
        {card.lines.map((line) => (
          <div key={line.id}>
            <dt>{line.label}</dt>
            <dd data-field={line.id} data-pending={line.pending ? 'true' : undefined}>
              <Chunks line={line} />
            </dd>
          </div>
        ))}
      </dl>
      {card.notes.map((note) => (
        <p className="note" data-note={note.id} key={note.id}>
          {note.text}
        </p>
      ))}
      <div className="community-tool-row">
        {card.links.map((link) =>
          link.external ? (
            <a className="community-tool-entry" data-link={link.id} href={link.href} key={link.id} rel="noreferrer" target="_blank">
              {link.label}
              <Icon name="external-link" className="ic" />
            </a>
          ) : (
            <InternalLink href={link.href} id={link.id} key={link.id} label={link.label} />
          ),
        )}
      </div>
    </section>
  );
}

function InternalLink({ href, id, label }: { href: string; id: string; label: string }): ReactNode {
  return (
    <Link className="community-tool-entry" data-link={id} to={href}>
      {label}
    </Link>
  );
}
