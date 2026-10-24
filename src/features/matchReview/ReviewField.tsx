import { MATCH_REVIEW_LIMITS as limits, reviewTextLength, reviewTextProblem } from '../../domain/matchReview';

interface FieldProps {
  id: string;
  label: string;
  value: string;
  limit?: number;
  multiline?: boolean;
  problem?: string | null;
  hint?: string;
  onChange: (value: string) => void;
}
export function Field({ id, label, value, limit = limits.long, multiline = false, problem, hint, onChange }: FieldProps) {
  const error = reviewTextProblem(value, limit, multiline) ?? problem;
  const attributes = {
    id,
    value,
    'aria-invalid': !!error,
    'aria-describedby': id + '-help' + (error ? ' ' + id + '-error' : ''),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
  };
  return (
    <div className="mr-field">
      <label htmlFor={id}>{label}</label>
      {multiline ? <textarea {...attributes} rows={3} /> : <input {...attributes} type="text" autoComplete="off" />}
      <small id={id + '-help'}>
        {hint ? hint + ' ' : ''}
        <span className="mr-number">{`${reviewTextLength(value)} / ${limit}`}</span> 个字符
      </small>
      {error && (
        <p id={id + '-error'} className="mr-error">
          {error}
        </p>
      )}
    </div>
  );
}
