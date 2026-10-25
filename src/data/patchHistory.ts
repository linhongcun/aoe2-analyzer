import { useEffect, useState } from 'react';
import type { PatchArchive } from '../domain/patchHistory';

// Loaded only when a history tab or patch page is opened; current entity data stays independent.
const sources = import.meta.glob('./patches/*.json', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
let pending: Promise<PatchArchive[]> | undefined;

export function loadPatchArchives(): Promise<PatchArchive[]> {
  pending ??= Promise.all(
    Object.values(sources).map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('补丁档案读取失败');
      const archive = (await response.json()) as PatchArchive;
      if (!archive.id || !(archive.releaseDate ?? archive.date) || !Array.isArray(archive.entries)) throw new Error('补丁档案格式无效');
      return {
        ...archive,
        date: archive.releaseDate ?? archive.date,
        branch: archive.branch ?? 'DE',
        releaseType: archive.releaseType ?? 'release',
        coverage: archive.coverage ?? '既有版本补丁记录，历史关联仍在补录',
      };
    }),
  )
    .then((archives) => archives.sort((a, b) => b.date.localeCompare(a.date)))
    .catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
  return pending;
}

export function usePatchArchives() {
  const [archives, setArchives] = useState<PatchArchive[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadPatchArchives().then(
      (data) => {
        if (active) {
          setArchives(data);
          setError(false);
        }
      },
      () => {
        if (active) setError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  return {
    archives,
    error,
    retry: () => {
      setError(false);
      setAttempt((value) => value + 1);
    },
  };
}
