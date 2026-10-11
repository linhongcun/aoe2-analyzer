import { TriangleAlert } from 'lucide-react';
import type { Anomaly } from '../../domain/buildSim';
import { ROW_SEG_MAX, segLabel, type RowSeg } from './timelineModel';

/** 步骤行的卡点：每段一行，最多 ROW_SEG_MAX 行；超过时最后一行写「另有 N 段等待」，折叠的段仍带 data-start/data-end（#51） */
export function RowSegs({ segs, tOut }: { segs: RowSeg<Anomaly>[]; tOut: number }) {
  const shown = segs.length > ROW_SEG_MAX ? segs.slice(0, ROW_SEG_MAX - 1) : segs;
  const rest = segs.slice(shown.length);
  return (
    <>
      {shown.map((x, k) => {
        const label = segLabel(x, tOut);
        const cut = label.lastIndexOf(' · ');
        return (
          <span key={k} className="rl" data-t="row-seg" data-type={x.a.type} data-start={x.start} data-end={x.end}>
            {k === 0 && <TriangleAlert size={14} aria-hidden />}
            <span className="rr">{cut > 0 ? label.slice(0, cut) : label}</span>
            {cut > 0 && <span className="rd">{label.slice(cut)}</span>}
          </span>
        );
      })}
      {rest.length > 0 && (
        <span className="rl" data-t="row-seg-more">
          <span className="rr">另有 {rest.length} 段等待</span>
          {rest.map((x, k) => (
            <span key={k} hidden data-t="row-seg" data-type={x.a.type} data-start={x.start} data-end={x.end} />
          ))}
        </span>
      )}
    </>
  );
}
