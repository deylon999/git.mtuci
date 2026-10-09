import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open dialogs, topmost last: with a confirm on top of a form, Esc/Tab belong to the confirm only.
const openDialogs: object[] = [];

/**
 * Keyboard behavior for a hand-made modal: Esc closes it (unless `busy`), focus moves into the panel on open
 * (an element with `autoFocus` wins), Tab cycles inside the panel, and focus returns to the opener on close.
 * Attach the returned ref to the dialog panel and give it `role="dialog"` + `aria-modal="true"`.
 */
export function useDialogA11y<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: () => void,
  { busy = false }: { busy?: boolean } = {},
) {
  const panelRef = useRef<T>(null);
  // Latest values through refs so the listener is attached once per open, not on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    const token = {};
    openDialogs.push(token);
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // An autoFocus inside the panel may already hold focus; then the opener is unknown and focus isn't restored.
    const opener = active && !panelRef.current?.contains(active) ? active : null;

    const focusables = () =>
      Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // After paint, so the panel exists and React's own autoFocus has already run.
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const first = focusables()[0];
      if (first) first.focus();
      else {
        panel.tabIndex = -1;
        panel.focus();
      }
    });

    const onKey = (e: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== token) return;
      if (e.key === "Escape") {
        if (!busyRef.current) onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = panelRef.current?.contains(active) ?? false;
      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      openDialogs.splice(openDialogs.indexOf(token), 1);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open]);

  return panelRef;
}
