/** Preserve original copy while keeping numeric fragments together on narrow screens. */
export function CompareNumberText({ text }: { text: string }) {
  return text.split(/(\d+(?:[.,–-]\d+)*(?:\s*(?:%|秒|个|座|食物|黄金|木材|石料))?)/g).map((part, index) =>
    index % 2 ? (
      <span className="num nw" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}
