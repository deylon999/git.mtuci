import { useCallback, useRef, useState, type ReactNode } from "react";
import ConfirmModal from "../components/ConfirmModal";
import { useUserPreferences } from "../context/UserPreferencesContext";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  /** Red confirm button; on by default since most confirmations guard deletions. */
  danger?: boolean;
}

/**
 * Promise-based replacement for window.confirm: `if (!(await confirm({ message }))) return;`.
 * Render `dialog` somewhere in the component.
 */
export function useConfirmDialog(): { confirm: (options: ConfirmOptions) => Promise<boolean>; dialog: ReactNode } {
  const { t } = useUserPreferences();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current?.(false);
        resolveRef.current = resolve;
        setOptions(next);
      }),
    [],
  );

  const settle = (ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setOptions(null);
  };

  const dialog = (
    <ConfirmModal
      isOpen={options !== null}
      title={options?.title ?? t("common.areYouSure")}
      message={options?.message ?? ""}
      confirmText={options?.confirmText}
      isDangerous={options?.danger ?? true}
      onCancel={() => settle(false)}
      onConfirm={() => settle(true)}
    />
  );

  return { confirm, dialog };
}
