import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { getTheme } from "../theme";
import { translate } from "../i18n";
import { getI18nLocale } from "../i18n/runtime";

interface Props {
  children: ReactNode;
  isDarkTheme?: boolean;
}

interface State {
  error: Error | null;
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary:", error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const isDark = this.props.isDarkTheme ?? false;
    const theme = getTheme(isDark);
    const locale = getI18nLocale();
    const t = (key: string) => translate(locale, key);
    const message = this.state.error.message || t("appError.unknown");

    return (
      <div
        className="min-h-[50vh] flex flex-col items-center justify-center gap-4 px-6 py-12 text-center"
        style={{ backgroundColor: theme.bg2, color: theme.text }}
      >
        <AlertTriangle className="h-10 w-10" style={{ color: theme.danger }} />
        <h1 className="text-lg font-semibold">{t("appError.title")}</h1>
        <p className="text-sm max-w-md" style={{ color: theme.text2 }}>
          {t("appError.hint")}
        </p>
        <p
          className="text-xs font-mono max-w-lg break-all rounded-lg border px-3 py-2"
          style={{ borderColor: theme.border, color: theme.text3, backgroundColor: theme.bg3 }}
        >
          {message}
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            type="button"
            onClick={this.handleRetry}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: theme.accent }}
          >
            {t("appError.reload")}
          </button>
          <Link
            to="/"
            className="rounded-lg border px-4 py-2 text-sm font-medium"
            style={{ borderColor: theme.border, color: theme.text2 }}
          >
            {t("appError.home")}
          </Link>
        </div>
      </div>
    );
  }
}
