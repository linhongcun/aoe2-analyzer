type Props = { kind: 'base' } | { kind: 'filtered'; targetName: string; onClear: () => void } | { kind: 'partial' };

export function ReverseCounterEmptyState(props: Props) {
  if (props.kind === 'partial') {
    return (
      <p className="ud-reverse-empty" role="status">
        部分类别资料无法解析；当前结果不作为无匹配判断。
      </p>
    );
  }

  if (props.kind === 'filtered') {
    return (
      <div className="ud-reverse-empty-panel" role="status" data-t="reverse-counter-empty">
        <h3>当前筛选下无正贡献匹配</h3>
        <p>当前筛选没有类别贡献匹配。目录不计普通近战与穿刺伤害；目标仍为{props.targetName}，清除筛选可查看完整基础目录。</p>
        <button type="button" className="ud-btn" onClick={props.onClear}>
          清除筛选
        </button>
      </div>
    );
  }

  return (
    <div className="ud-reverse-empty-panel" role="status" data-t="reverse-counter-empty">
      <h3>基础目录未找到正贡献类别匹配</h3>
      <p>此目录只列正贡献类别匹配，不计普通近战与穿刺伤害；没有匹配不代表该单位没有实战克制。</p>
    </div>
  );
}
