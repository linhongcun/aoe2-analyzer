import type { ReactNode } from 'react';
import { DLCS } from '../../../domain/dlc';
import { DlcImg } from '../../../shared/ui/art';

export default function TechReleaseBar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const button = (release: string, label: ReactNode) => (
    <button
      type="button"
      key={release}
      data-v={release}
      className={value === release ? 'on' : undefined}
      aria-pressed={value === release}
      onClick={() => onChange(release)}
    >
      {label}
    </button>
  );
  return (
    <div className="dbar" role="group" aria-label="科技首发版本快捷筛选">
      {button('', '全部')}
      {DLCS.map((_, index) => button(String(index), <DlcImg i={index} />))}
      {button('update', '免费更新')}
      {button('none', '未标注')}
    </div>
  );
}
