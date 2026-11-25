import { Fragment } from 'react';
import { splitMechTagSegments } from '../../domain/civRankShared';

const NUM_TOKEN_RE = /([+×-]?\d+(?:\.\d+)?%?)/;

function renderWithNum(text: string) {
  return text.split(NUM_TOKEN_RE).map((part, i) =>
    part && /\d/.test(part) ? (
      <span key={i} className="num">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/**
 * 单位与建筑「各文明满科技对照」共用的 `.ucr-tag.is-mech` 分段渲染器（UX D.3）：
 * 每段语义短语独立包在 `.nw` 中（前缀 `未计入：` 与中点 ` ·` 贴附前段、保留文本空格与 `.num` 数字），
 * 360px 窄屏仅在段间自然折行，绝不在短语内断字。
 */
export function CivRankMechTag({ text }: { text: string }) {
  const segments = splitMechTagSegments(text);
  return (
    <span className="ucr-tag is-mech">
      {segments.map((seg, i) => (
        <Fragment key={i}>
          <span className="nw">{renderWithNum(seg.text)}</span>
          {seg.spaceAfter ? ' ' : null}
        </Fragment>
      ))}
    </span>
  );
}
