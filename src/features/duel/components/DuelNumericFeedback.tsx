/**
 * issue 1483：单兵种单位 PK 数值输入的三类反馈视图：
 * 1. 顶部外部非法深链一次性调整提示（role="status"）；
 * 2. 字段旁就近整宽报错列表（不含 role="alert"）；
 * 3. 结果区暂停计算错误状态卡（整页唯一 role="alert"）。
 */
import { Fragment } from 'react';
import type { DuelNumericAdjustment, DuelNumericKey } from '../../../domain/duelParams';
import { Icon } from '../../../shared/ui/Icon';
import { DUEL_NUMERIC_META, type DuelNumericError } from '../logic/duelNumericDraft';

export function DuelNumericField({
  fieldKey,
  label,
  value,
  invalid,
  onChange,
}: {
  fieldKey: DuelNumericKey;
  label: string;
  value: string;
  invalid: boolean;
  onChange: (key: DuelNumericKey, raw: string) => void;
}) {
  const meta = DUEL_NUMERIC_META[fieldKey];
  return (
    <label>
      {label}{' '}
      <input
        id={meta.inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={invalid ? 'num duel-num-input is-invalid' : 'num duel-num-input'}
        value={value}
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={invalid ? meta.errorId : undefined}
        onChange={(e) => onChange(fieldKey, e.target.value)}
      />
    </label>
  );
}

export function DuelParamAdjustedNotice({ items }: { items: readonly DuelNumericAdjustment[] }) {
  if (!items.length) return null;
  return (
    <p className="duel-param-adjusted" role="status" data-t="duel-param-adjusted">
      <Icon name="info" className="ic" />
      <span>
        链接中的数值参数无效或越界，已调整为{' '}
        {items.map((item, idx) => (
          <Fragment key={item.key}>
            {idx > 0 && '、'}
            <span className="nw">
              {DUEL_NUMERIC_META[item.key].paramLabel} <span className="num">{item.value}</span>
            </span>
          </Fragment>
        ))}
        ；地址栏已写成实际使用的参数。
      </span>
    </p>
  );
}

export function DuelFieldErrors({ errors }: { errors: readonly DuelNumericError[] }) {
  if (!errors.length) return null;
  return (
    <div className="duel-field-errors">
      <div className="duel-field-errors-list">
        {errors.map((err) => (
          <p key={err.key} id={err.errorId} className="duel-field-error">
            <Icon name="triangle-alert" className="ic" />
            <span>
              {err.errorPrefix}
              <span className="num nw">{err.rangeText}</span> 的整数。
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

export function DuelInputInvalidCard({ errors }: { errors: readonly DuelNumericError[] }) {
  return (
    <section id="duel-input-invalid" className="posbox duel-input-invalid" data-t="duel-input-invalid" role="alert" aria-labelledby="duel-input-invalid-title">
      <h2 id="duel-input-invalid-title" className="duel-input-invalid-title">
        <Icon name="triangle-alert" className="ic" />
        <span>输入有误，暂不计算</span>
      </h2>
      <p className="duel-input-invalid-desc">请修正以下参数后再查看对战结果：</p>
      <ul className="duel-input-invalid-list">
        {errors.map((err) => (
          <li key={err.key}>
            {err.errorPrefix}
            <span className="num nw">{err.rangeText}</span> 的整数。
          </li>
        ))}
      </ul>
    </section>
  );
}
