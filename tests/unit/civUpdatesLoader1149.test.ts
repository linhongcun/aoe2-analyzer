import { afterEach, expect, it, vi } from 'vitest';
import { historyFixture } from '../helpers/civUpdatesFixture';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('an old failed reload cannot evict a newer pending request', async () => {
  let rejectOld!: (error: Error) => void;
  let resolveNew!: (response: Response) => void;
  const old = new Promise<Response>((_, reject) => {
    rejectOld = reject;
  });
  const newer = new Promise<Response>((resolve) => {
    resolveNew = resolve;
  });
  const fetch = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(newer);
  vi.stubGlobal('fetch', fetch);
  const { loadCivUpdates } = await import('../../src/data/civUpdates');
  const a = loadCivUpdates(true);
  const caught = a.catch(() => undefined);
  const b = loadCivUpdates(true);
  rejectOld(new Error('old request failed'));
  await caught;
  expect(loadCivUpdates()).toBe(b);
  expect(fetch).toHaveBeenCalledTimes(2);
  resolveNew(new Response(JSON.stringify(historyFixture())));
  await expect(b).resolves.toHaveProperty('events');
});
