import { Fragment, type ReactNode } from 'react';

const EXTRA_DETAIL_RE = /(（该加成另含[^）]+）)/g;
const EXTRA_PREFIX = '（该加成另含';

/** 持续生产告警中的「（该加成另含…）」逐项整体套 .num.nw，避免窄屏将带空格的数值标签拆行。 */
export function ProductionWarningText({ text, renderPlain }: { text: string; renderPlain?: (segment: string) => ReactNode }) {
  const parts = text.split(EXTRA_DETAIL_RE);
  return (
    <>
      {parts.map((part, idx) => {
        if (idx % 2 === 1 && part.startsWith(EXTRA_PREFIX) && part.endsWith('）')) {
          const labels = part.slice(EXTRA_PREFIX.length, -1).split('、');
          return (
            <Fragment key={idx}>
              {EXTRA_PREFIX}
              {labels.map((label, labelIdx) => (
                <Fragment key={labelIdx}>
                  {labelIdx > 0 && '、'}
                  <span className="num nw">{label}</span>
                </Fragment>
              ))}
              ）
            </Fragment>
          );
        }
        return <Fragment key={idx}>{renderPlain ? renderPlain(part) : part}</Fragment>;
      })}
    </>
  );
}
