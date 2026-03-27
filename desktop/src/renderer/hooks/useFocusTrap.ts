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

    const hadTabIndex = container.hasAttribute("tabindex");
    const previousTabIndex = container.getAttribute("tabindex");
    if (!hadTabIndex) {
      container.setAttribute("tabindex", "-1");
    }

    const getOrderedFocusable = () => {
      const current = getFocusable(container);
      if (current.length) return current;
      return [container];
    };

    const [first] = getOrderedFocusable();
    const last = getOrderedFocusable().slice(-1)[0] ?? container;

    lastFocusedRef.current = document.activeElement as HTMLElement;
    if (autoFocus) {
      const target = initialFocus ?? first;
      window.setTimeout(() => target?.focus({ preventScroll: true }), 0);
    }

    const handleFocusIn = (event: FocusEvent) => {
      if (container.contains(event.target as Node)) return;
      const [nextFirst] = getOrderedFocusable();
      const target =
        (initialFocus && container.contains(initialFocus) ? initialFocus : null) ?? nextFirst ?? container;
      target?.focus({ preventScroll: true });
    };

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const ordered = getOrderedFocusable();
        if (!ordered.length) return;
        const firstEl = ordered[0] ?? first;
        const lastEl = ordered[ordered.length - 1] ?? last;

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
      if (!hadTabIndex) {
        container.removeAttribute("tabindex");
      } else if (previousTabIndex !== null) {
        container.setAttribute("tabindex", previousTabIndex);
      }
      if (restoreFocus && lastFocusedRef.current instanceof HTMLElement) {
        if (document.contains(lastFocusedRef.current)) {
          lastFocusedRef.current.focus({ preventScroll: true });
        }
      }
    };
  }, [active, autoFocus, containerRef, initialFocus, onEscape, restoreFocus]);
};

export default useFocusTrap;
