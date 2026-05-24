import { Loader2 } from "lucide-react";
import { getTheme } from "../theme";
import { useUserPreferencesOptional } from "../context/UserPreferencesContext";

interface PageLoadingFallbackProps {
  isDarkTheme?: boolean;
}

export default function PageLoadingFallback({ isDarkTheme = false }: PageLoadingFallbackProps) {
  const prefs = useUserPreferencesOptional();
  const theme = getTheme(isDarkTheme);
  const label = prefs?.t("common.loading") ?? "Loading…";

  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 py-16"
      style={{ color: theme.text2 }}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.accent }} />
      <p className="text-sm">{label}</p>
    </div>
  );
}
