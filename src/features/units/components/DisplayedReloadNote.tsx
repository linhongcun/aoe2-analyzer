import { Link } from 'react-router-dom';
import { DATA_PATCH } from '../../../data/sources';
import type { Unit } from '../../../domain/types';
import { Icon } from '../../../shared/ui/Icon';

const displaySeconds = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 5, useGrouping: false });

export function DisplayedReloadNote({ unit, hasAttack }: { unit: Pick<Unit, 'rof' | 'displayedReloadTime'>; hasAttack: boolean }) {
  const { rof, displayedReloadTime } = unit;
  if (
    !Number.isFinite(rof) ||
    typeof displayedReloadTime !== 'number' ||
    !Number.isFinite(displayedReloadTime) ||
    Math.abs(rof - displayedReloadTime) <= 1e-5
  ) {
    return null;
  }
  const base = <span className="num nw">{rof} 秒</span>;
  const displayed = <span className="num nw">{displaySeconds.format(displayedReloadTime)} 秒</span>;
  const version = <span className="num nw">DE {DATA_PATCH.build}</span>;

  return (
    <div className="ud-rof-diff">
      <div className="ud-rof-diff-title">
        <Icon name="info" />
        <span>
          {hasAttack ? (
            <>
              攻击间隔口径对照 · 固定 DAT 显示用字段：<strong>{displayed}</strong>
            </>
          ) : (
            <>
              攻击间隔静态字段对账 · 固定 DAT：
              <strong>
                <span className="nw">基础 {base}</span> / <span className="nw">显示用 {displayed}</span>
              </strong>
            </>
          )}
        </span>
      </div>
      <p>
        {hasAttack ? (
          <>
            本站目录与计算取基础重装填间隔（{base}）；{displayed} 为固定 DAT 显示用字段（{version}），未经同版客户端实测，不称作游戏面板保证读数。
          </>
        ) : (
          <>本单位无普通攻击，两组秒数仅作 {version} 固定 DAT 静态字段对照（未经同版客户端实测），均不代表招降或治疗速度。</>
        )}
        {' · '}
        <Link to="/about-data">数据说明</Link>
      </p>
    </div>
  );
}
