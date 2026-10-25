import { useCallback, useEffect, useRef, useState } from 'react';

export const SHARE_STATUS_PROPS = { role: 'status', 'aria-live': 'polite', 'aria-atomic': true } as const;

export interface ShareLinkOptions {
  /** Include the URL and any editable draft that determines the shared content. */
  stateKey: string;
  successMessage?: string;
  failureMessage?: string;
  invalidMessage?: string;
  tooLongMessage?: string;
  /** Only set this when the page already has a length limit. No link is truncated. */
  maxLength?: number;
}

export type ShareCopyResult = 'copied' | 'manual' | 'invalid' | 'stale';
type ShareContent = string | (() => string | Promise<string>);
interface Feedback {
  stateKey: string;
  status: string;
  manualLink: string;
  copied: boolean;
}
const empty = (stateKey: string): Feedback => ({ stateKey, status: '', manualLink: '', copied: false });

/** Keep page-specific serialization and limits at the call site; share only copying and feedback. */
export function useShareLink({
  stateKey,
  successMessage = '链接已复制。',
  failureMessage = '自动复制失败，请手动复制下方完整链接。',
  invalidMessage = '无法生成完整链接，请核对输入。',
  tooLongMessage = '链接过长，无法复制；请减少内容后重试。',
  maxLength,
}: ShareLinkOptions) {
  const [feedback, setFeedback] = useState<Feedback>(() => empty(stateKey));
  const [observedKey, setObservedKey] = useState(stateKey);
  if (observedKey !== stateKey) {
    setObservedKey(stateKey);
    // Reset during render so history cannot briefly restore old feedback.
    if (feedback.stateKey !== stateKey) setFeedback(empty(stateKey));
  }
  const revision = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      revision.current += 1;
    };
  }, []);
  useEffect(() => {
    revision.current += 1;
    return () => {
      revision.current += 1;
    };
  }, [stateKey]);

  const reset = useCallback(() => {
    revision.current += 1;
    setFeedback(empty(stateKey));
  }, [stateKey]);
  const announce = useCallback(
    (status: string, nextStateKey = stateKey) => {
      revision.current += 1;
      setFeedback({ ...empty(nextStateKey), status });
    },
    [stateKey],
  );
  const copy = async (content: ShareContent): Promise<ShareCopyResult> => {
    const request = ++revision.current;
    const current = () => mounted.current && revision.current === request;
    setFeedback(empty(stateKey));
    let link: string;
    try {
      const value = typeof content === 'function' ? content() : content;
      // Synchronous serializers retain the clipboard call's user activation.
      link = typeof value === 'string' ? value : await value;
      if (!current()) return 'stale';
      if (!link || (maxLength !== undefined && link.length > maxLength)) {
        setFeedback({ ...empty(stateKey), status: link ? tooLongMessage : invalidMessage });
        return 'invalid';
      }
    } catch {
      if (!current()) return 'stale';
      setFeedback({ ...empty(stateKey), status: invalidMessage });
      return 'invalid';
    }
    try {
      await navigator.clipboard.writeText(link);
      if (!current()) return 'stale';
      setFeedback({ ...empty(stateKey), status: successMessage, copied: true });
      return 'copied';
    } catch {
      if (!current()) return 'stale';
      setFeedback({ ...empty(stateKey), status: failureMessage, manualLink: link });
      return 'manual';
    }
  };

  const visible = feedback.stateKey === stateKey ? feedback : empty(stateKey);
  return { copy, ...visible, reset, announce, statusProps: SHARE_STATUS_PROPS };
}
