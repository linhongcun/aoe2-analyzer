const number = String.raw`[+＋−-]?\d+(?:\.\d+)?(?:\s*\/\s*[+＋−-]?\d+(?:\.\d+)?)*`;
const unit = String.raw`%|个村民|人口空间|生命值|每分钟|秒|分钟|木材|食物|黄金|石料|资源|头绵羊|个模板|格范围内|格范围|射程|攻击力|护甲|格|片果树丛|片|个单位|个`;
const quantities = new RegExp(`(${number}(?:\\s*(?:${unit}))?)`, 'g');

export function CivBonusText({ text }: { text: string }) {
  return text.split(quantities).map((part, index) =>
    index % 2 ? (
      <span className="num nw" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}
