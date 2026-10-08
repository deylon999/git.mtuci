import { useUserPreferences } from "../context/UserPreferencesContext";

/** Shown when the current user could not be loaded for a reason other than a rejected session (network, 5xx). */
export default function AuthCheckFailed() {
  const { t } = useUserPreferences();
  return (
    <div className="p-4 text-sm text-slate-500">
      <p>{t("appError.title")}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      >
        {t("appError.reload")}
      </button>
    </div>
  );
}
