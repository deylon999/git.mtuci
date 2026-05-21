import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { getToken } from "../api/client";
import {
  isStudentBootstrapPath,
  isStudentShellBootstrapResolved,
  onStudentShellBootstrap,
} from "../api/studentAppBootstrap";
import { getUserSettings, patchUserSettings, type NotificationSettings, type UserSettings } from "../api/userSettingsApi";
import {
  LANGUAGE_STORAGE_KEY,
  isLocale,
  resolveLocale,
  translate,
  translateWithParams,
  type Locale,
} from "../i18n";
import { setI18nLocale } from "../i18n/runtime";

interface UserPreferencesContextValue {
  language: Locale;
  setLanguage: (locale: Locale) => void;
  t: (key: string) => string;
  tp: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  settingsLoading: boolean;
  notifications: NotificationSettings;
  setNotifications: React.Dispatch<React.SetStateAction<NotificationSettings>>;
  persistTheme: (theme: UserSettings["theme"]) => Promise<void>;
}

const defaultNotifications: NotificationSettings = {
  email: true,
  push: true,
  assignments: true,
  grades: true,
  teacher_pr_submitted: true,
  teacher_pr_stale: true,
  teacher_deadline_missed: true,
  teacher_daily_digest: false,
};

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);

function applyDocumentLanguage(locale: Locale) {
  document.documentElement.lang = locale;
  setI18nLocale(locale);
}

function resolveThemeFromSettings(theme: string, setIsDarkTheme: (dark: boolean) => void) {
  if (theme === "dark") {
    setIsDarkTheme(true);
    localStorage.setItem("theme", "dark");
    return;
  }
  if (theme === "light") {
    setIsDarkTheme(false);
    localStorage.setItem("theme", "light");
    return;
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  setIsDarkTheme(prefersDark);
  localStorage.setItem("theme", prefersDark ? "dark" : "light");
}

interface ProviderProps {
  children: ReactNode;
  isDarkTheme: boolean;
  setIsDarkTheme: (dark: boolean) => void;
}

function applySettingsToState(
  settings: UserSettings,
  setLanguageState: (locale: Locale) => void,
  setIsDarkTheme: (dark: boolean) => void,
  setNotifications: React.Dispatch<React.SetStateAction<NotificationSettings>>,
) {
  const locale = resolveLocale(settings.language);
  setLanguageState(locale);
  localStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
  applyDocumentLanguage(locale);
  resolveThemeFromSettings(settings.theme, setIsDarkTheme);
  setNotifications((prev) => ({
    ...prev,
    ...settings.notifications,
    teacher_pr_submitted: settings.notifications.teacher_pr_submitted ?? prev.teacher_pr_submitted,
    teacher_pr_stale: settings.notifications.teacher_pr_stale ?? prev.teacher_pr_stale,
    teacher_deadline_missed: settings.notifications.teacher_deadline_missed ?? prev.teacher_deadline_missed,
    teacher_daily_digest: settings.notifications.teacher_daily_digest ?? prev.teacher_daily_digest,
  }));
}

export function UserPreferencesProvider({ children, isDarkTheme, setIsDarkTheme }: ProviderProps) {
  const { pathname } = useLocation();
  const [language, setLanguageState] = useState<Locale>(() => {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return resolveLocale(stored ?? undefined);
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationSettings>(defaultNotifications);
  const hydratedRef = useRef(false);

  useEffect(() => {
    applyDocumentLanguage(language);
  }, [language]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setSettingsLoading(false);
      hydratedRef.current = true;
      return;
    }

    let cancelled = false;
    const loadSettings = () => {
      void getUserSettings()
        .then((settings) => {
          if (cancelled) return;
          applySettingsToState(settings, setLanguageState, setIsDarkTheme, setNotifications);
        })
        .catch(() => {
          /* keep local fallbacks */
        })
        .finally(() => {
          if (!cancelled) {
            setSettingsLoading(false);
            hydratedRef.current = true;
          }
        });
    };

    if (isStudentBootstrapPath(pathname)) {
      if (isStudentShellBootstrapResolved()) {
        loadSettings();
        return () => {
          cancelled = true;
        };
      }
      const unsub = onStudentShellBootstrap(() => {
        if (!cancelled) loadSettings();
      });
      return () => {
        cancelled = true;
        unsub();
      };
    }

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [pathname, setIsDarkTheme]);

  const setLanguage = useCallback((locale: Locale) => {
    if (!isLocale(locale)) return;
    setLanguageState(locale);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
    applyDocumentLanguage(locale);
    if (!getToken()) return;
    void patchUserSettings({ language: locale }).catch(() => {});
  }, []);

  const persistTheme = useCallback(async (theme: UserSettings["theme"]) => {
    if (!getToken()) return;
    await patchUserSettings({ theme });
  }, []);

  const t = useCallback((key: string) => translate(language, key), [language]);
  const tp = useCallback(
    (key: string, params?: Record<string, string | number | null | undefined>) =>
      translateWithParams(language, key, params),
    [language],
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
      tp,
      settingsLoading,
      notifications,
      setNotifications,
      persistTheme,
    }),
    [language, setLanguage, t, tp, settingsLoading, notifications, persistTheme],
  );

  return <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>;
}

export function useUserPreferences(): UserPreferencesContextValue {
  const ctx = useContext(UserPreferencesContext);
  if (!ctx) {
    throw new Error("useUserPreferences must be used within UserPreferencesProvider");
  }
  return ctx;
}

export function useUserPreferencesOptional(): UserPreferencesContextValue | null {
  return useContext(UserPreferencesContext);
}
