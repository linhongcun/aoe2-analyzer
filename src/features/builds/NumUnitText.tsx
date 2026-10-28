/** issue 275：步骤文字里的「数字 + 单位」（如「2 座」「29 村民」「8 木」）包成不可断行的片段，360/375/390/1280 都不在数字和单位之间换行 */
const NUM_UNIT = /(\d+(?:\.\d+)?\s*(?:名村民|个村民|人口|村民|分钟|名|个|座|头|只|人|格|步|秒|艘|块|木|食|金|石))/g;
const CART_NUM_UNIT = /(\d+(?:\.\d+)?\s*(?:名村民|个村民|人口|村民|分钟|食物|木材|黄金|石料|名|个|座|头|只|人|格|步|秒|艘|辆|块|木|食|金|石))/g;

export function NumUnitText({ text = '', cartUnits = false }: { text?: string; cartUnits?: boolean }) {
  return text.split(cartUnits ? CART_NUM_UNIT : NUM_UNIT).map((part, index) =>
    index % 2 ? (
      <span className="nw" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}
