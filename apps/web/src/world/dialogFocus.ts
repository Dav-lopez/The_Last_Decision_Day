import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import { initialFocus, tabListTarget, trapTarget } from './focusNav.mjs';

/** Keyboard flow shared by the overlays (map, conversations, range, league table, wardrobe). MVP 7b. */
export const FOCUSABLE = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Visible, focusable controls inside an overlay, in document order. */
export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null && el.tabIndex >= 0);
}

/** Put focus on the overlay's preferred start (`data-autofocus`) or its first control. */
export function focusInto(root: HTMLElement | null): boolean {
  if (!root) return false;
  const items = focusables(root);
  const index = initialFocus(items.map(el => el.hasAttribute('data-autofocus')));
  if (index < 0) return false;
  items[index].focus({ preventScroll: true });
  return true;
}

/** onKeyDown for a modal overlay: Tab and Shift+Tab stay inside it. */
export function trapTab(event: KeyboardEvent, root: HTMLElement | null) {
  if (event.key !== 'Tab' || !root) return;
  const items = focusables(root);
  const target = trapTarget(items.indexOf(document.activeElement as HTMLElement), items.length, event.shiftKey);
  if (target === null) return;
  event.preventDefault();
  items[target].focus();
}

/**
 * onKeyDown for a group of buttons: arrows, Home and End move focus along it (wrapping, skipping
 * disabled ones); with `select`, the button is also pressed, which is how tabs get selected.
 */
export function arrowKeys(event: KeyboardEvent<HTMLElement>, selector: string, orientation: 'horizontal' | 'vertical', select: boolean) {
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(selector));
  const index = items.indexOf(event.target as HTMLButtonElement);
  if (index < 0) return;
  const target = tabListTarget(event.key, index, items.map(item => !item.disabled), orientation);
  if (target === null) return;
  event.preventDefault();
  event.stopPropagation();
  items[target].focus();
  if (select && target !== index) items[target].click();
}

/** onKeyDown for a role="tablist" (the WAI-ARIA tabs pattern with automatic selection). */
export const tabListKeys = (event: KeyboardEvent<HTMLElement>, orientation: 'horizontal' | 'vertical' = 'horizontal') =>
  arrowKeys(event, '[role="tab"]', orientation, true);

type DialogFocusOptions = {
  /** Where focus goes back to when the overlay closes (default: whatever had it before). */
  restore?: () => HTMLElement | null | undefined;
  /** Changing this (e.g. a conversation moving on to its reply) re-places focus if it fell out. */
  step?: unknown;
  /** Leave focus where it is when the overlay opens if this says so (e.g. the 3D view after a mouse click). */
  keep?: (focused: Element | null) => boolean;
};

/**
 * Focus moves into an overlay when it opens and back out when it closes, so keyboard
 * players never lose their place (and never have to Tab through the page to reach it).
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, active: boolean, options: DialogFocusOptions = {}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      const root = ref.current;
      if (!root || root.contains(document.activeElement)) return;
      if (optionsRef.current.keep?.(document.activeElement)) return;
      focusInto(root);
    });
    return () => {
      cancelAnimationFrame(frame);
      const focused = document.activeElement;
      // Only take focus back if it was in the overlay (or vanished with it), not if the player moved on.
      const lost = !focused || focused === document.body || !focused.isConnected || Boolean(ref.current?.contains(focused));
      const target = optionsRef.current.restore?.() ?? previous;
      if (lost && target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [active, ref]);
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      const root = ref.current;
      const focused = document.activeElement;
      if (root && (!focused || focused === document.body || !root.contains(focused)) && !optionsRef.current.keep?.(focused)) focusInto(root);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, ref, options.step]);
}
