import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[role='button']",
].join(",");

type FocusTrapOptions = {
  active?: boolean;
  initialFocus?: HTMLElement | null;
  restoreFocus?: boolean;
  onEscape?: () => void;
  autoFocus?: boolean;
};

const isVisible = (el: HTMLElement): boolean => {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
};

const getFocusable = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(isVisible);

/**
 * Lightweight focus trap for modals and overlays.
 */
export const useFocusTrap = (
  containerRef: React.RefObject<HTMLElement>,
  { active = true, initialFocus, restoreFocus = true, onEscape, autoFocus = true }: FocusTrapOptions = {},
): void => {
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const focusables = getFocusable(container);
    const first = focusables[0] ?? container;
    const last = focusables[focusables.length - 1] ?? container;

    lastFocusedRef.current = document.activeElement as HTMLElement;
    if (autoFocus) {
      const target = initialFocus ?? first;
      window.setTimeout(() => target?.focus({ preventScroll: true }), 0);
    }

    const handleFocusIn = (event: FocusEvent) => {
      if (!container.contains(event.target as Node)) {
        (initialFocus ?? first)?.focus({ preventScroll: true });
      }
    };

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Tab" && focusables.length) {
        const updated = getFocusable(container);
        const firstEl = updated[0] ?? first;
        const lastEl = updated[updated.length - 1] ?? last;

        if (event.shiftKey && document.activeElement === firstEl) {
          event.preventDefault();
          lastEl.focus();
          return;
        }

        if (!event.shiftKey && document.activeElement === lastEl) {
          event.preventDefault();
          firstEl.focus();
        }
      }

      if (event.key === "Escape" && onEscape) {
        event.preventDefault();
        onEscape();
      }
    };

    document.addEventListener("focusin", handleFocusIn);
    container.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      container.removeEventListener("keydown", handleKeydown);
      if (restoreFocus && lastFocusedRef.current instanceof HTMLElement) {
        lastFocusedRef.current.focus({ preventScroll: true });
      }
    };
  }, [active, containerRef, initialFocus, onEscape, restoreFocus]);
};

export default useFocusTrap;
