import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { arenaCastleGold, type ArenaCastleGold as ArenaCastleGoldCard, type ArenaGoldLine } from '../arenaCastleGold';
import { Icon } from '../../../shared/ui/Icon';

function Chunks({ line }: { line: ArenaGoldLine }) {
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

function GoldValue({ line }: { line: ArenaGoldLine }) {
  return (
    <dd data-field={line.id} data-pending={line.pending ? 'true' : undefined}>
      <Chunks line={line} />
    </dd>
  );
}

/** 只挂在三个文明详情的概览。其他文明、加成列表和工具页不渲染。 */
export function ArenaCastleGold({ en }: { en: string }) {
  const card = arenaCastleGold(en);
  if (!card) return null;
  return <ArenaCastleGoldView card={card} />;
}

export function ArenaCastleGoldView({ card }: { card: ArenaCastleGoldCard }) {
  return (
    <section className="detail-section civ-arena-gold" aria-label={card.title} data-testid="arena-castle-gold" data-civ={card.civ}>
      <h2>
        <Icon name="scale" className="ic" />
        {card.title}
      </h2>
      <p>{card.summary}</p>
      <dl className="detail-cost-grid">
        {card.lines.map((line) => (
          <div key={line.id}>
            <dt>{line.label}</dt>
            <GoldValue line={line} />
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
