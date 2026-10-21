import { useLocation } from 'react-router-dom';
import { sectionOf } from '../../../shared/nav/sections';
import { Icon } from '../../../shared/ui/Icon';
import { ListHead } from '../../../shared/ui/layout';

/** 规划中模块的扩展位占位页 */
export default function Planned() {
  const s = sectionOf(useLocation().pathname);
  return (
    <section className="pane planned-page">
      <ListHead title={s?.label ?? '规划中'} desc={s?.en ?? ''} />
      <div className="posbox">
        <h3>{s && <Icon name={s.icon} />} 该模块规划中</h3>
        <p>{s?.desc}</p>
        <p className="note">详见 docs/IA-REDESIGN.md 的扩展位设计。</p>
      </div>
    </section>
  );
}
