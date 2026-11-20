import { Link } from 'react-router-dom';
import { civByEn } from '../../../data';
import type { MixedSideInput } from '../../../domain/mixedDuelParams';
import { AGE_ZH } from '../../../domain/ratings';
import { productionTransferState } from '../../../shared/utils/productionTransferState';
import { Icon } from '../../../shared/ui/Icon';
import type { MixedTrainingTransfer } from '../logic/mixedTrainingTransfer';

const rowField = /-(qty|unit)-(\d+)$/;

export function MixedTrainingAction({
  side,
  input,
  transfer,
  focusField,
}: {
  side: 'a' | 'b';
  input: MixedSideInput;
  transfer: MixedTrainingTransfer;
  focusField: (id: string) => void;
}) {
  const label = `${side.toUpperCase()} 方`;
  const titleId = `mix-${side}-training-title`;
  return (
    <aside className="mix-training" aria-labelledby={titleId}>
      <div>
        <strong id={titleId}>{'to' in transfer ? '将带入' : `暂不能带入 ${label}`}</strong>
        <p className="note">
          {civByEn(input.civ)?.zh ?? '文明待选择'} · {AGE_ZH[Number(input.age)] ?? '时代待确认'} · <span className="num nw">{input.rows.length} 行</span>
        </p>
      </div>
      {'to' in transfer ? (
        <Link className="btn mix-training-link" to={transfer.to} state={productionTransferState(transfer.notice)}>
          <Icon name="calculator" />
          计算 {label}训练费用
        </Link>
      ) : (
        <ul>
          {transfer.errors.map(({ field, message }, index) => {
            const row = rowField.exec(field);
            const action = row ? `修改第 ${Number(row[2]) + 1} 行${row[1] === 'qty' ? '数量' : '单位'}` : '查看需修正的字段';
            return (
              <li key={index}>
                {message}
                {field && (
                  <>
                    {' '}
                    <button type="button" className="mix-error-link" onClick={() => focusField(field)}>
                      {action}
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
