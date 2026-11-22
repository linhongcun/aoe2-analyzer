import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import {
  CHUNK_RELOAD_STORAGE_KEY,
  CHUNK_RELOAD_WINDOW_MS,
  clearChunkReloadMarker,
  decideChunkReload,
  formatErrorDetail,
  isChunkLoadError,
  normalizeHashPath,
  readChunkReloadState,
  type ReloadStorageLike,
} from '../../src/domain/chunkRecovery';
import { ErrorBoundary } from '../../src/shared/ui/ErrorRecovery';

function memoryStorage(initial: Record<string, string> = {}): ReloadStorageLike & { dump(): Record<string, string> } {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    dump: () => Object.fromEntries(map.entries()),
  };
}

function throwingStorage(): ReloadStorageLike {
  return {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {
      throw new Error('SecurityError');
    },
  };
}

describe('chunkRecovery 领域逻辑（Issue 1278）', () => {
  it('normalizeHashPath 规范化空值、纯 # 与带参数路由', () => {
    expect(normalizeHashPath('')).toBe('#/');
    expect(normalizeHashPath('   ')).toBe('#/');
    expect(normalizeHashPath('#')).toBe('#/');
    expect(normalizeHashPath('#/production?civ=Franks&age=3')).toBe('#/production?civ=Franks&age=3');
    expect(normalizeHashPath('/compare?a=Franks&b=Britons')).toBe('#/compare?a=Franks&b=Britons');
  });

  it('isChunkLoadError 准确识别分包加载失败并排除普通运行时错误', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://example.com/assets/Production-abc.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: /assets/Compare.js'))).toBe(true);
    expect(isChunkLoadError(Object.assign(new Error('Loading chunk 12 failed.'), { name: 'ChunkLoadError' }))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for assets/Production.css'))).toBe(true);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'name')"))).toBe(false);
    expect(isChunkLoadError(new ReferenceError('foo is not defined'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError('')).toBe(false);
  });

  it('decideChunkReload 同路径 30s 内仅自动重载 1 次，不同路径或过期后可再次重载', () => {
    const store = memoryStorage();
    const t0 = 1_700_000_000_000;

    expect(decideChunkReload(store, '#/production?civ=Franks', t0)).toEqual({
      shouldReload: true,
      reason: 'first-attempt',
      path: '#/production?civ=Franks',
    });
    expect(readChunkReloadState(store, '#/production?civ=Franks', t0 + 1000)).toBe('already-retried');

    // 同路径 30s 内不再自动刷新
    expect(decideChunkReload(store, '#/production?civ=Franks', t0 + CHUNK_RELOAD_WINDOW_MS - 1)).toEqual({
      shouldReload: false,
      reason: 'already-retried',
      path: '#/production?civ=Franks',
    });

    // 切换不同路径允许重新尝试
    expect(decideChunkReload(store, '#/compare?a=Franks&b=Britons', t0 + 5000)).toEqual({
      shouldReload: true,
      reason: 'first-attempt',
      path: '#/compare?a=Franks&b=Britons',
    });

    // 超过 30s 窗口后允许再次自动重载
    expect(decideChunkReload(store, '#/compare?a=Franks&b=Britons', t0 + 5000 + CHUNK_RELOAD_WINDOW_MS)).toEqual({
      shouldReload: true,
      reason: 'first-attempt',
      path: '#/compare?a=Franks&b=Britons',
    });
  });

  it('decideChunkReload 与 readChunkReloadState 在存储不可用或抛错时安全降级不抛异常', () => {
    expect(decideChunkReload(null, '#/production')).toEqual({
      shouldReload: false,
      reason: 'storage-unavailable',
      path: '#/production',
    });
    expect(decideChunkReload(throwingStorage(), '#/production')).toEqual({
      shouldReload: false,
      reason: 'storage-unavailable',
      path: '#/production',
    });
    expect(readChunkReloadState(throwingStorage(), '#/production')).toBe('storage-unavailable');

    // getItem 正常但 setItem 抛错（例如 QuotaExceededError）同样降级
    const writeFailStore: ReloadStorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    expect(decideChunkReload(writeFailStore, '#/production')).toEqual({
      shouldReload: false,
      reason: 'storage-unavailable',
      path: '#/production',
    });
  });

  it('clearChunkReloadMarker 正确清理匹配、过期或损坏的标记，并保留未过期其他路径标记', () => {
    const t0 = 1_700_000_000_000;
    const store = memoryStorage({
      [CHUNK_RELOAD_STORAGE_KEY]: JSON.stringify({ path: '#/production', ts: t0 }),
    });

    // 其他路径仍在有效窗口内时不误删
    expect(clearChunkReloadMarker(store, '#/civs', t0 + 1000)).toBe(false);
    expect(store.getItem(CHUNK_RELOAD_STORAGE_KEY)).not.toBeNull();

    // 匹配路径时清理
    expect(clearChunkReloadMarker(store, '#/production', t0 + 1000)).toBe(true);
    expect(store.getItem(CHUNK_RELOAD_STORAGE_KEY)).toBeNull();

    // 损坏 JSON 也会被清理
    store.setItem(CHUNK_RELOAD_STORAGE_KEY, '{broken');
    expect(clearChunkReloadMarker(store, '#/civs', t0 + 1000)).toBe(true);
    expect(store.getItem(CHUNK_RELOAD_STORAGE_KEY)).toBeNull();

    // 无参调用无条件清理；异常存储返回 false
    store.setItem(CHUNK_RELOAD_STORAGE_KEY, JSON.stringify({ path: '#/compare', ts: t0 }));
    expect(clearChunkReloadMarker(store)).toBe(true);
    expect(store.getItem(CHUNK_RELOAD_STORAGE_KEY)).toBeNull();
    expect(clearChunkReloadMarker(throwingStorage())).toBe(false);
  });

  it('formatErrorDetail 输出单行摘要并兜底空消息', () => {
    expect(formatErrorDetail(new TypeError('Cannot read properties of undefined\nat line 2'))).toBe('TypeError: Cannot read properties of undefined');
    expect(formatErrorDetail(new Error(''))).toBe('Error: 未知渲染异常');
    expect(formatErrorDetail('plain failure\nstack line')).toBe('plain failure');
    expect(formatErrorDetail(null)).toBe('未知渲染异常');
  });
});

describe('ErrorBoundary 双壳与双态恢复渲染（Issue 1278）', () => {
  function Thrower({ error }: { error: Error }): never {
    throw error;
  }

  function collectText(renderer: TestRenderer.ReactTestRenderer): string {
    const walk = (node: TestRenderer.ReactTestRendererJSON | TestRenderer.ReactTestRendererNode | null): string => {
      if (node === null || node === undefined) return '';
      if (typeof node === 'string') return node;
      return (node.children ?? []).map(walk).join('');
    };
    return walk(renderer.toJSON() as TestRenderer.ReactTestRendererJSON | null);
  }

  it('路由壳捕获运行时异常渲染状态 B，含折叠详情且点击返回首页重置状态', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onGoHome = vi.fn();
    let shouldThrow = true;

    function FlakyPage() {
      if (shouldThrow) throw new TypeError("Cannot read properties of undefined (reading 'name')");
      return createElement('div', { 'data-testid': 'ok-page' }, '首页内容');
    }

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        createElement(
          ErrorBoundary,
          {
            shell: 'route',
            onGoHome,
            getStorage: () => memoryStorage(),
            getHashPath: () => '#/compare?a=Franks&b=Britons',
          },
          createElement(FlakyPage),
        ),
      );
    });

    const text = collectText(renderer);
    expect(text).toContain('页面运行出错');
    expect(text).toContain('页面加载遇到意外错误');
    expect(text).toContain('当前地址');
    expect(text).toContain('#/compare?a=Franks&b=Britons');
    expect(text).toContain('查看错误详情（供排障参考）');
    expect(text).toContain("TypeError: Cannot read properties of undefined (reading 'name')");
    expect(renderer.root.findAllByType('details')).toHaveLength(1);
    expect(renderer.root.findAllByType('header')).toHaveLength(0);

    shouldThrow = false;
    const buttons = renderer.root.findAllByType('button');
    const homeButton = buttons.find((button) => button.findAllByType('span').some((span) => span.children.join('') === '返回首页'));
    expect(homeButton).toBeDefined();
    act(() => {
      homeButton!.props.onClick();
    });
    expect(onGoHome).toHaveBeenCalledTimes(1);
    expect(collectText(renderer)).toContain('首页内容');
    spy.mockRestore();
  });

  it('顶层外围壳捕获异常时渲染极简品牌顶栏，避免整页空白', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        createElement(
          ErrorBoundary,
          {
            shell: 'standalone',
            getStorage: () => memoryStorage(),
            getHashPath: () => '#/duel',
          },
          createElement(Thrower, { error: new Error('Layout crashed') }),
        ),
      );
    });

    const text = collectText(renderer);
    expect(renderer.root.findAllByType('header')).toHaveLength(1);
    expect(text).toContain('帝国时代 II 分析器');
    expect(text).toContain('页面加载遇到意外错误');
    expect(text).toContain('Error: Layout crashed');
    spy.mockRestore();
  });

  it('分包加载失败在已重试 1 次后展示状态 A 且不触发二次重载、不显示排障折叠区', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onReload = vi.fn();
    const store = memoryStorage({
      [CHUNK_RELOAD_STORAGE_KEY]: JSON.stringify({ path: '#/production?civ=Franks&age=3', ts: Date.now() }),
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        createElement(
          ErrorBoundary,
          {
            shell: 'route',
            onReload,
            getStorage: () => store,
            getHashPath: () => '#/production?civ=Franks&age=3',
          },
          createElement(Thrower, { error: new TypeError('Failed to fetch dynamically imported module') }),
        ),
      );
    });

    const text = collectText(renderer);
    expect(onReload).not.toHaveBeenCalled();
    expect(text).toContain('站点资源加载失败');
    expect(text).toContain('站点已更新，或页面资源暂时无法加载');
    expect(text).toContain('系统已自动尝试重新加载 1 次，仍未恢复。');
    expect(text).toContain('目标地址');
    expect(text).toContain('#/production?civ=Franks&age=3');
    expect(renderer.root.findAllByType('details')).toHaveLength(0);
    spy.mockRestore();
  });

  it('分包加载失败且 sessionStorage 不可用时不重载并提示手动刷新', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onReload = vi.fn();

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        createElement(
          ErrorBoundary,
          {
            shell: 'route',
            onReload,
            getStorage: () => throwingStorage(),
            getHashPath: () => '#/production',
          },
          createElement(Thrower, { error: new TypeError('Failed to fetch dynamically imported module') }),
        ),
      );
    });

    const text = collectText(renderer);
    expect(onReload).not.toHaveBeenCalled();
    expect(text).toContain('请手动刷新页面以获取最新资源。');
    expect(text).not.toContain('系统已自动尝试重新加载');
    spy.mockRestore();
  });
});
