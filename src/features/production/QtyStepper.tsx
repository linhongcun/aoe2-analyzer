/** 内联数量步进器（Issue 1281）：保留直接键盘输入，非法手工输入由纯函数确定性恢复。 */
import { canStepQuantity, stepQuantity, type QtyStepBounds } from '../../domain/qtyStepper';
import { Icon } from '../../shared/ui/Icon';
import './qtyStepper.css';

export interface QtyStepperProps {
  id: string;
  value: string;
  bounds: QtyStepBounds;
  inputLabel: string;
  decrementLabel: string;
  incrementLabel: string;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  describedBy?: string;
  onChange: (next: string) => void;
}

export function QtyStepper({
  id,
  value,
  bounds,
  inputLabel,
  decrementLabel,
  incrementLabel,
  placeholder,
  invalid,
  disabled,
  describedBy,
  onChange,
}: QtyStepperProps) {
  const isInvalid = invalid === true;
  return (
    <div className={isInvalid ? 'qty-stepper is-invalid' : 'qty-stepper'}>
      <button
        type="button"
        className="qty-stepper-btn"
        aria-label={decrementLabel}
        disabled={disabled || !canStepQuantity(value, -1, bounds)}
        onClick={() => onChange(stepQuantity(value, -1, bounds))}
      >
        <Icon name="minus" />
      </button>
      <input
        id={id}
        className="qty-stepper-input num nw"
        type="text"
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={inputLabel}
        aria-invalid={isInvalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="qty-stepper-btn"
        aria-label={incrementLabel}
        disabled={disabled || !canStepQuantity(value, 1, bounds)}
        onClick={() => onChange(stepQuantity(value, 1, bounds))}
      >
        <Icon name="plus" />
      </button>
    </div>
  );
}
