import { useUserPreferences } from "../context/UserPreferencesContext";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDangerous?: boolean;
  isLoading?: boolean;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  isDangerous = false,
  isLoading = false,
}: ConfirmModalProps) {
  const { t } = useUserPreferences();
  const resolvedConfirm = confirmText ?? t("common.confirm");
  const resolvedCancel = cancelText ?? t("common.cancel");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-[#1e1e1e] dark:border dark:border-[#30363d]">
        <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-[#e6e6e6]">{title}</h2>
        <p className="mb-6 text-sm text-gray-600 dark:text-[#888888]">{message}</p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-[#30363d] dark:bg-[#2a2a2a] dark:text-[#e6e6e6] dark:hover:bg-[#333333]"
          >
            {resolvedCancel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:opacity-60 ${
              isDangerous
                ? "bg-red-600 hover:bg-red-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isLoading ? t("common.loading") : resolvedConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
