/**
 * 桌面视口固定弹层定位（Issue 1280）：
 * >= 900px 时基于触发器 getBoundingClientRect() 计算 position: fixed 坐标并在下余空间不足时自动向上翻转；
 * < 900px 交由 CSS 底部抽屉接管；外部滚动导致触发器离开视口时自动关闭。
 */
import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

const MOBILE_BREAKPOINT = 900;
const HEADER_SAFE_TOP = 64;
const EDGE_GAP = 16;
const TRIGGER_GAP = 6;
const DESKTOP_MAX_W = 448;
const DESKTOP_MAX_H = 440;
const FLIP_THRESHOLD = 320;
const MIN_COMFORTABLE_H = 120;

export type PopoverPlacement = 'bottom' | 'top' | 'sheet';

export interface PopoverLayout {
  mobile: boolean;
  offscreen: boolean;
  placement: PopoverPlacement;
  style?: CSSProperties;
}

export function computeFixedPopoverLayout(rect: Pick<DOMRect, 'left' | 'top' | 'bottom'>, vw: number, vh: number): PopoverLayout {
  if (vw < MOBILE_BREAKPOINT) {
    return { mobile: true, offscreen: false, placement: 'sheet' };
  }
  if (rect.top > vh || rect.bottom < 0) {
    return { mobile: false, offscreen: true, placement: 'bottom' };
  }

  const width = Math.min(DESKTOP_MAX_W, Math.max(240, vw - EDGE_GAP * 2));
  const left = Math.max(EDGE_GAP, Math.min(rect.left, vw - EDGE_GAP - width));
  const rawBelow = Math.max(0, vh - rect.bottom - TRIGGER_GAP - EDGE_GAP);
  const availAbove = Math.max(0, rect.top - HEADER_SAFE_TOP - TRIGGER_GAP);

  if (rawBelow < FLIP_THRESHOLD && availAbove > rawBelow && availAbove >= MIN_COMFORTABLE_H) {
    const bottom = Math.max(EDGE_GAP, vh - rect.top + TRIGGER_GAP);
    const maxHeight = Math.min(DESKTOP_MAX_H, Math.max(0, vh - bottom - HEADER_SAFE_TOP));
    return {
      mobile: false,
      offscreen: false,
      placement: 'top',
      style: { position: 'fixed', left, bottom, top: 'auto', width, maxHeight },
    };
  }

  const top = Math.max(HEADER_SAFE_TOP, rect.bottom + TRIGGER_GAP);
  const availBelow = Math.max(0, vh - top - EDGE_GAP);
  if (availBelow >= MIN_COMFORTABLE_H) {
    return {
      mobile: false,
      offscreen: false,
      placement: 'bottom',
      style: { position: 'fixed', left, top, bottom: 'auto', width, maxHeight: Math.min(DESKTOP_MAX_H, availBelow) },
    };
  }

  const safeTop = Math.min(HEADER_SAFE_TOP, Math.max(0, vh - EDGE_GAP));
  const maxHeight = Math.min(DESKTOP_MAX_H, Math.max(0, vh - safeTop - EDGE_GAP));
  return {
    mobile: false,
    offscreen: false,
    placement: 'bottom',
    style: { position: 'fixed', left, top: safeTop, bottom: 'auto', width, maxHeight },
  };
}

export function useFixedPopover(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  onOffscreenClose: () => void,
): PopoverLayout {
  const [layout, setLayout] = useState<PopoverLayout>({ mobile: false, offscreen: false, placement: 'bottom' });

  useLayoutEffect(() => {
    if (!open) return;
    const sync = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const next = computeFixedPopoverLayout(trigger.getBoundingClientRect(), window.innerWidth, window.innerHeight);
      if (next.offscreen) {
        onOffscreenClose();
        return;
      }
      setLayout(next);
    };
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return;
      sync();
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, triggerRef, panelRef, onOffscreenClose]);

  return layout;
}
