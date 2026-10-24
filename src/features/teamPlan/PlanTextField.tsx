import { PLAN_LIMITS } from '../../domain/teamPlan';

export function TextField({
  label,
  value,
  onChange,
  max = PLAN_LIMITS.agreement,
  multiline = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max?: number;
  multiline?: boolean;
}) {
  return (
    <label className="tp-field">
      <span>{label}</span>
      <textarea aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} rows={multiline ? 2 : 1} />
      <small className="note">
        最多 <span className="tp-number">{max}</span> 个字符
      </small>
    </label>
  );
}
