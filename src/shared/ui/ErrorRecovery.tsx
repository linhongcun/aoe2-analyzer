import { Component, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  clearChunkReloadMarker,
  decideChunkReload,
  formatErrorDetail,
  isChunkLoadError,
  readChunkReloadState,
  type ReloadStorageLike,
} from '../../domain/chunkRecovery';
import { getCurrentHashPath, getSafeSessionStorage } from '../utils/chunkRecoveryBrowser';
import { Icon } from './Icon';
import '../styles/error-recovery.css';

export type ErrorRecoveryShell = 'route' | 'standalone';
export type ErrorRecoveryKind = 'chunk' | 'runtime';
export type ErrorReloadReason = 'already-retried' | 'storage-unavailable' | null;

export interface ErrorRecoveryViewProps {
  shell: ErrorRecoveryShell;
  kind: ErrorRecoveryKind;
  reloadReason: ErrorReloadReason;
  hashPath: string;
  error: unknown;
  onReload: () => void;
  onGoHome: () => void;
}

/** 同步打包进主包的中文错误恢复界面，不依赖任何懒加载分包（Issue 1278）。 */
export function ErrorRecoveryView({ shell, kind, reloadReason, hashPath, error, onReload, onGoHome }: ErrorRecoveryViewProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const isChunk = kind === 'chunk';
  const card = (
    <section className="er-card" role="alert" aria-labelledby={headingId} data-testid="error-recovery" data-error-kind={kind} data-error-shell={shell}>
      <span className={isChunk ? 'er-badge er-badge-warn' : 'er-badge er-badge-bad'}>
        <Icon name={isChunk ? 'triangle-alert' : 'circle-alert'} />
        <span>{isChunk ? '站点资源加载失败' : '页面运行出错'}</span>
      </span>

      <h1 id={headingId} ref={headingRef} tabIndex={-1} className="er-title">
        {isChunk ? '站点已更新，或页面资源暂时无法加载' : '页面加载遇到意外错误'}
      </h1>

      <p className="er-desc">
        {isChunk ? (
          reloadReason === 'already-retried' ? (
            <>
              站点可能刚刚发布了新版本，或当前网络出现波动，导致页面资源未能拉取。系统已自动尝试重新加载 <span className="num nw">1 次</span>
              ，仍未恢复。
            </>
          ) : (
            '站点可能刚刚发布了新版本，或当前网络出现波动，导致页面资源未能拉取。请手动刷新页面以获取最新资源。'
          )
        ) : (
          '当前页面在渲染时出现未预期异常，为避免整页空白已暂停显示。你可以刷新页面重试，或先返回首页使用其他工具。'
        )}
      </p>

      <div className="er-path-box">
        <span className="er-path-label">{isChunk ? '目标地址' : '当前地址'}</span>
        <code className="er-code">{hashPath}</code>
      </div>

      <div className="er-actions">
        <button type="button" className="er-btn er-btn-primary" onClick={onReload}>
          <Icon name="rotate-ccw" />
          <span>刷新页面</span>
        </button>
        <button type="button" className="er-btn er-btn-secondary" onClick={onGoHome}>
          <Icon name="home" />
          <span>返回首页</span>
        </button>
      </div>

      <p className="er-hint">
        {isChunk
          ? '刷新页面会获取站点最新资源并尽量停留在当前地址；若刷新后仍无法打开，请检查网络连接或稍后再试。'
          : '如果该问题持续复现，可以保留下方错误信息并在反馈页提交。'}
      </p>

      {!isChunk && (
        <details className="er-details" open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
          <summary className="er-summary">
            <span>查看错误详情（供排障参考）</span>
            <Icon name={detailsOpen ? 'chevron-up' : 'chevron-down'} />
          </summary>
          <div className="er-details-body">
            <p className="er-detail-line">
              <span className="er-detail-label">错误摘要</span>
              <code className="er-code">{formatErrorDetail(error)}</code>
            </p>
            <p className="er-detail-line">
              <span className="er-detail-label">当前路由</span>
              <code className="er-code">{hashPath}</code>
            </p>
          </div>
        </details>
      )}
    </section>
  );

  if (shell === 'standalone') {
    return (
      <div className="er-standalone">
        <header className="er-topbar">
          <a
            href="#/"
            className="er-brand"
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              onGoHome();
            }}
          >
            <Icon name="swords" className="ic hic" />
            <span>帝国时代 II 分析器</span>
          </a>
        </header>
        <main className="er-standalone-main">{card}</main>
      </div>
    );
  }

  return <div className="er-route-wrap">{card}</div>;
}

export interface ErrorBoundaryProps {
  children?: ReactNode;
  shell: ErrorRecoveryShell;
  /** 路由键变化时自动重置路由级边界，便于通过顶栏导航恢复。 */
  resetKey?: string;
  onGoHome?: () => void;
  onReload?: () => void;
  /** 仅用于单测注入存储与地址环境。 */
  getStorage?: () => ReloadStorageLike | null;
  getHashPath?: () => string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: unknown;
  kind: ErrorRecoveryKind;
  reloadReason: ErrorReloadReason;
  reloading: boolean;
  hashPath: string;
}

const INITIAL_STATE: ErrorBoundaryState = {
  hasError: false,
  error: null,
  kind: 'runtime',
  reloadReason: null,
  reloading: false,
  hashPath: '#/',
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = INITIAL_STATE;

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    const hashPath = getCurrentHashPath();
    if (!isChunkLoadError(error)) {
      return {
        hasError: true,
        error,
        kind: 'runtime',
        reloadReason: null,
        reloading: false,
        hashPath,
      };
    }
    const status = readChunkReloadState(getSafeSessionStorage(), hashPath);
    if (status === 'none') {
      return {
        hasError: true,
        error,
        kind: 'chunk',
        reloadReason: null,
        reloading: true,
        hashPath,
      };
    }
    return {
      hasError: true,
      error,
      kind: 'chunk',
      reloadReason: status,
      reloading: false,
      hashPath,
    };
  }

  componentDidCatch(error: unknown) {
    if (!isChunkLoadError(error)) return;
    const hashPath = this.props.getHashPath ? this.props.getHashPath() : this.state.hashPath;
    const storage = this.props.getStorage ? this.props.getStorage() : getSafeSessionStorage();
    const decision = decideChunkReload(storage, hashPath);
    if (decision.shouldReload) {
      if (!this.state.reloading || hashPath !== this.state.hashPath) {
        this.setState({ reloading: true, reloadReason: null, hashPath });
      }
      this.triggerReload();
    } else if (this.state.reloading || this.state.reloadReason !== decision.reason || hashPath !== this.state.hashPath) {
      this.setState({ reloading: false, reloadReason: decision.reason, hashPath });
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState(INITIAL_STATE);
    }
  }

  private resolveStorage(): ReloadStorageLike | null {
    return this.props.getStorage ? this.props.getStorage() : getSafeSessionStorage();
  }

  private triggerReload = () => {
    if (this.props.onReload) {
      this.props.onReload();
      return;
    }
    if (typeof window !== 'undefined') window.location.reload();
  };

  private handleReload = () => {
    clearChunkReloadMarker(this.resolveStorage());
    this.triggerReload();
  };

  private handleGoHome = () => {
    clearChunkReloadMarker(this.resolveStorage());
    if (this.props.onGoHome) {
      this.setState(INITIAL_STATE, () => {
        this.props.onGoHome?.();
      });
      return;
    }
    if (typeof window !== 'undefined' && window.location.hash !== '#/' && window.location.hash !== '') {
      window.location.assign('#/');
    }
    this.setState(INITIAL_STATE);
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.state.reloading) {
      return (
        <div className="er-reloading" role="status" aria-live="polite" data-testid="error-reloading">
          正在获取站点最新资源…
        </div>
      );
    }
    const hashPath = this.props.getHashPath ? this.props.getHashPath() : this.state.hashPath;
    return (
      <ErrorRecoveryView
        shell={this.props.shell}
        kind={this.state.kind}
        reloadReason={this.state.reloadReason}
        hashPath={hashPath}
        error={this.state.error}
        onReload={this.handleReload}
        onGoHome={this.handleGoHome}
      />
    );
  }
}
