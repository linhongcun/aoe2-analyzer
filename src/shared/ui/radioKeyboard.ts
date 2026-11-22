import type { KeyboardEvent } from 'react';

export function radioKeyboard(event: KeyboardEvent<HTMLElement>) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !(event.target instanceof HTMLButtonElement)) return;
  const radios = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(':scope > button[role="radio"]:not(:disabled)'));
  const index = radios.indexOf(event.target);
  if (index < 0) return;
  let next: number;
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = (index + 1) % radios.length;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      next = (index + radios.length - 1) % radios.length;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = radios.length - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  radios[next]?.focus();
  radios[next]?.click();
}
