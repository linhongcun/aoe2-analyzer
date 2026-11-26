/** issue 275 / 1454：文案里的「数字 + 单位」（如「2 座」「29 村民」「1 食物」「1辆」「3 民兵」「8套」）包成不可断行的片段，窄屏不在数字和单位之间换行 */
const NUM_UNIT = /(\d+(?:\.\d+)?\s*(?:名村民|个村民|人口|村民|民兵|分钟|食物|木材|黄金|石料|名|个|座|头|只|人|格|步|秒|艘|辆|块|套|木|食|金|石))/g;

export function NumUnitText({ text = '' }: { text?: string }) {
  return text.split(NUM_UNIT).map((part, index) =>
    index % 2 ? (
      <span className="nw" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}
