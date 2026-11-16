import { useEffect, useState } from 'react';
import updatesUrl from '../../data/content/civ-updates.json?url';
import validate from '../content/schema/compiled/civ-updates.mjs';
import { assertCivUpdateReferences, type CivUpdatesData } from '../domain/civUpdates';
import { readValidatedJson } from './validatedJson';

let pending: Promise<CivUpdatesData> | undefined;

/** Fetch only on a mounted history reader; failed promises are never cached. */
export function loadCivUpdates(): Promise<CivUpdatesData> {
  pending ??= fetch(updatesUrl)
    .then(async (response) => {
      if (!response.ok) throw new Error('文明更新历史读取失败');
      const data = readValidatedJson(await response.json(), validate, '文明更新历史');
      assertCivUpdateReferences(data);
      return data;
    })
    .catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
  return pending;
}

export function useCivUpdates() {
  const [data, setData] = useState<CivUpdatesData | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadCivUpdates().then(
      (loaded) => {
        if (active) {
          setData(loaded);
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
    data,
    error,
    retry: () => {
      setError(false);
      setAttempt((value) => value + 1);
    },
  };
}
