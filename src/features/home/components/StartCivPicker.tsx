import { useEffect, useState, type ComponentType } from 'react';
import type { CivPickerProps } from '../../../shared/ui/CivPicker';

type PickerModule = { CivPicker: ComponentType<CivPickerProps> };
const loadPicker = () => import('../../../shared/ui/CivPicker');

/** Keep the shared picker's search index outside the initial Home bundle. */
export default function StartCivPicker({ load = loadPicker, ...props }: CivPickerProps & { load?: () => Promise<PickerModule> }) {
  const [attempt, retry] = useState(0);
  const [loaded, setLoaded] = useState<PickerModule | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void load()
      .then((module) => {
        if (live) setLoaded(module);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [attempt, load]);
  if (loaded) return <loaded.CivPicker {...props} />;
  if (failed)
    return (
      <p role="alert">
        文明选项加载失败，已填信息保留。
        <button
          type="button"
          className="start-btn"
          onClick={() => {
            setFailed(false);
            retry((n) => n + 1);
          }}
        >
          重试文明选项
        </button>
      </p>
    );
  return <p role="status">正在加载文明选项…</p>;
}
