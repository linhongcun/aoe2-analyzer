import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { contextPath } from '../../shared/nav/context';
import { NavigationContext } from '../../shared/ui/NavigationContext';
import { TRAIN_COMPARE_ENTRY } from './trainCompareCodec';
import { CompareNumberText } from './CompareNumberText';

export function ProductionCompareError({ errors }: { errors: string[] }) {
  const location = useLocation(),
    navigate = useNavigate();
  const [raw, setRaw] = useState(location.search);
  return (
    <section className="pane train-compare-page">
      <h1>跨文明训练对照</h1>
      <NavigationContext />
      <div role="alert">
        <p>对照链接无法完整恢复，未生成结果。</p>
        <ul>
          {errors.map((error) => (
            <li key={error}>
              <CompareNumberText text={error} />
            </li>
          ))}
        </ul>
      </div>
      <form
        className="train-compare-error-form"
        onSubmit={(event) => {
          event.preventDefault();
          navigate({ pathname: '/production', search: raw.startsWith('?') ? raw : '?' + raw });
        }}
      >
        <label>
          原始对照参数
          <textarea aria-label="原始对照参数" value={raw} onChange={(event) => setRaw(event.target.value)} rows={4} />
        </label>
        <div className="train-compare-actions">
          <button className="btn" type="submit">
            应用参数
          </button>
          <button className="btn" type="button" onClick={() => navigate(contextPath(TRAIN_COMPARE_ENTRY, location.search))}>
            重置对照
          </button>
          <button className="btn" type="button" disabled>
            复制对照链接
          </button>
        </div>
      </form>
    </section>
  );
}
