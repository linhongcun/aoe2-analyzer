import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useShareLink, type ShareLinkOptions } from '../../src/shared/ui/useShareLink';

const renderers: ReactTestRenderer[] = [];
function setup(options: Partial<ShareLinkOptions> = {}) {
  let result!: ReturnType<typeof useShareLink>;
  function Probe(props: ShareLinkOptions) {
    result = useShareLink(props);
    return createElement('p', result.statusProps, result.status);
  }
  const props = { stateKey: 'first', ...options };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(Probe, props));
  });
  renderers.push(renderer);
  return {
    get current() {
      return result;
    },
    renderer,
    update(next: Partial<ShareLinkOptions>) {
      act(() => renderer.update(createElement(Probe, { ...props, ...next })));
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
afterEach(() => {
  act(() => renderers.splice(0).forEach((renderer) => renderer.unmount()));
  vi.unstubAllGlobals();
});

describe('#286 useShareLink', () => {
  it('copies the exact generated link during the click and exposes polite success feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const hook = setup({ successMessage: '方案已复制。' });
    const url = 'https://example.test/sub/duel.html?a=1&b=2#result';
    let copying!: ReturnType<typeof hook.current.copy>;
    act(() => {
      copying = hook.current.copy(() => url);
      expect(writeText).toHaveBeenCalledWith(url);
    });
    await act(async () => expect(await copying).toBe('copied'));
    expect(hook.current).toMatchObject({ status: '方案已复制。', copied: true, manualLink: '' });
    expect(hook.renderer.root.findByType('p').props).toMatchObject({ role: 'status', 'aria-live': 'polite', 'aria-atomic': true });
  });

  it('preserves the entire link for manual copying when clipboard access is denied', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    const hook = setup({ failureMessage: '请手动复制计划。' });
    const url = 'https://example.test/plan?' + '完整备注'.repeat(3000);
    await act(async () => expect(await hook.current.copy(url)).toBe('manual'));
    expect(hook.current).toMatchObject({ manualLink: url, status: '请手动复制计划。', copied: false });
  });

  it('falls back when the browser has no clipboard API and clears the fallback after success', async () => {
    vi.stubGlobal('navigator', {});
    const hook = setup();
    await act(async () => expect(await hook.current.copy('complete link')).toBe('manual'));
    expect(hook.current.manualLink).toBe('complete link');
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    await act(async () => expect(await hook.current.copy('new link')).toBe('copied'));
    expect(hook.current.manualLink).toBe('');
  });

  it('enforces the page length limit without truncating, including its exact boundary', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const hook = setup({ maxLength: 5, tooLongMessage: '内容超限，原配置保留。' });
    await act(async () => expect(await hook.current.copy('123456')).toBe('invalid'));
    expect(writeText).not.toHaveBeenCalled();
    expect(hook.current).toMatchObject({ status: '内容超限，原配置保留。', manualLink: '', copied: false });
    await act(async () => expect(await hook.current.copy('12345')).toBe('copied'));
    expect(writeText).toHaveBeenCalledExactlyOnceWith('12345');
  });

  it('reports serialization failures and empty links without writing to the clipboard', async () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const hook = setup({ invalidMessage: '原计划未截断，请检查输入。' });
    for (const input of [
      '',
      () => {
        throw new Error('too long');
      },
      () => Promise.reject(new Error('cannot generate')),
    ]) {
      await act(async () => expect(await hook.current.copy(input)).toBe('invalid'));
      expect(hook.current).toMatchObject({ status: '原计划未截断，请检查输入。', manualLink: '', copied: false });
    }
    expect(writeText).not.toHaveBeenCalled();
  });

  it('supports asynchronous serializers and cancels them before copying when the state changes', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const hook = setup();
    await act(async () => expect(await hook.current.copy(async () => 'async link')).toBe('copied'));
    const generated = deferred<string>();
    let copying!: ReturnType<typeof hook.current.copy>;
    act(() => {
      copying = hook.current.copy(() => generated.promise);
    });
    hook.update({ stateKey: 'edited' });
    await act(async () => {
      generated.resolve('obsolete link');
      expect(await copying).toBe('stale');
    });
    expect(writeText).toHaveBeenCalledExactlyOnceWith('async link');
    expect(hook.current.status).toBe('');
  });

  it('clears feedback on history changes and never revives it when returning to the old URL', async () => {
    vi.stubGlobal('navigator', {});
    const hook = setup();
    await act(async () => {
      await hook.current.copy('old link');
    });
    hook.update({ stateKey: 'second' });
    expect(hook.current.manualLink).toBe('');
    hook.update({ stateKey: 'first' });
    expect(hook.current).toMatchObject({ status: '', manualLink: '', copied: false });
  });

  it('does not let a delayed rejection restore a link after editing and navigating back', async () => {
    const clipboard = deferred<void>();
    vi.stubGlobal('navigator', { clipboard: { writeText: () => clipboard.promise } });
    const hook = setup();
    let copying!: ReturnType<typeof hook.current.copy>;
    act(() => {
      copying = hook.current.copy('old link');
    });
    hook.update({ stateKey: 'second' });
    hook.update({ stateKey: 'first' });
    await act(async () => {
      clipboard.reject(new Error('denied'));
      expect(await copying).toBe('stale');
    });
    expect(hook.current).toMatchObject({ status: '', manualLink: '' });
  });

  it('reset invalidates an unfinished copy even when the page key stays the same', async () => {
    const clipboard = deferred<void>();
    vi.stubGlobal('navigator', { clipboard: { writeText: () => clipboard.promise } });
    const hook = setup();
    let copying!: ReturnType<typeof hook.current.copy>;
    act(() => {
      copying = hook.current.copy('old link');
    });
    act(() => hook.current.reset());
    await act(async () => {
      clipboard.resolve(undefined);
      expect(await copying).toBe('stale');
    });
    expect(hook.current.copied).toBe(false);
  });

  it('keeps the most recent copy when multiple requests settle in the opposite order', async () => {
    const oldCopy = deferred<void>();
    const writeText = vi.fn().mockReturnValueOnce(oldCopy.promise).mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const hook = setup();
    let copying!: ReturnType<typeof hook.current.copy>;
    act(() => {
      copying = hook.current.copy('old link');
    });
    await act(async () => {
      await hook.current.copy('new link');
    });
    await act(async () => {
      oldCopy.reject(new Error('denied'));
      expect(await copying).toBe('stale');
    });
    expect(hook.current).toMatchObject({ copied: true, manualLink: '' });
  });

  it('announces page actions without leaving an old manual link and can target a navigation', async () => {
    vi.stubGlobal('navigator', {});
    const hook = setup();
    await act(async () => {
      await hook.current.copy('old link');
    });
    act(() => hook.current.announce('已重置。', 'second'));
    hook.update({ stateKey: 'second' });
    expect(hook.current).toMatchObject({ status: '已重置。', manualLink: '', copied: false });
    hook.update({ stateKey: 'first' });
    expect(hook.current.status).toBe('');
  });

  it('invalidates pending work when unmounted', async () => {
    const clipboard = deferred<void>();
    vi.stubGlobal('navigator', { clipboard: { writeText: () => clipboard.promise } });
    const hook = setup();
    let copying!: ReturnType<typeof hook.current.copy>;
    act(() => {
      copying = hook.current.copy('link');
    });
    act(() => hook.renderer.unmount());
    clipboard.resolve(undefined);
    expect(await copying).toBe('stale');
  });
});
