import { useEffect, useRef } from 'react';

export function MixedExitConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      className="mix-dialog"
      ref={dialog}
      aria-labelledby="mix-switch-title"
      aria-describedby="mix-switch-desc"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id="mix-switch-title">切回单兵种？</h2>
      <p id="mix-switch-desc">仅保留双方当前第一行、数量和共享上下文；其余行与本次混编结果将丢弃。取消可继续编辑。</p>
      <div className="bar">
        <button type="button" autoFocus onClick={onCancel}>
          取消，继续混编
        </button>
        <button type="button" className="pri" onClick={onConfirm}>
          确认，仅保留各第一行
        </button>
      </div>
    </dialog>
  );
}
