import './stat-methods.css';

/** 固定快照的公开统计口径，只说明已有字段，不估算缺失数据。 */
export function LadderStatMethods({ playerSample, interval }: { playerSample: boolean; interval: boolean }) {
  return (
    <div className="ladder-stat-methods" role="note" aria-label="统计口径" data-testid="ladder-stat-methods">
      <p>胜率、出场率按快照原值展示；技能校正数据未收录。</p>
      <p>
        {playerSample ? '样本为玩家出场人次，不是完整对局数。' : '样本单位按当前快照说明。'}{' '}
        {interval ? (
          <>
            <span className="num nw">95%</span> 区间来自快照提供的 <span lang="en">Wilson</span> 置信区间。
          </>
        ) : (
          '本快照未收录置信区间，不作估算。'
        )}
      </p>
    </div>
  );
}
