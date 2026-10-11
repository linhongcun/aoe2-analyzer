import { Component, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { CircleAlert, RotateCw } from 'lucide-react';

/** 时间线加载失败（数据分包取不到）或计算出错时的状态：说明 + 重试，不留白屏 */
function TimelineError({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="pane tl" id="builds" data-t="timeline-error">
      <div className="tl-error" role="alert">
        <CircleAlert size={20} aria-hidden />
        <div>
          <b>时间线没能加载出来</b>
          <p className="note">可能是网络不稳定或数据下载失败，重试一下通常就好。</p>
        </div>
        <button type="button" className="tl-primary tl-retry" onClick={onRetry}>
          <RotateCw size={16} aria-hidden /> 重试
        </button>
      </div>
    </section>
  );
}

class Boundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** 按需加载时间线页（含 eco/units 数据）；失败可重试 */
export default function TimelineLoader() {
  const [attempt, setAttempt] = useState(0);
  const [View, setView] = useState<ComponentType | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    import('./BuildTimelineView').then((m) => live && setView(() => m.default)).catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [attempt]);
  const retry = () => {
    setFailed(false);
    setView(null);
    setAttempt((a) => a + 1);
  };
  if (failed) return <TimelineError onRetry={retry} />;
  if (!View)
    return (
      <p className="note" role="status" data-t="timeline-loading">
        正在计算时间线…
      </p>
    );
  return (
    <Boundary key={attempt} onError={() => setFailed(true)}>
      <View />
    </Boundary>
  );
}
