import { ProductionWarningText } from '../../shared/ui/ProductionWarningText';

function renderCompareNumbers(segment: string) {
  return segment.split(/(\d+(?:[.,–-]\d+)*(?:\s*(?:%|秒|个|座|食物|黄金|木材|石料))?)/g).map((part, index) =>
    index % 2 ? (
      <span className="num nw" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/** Preserve original copy while keeping numeric fragments and merged bonus labels together on narrow screens. */
export function CompareNumberText({ text }: { text: string }) {
  return <ProductionWarningText text={text} renderPlain={renderCompareNumbers} />;
}
