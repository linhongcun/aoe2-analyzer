import { CIV_HISTORY, type CivHistoryEntry } from '../history';
import './civ-history.css';

function HistoryText({ text }: { text: string }) {
  return text.split(/(\d+(?:[–—-]\d+)?(?:年|世纪)?)/u).map((part, index) =>
    /^\d/u.test(part) ? (
      <span key={index} className="num nw">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function CivHistory({ civ, entry = CIV_HISTORY[civ] }: { civ: string; entry?: CivHistoryEntry }) {
  return (
    <article className="detail-section civ-history" aria-label="文明历史" data-testid="civ-history">
      <h2>文明历史</h2>
      {entry ? (
        <>
          <p className="civ-history-lead">
            <HistoryText text={entry.summary} />
          </p>
          <p className="civ-history-note">根据官方资料整理的中文摘要</p>
          {entry.paragraphs.length > 0 && (
            <details className="civ-history-more" key={civ}>
              <summary>展开历史背景</summary>
              {entry.paragraphs.map((paragraph) => (
                <p key={paragraph}>
                  <HistoryText text={paragraph} />
                </p>
              ))}
            </details>
          )}
          <footer className="civ-history-source">
            <a href={entry.source.url}>官方原文 · {entry.source.label}</a>
            <span>
              核对于{' '}
              <time className="num nw" dateTime={entry.checkedOn}>
                {entry.checkedOn}
              </time>
            </span>
          </footer>
        </>
      ) : (
        <p className="civ-history-note">该文明的官方历史资料仍在核对中。</p>
      )}
    </article>
  );
}
