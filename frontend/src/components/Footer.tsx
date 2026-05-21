import { Github, GitBranch, AlertCircle, BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  isStudentBootstrapPath,
  isStudentShellBootstrapResolved,
  onStudentShellBootstrap,
} from "../api/studentAppBootstrap";
import { getSystemInfo } from "../api/systemApi";
import { getTheme } from "../theme";
import { pageGutterClass } from "../layout/pageLayout";
import { useUserPreferences } from "../context/UserPreferencesContext";

interface FooterProps {
  isDarkTheme?: boolean;
}

export default function Footer({ isDarkTheme = true }: FooterProps) {
  const { t } = useUserPreferences();
  const { pathname } = useLocation();
  const [commitCount, setCommitCount] = useState(0);
  const [version, setVersion] = useState("v1.0.0");
  const theme = getTheme(isDarkTheme);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void getSystemInfo()
        .then((info) => {
          if (cancelled) return;
          setVersion(info.version || "v1.0.0");
          setCommitCount(info.commits ?? 0);
        })
        .catch(() => {
          if (!cancelled) {
            setVersion("v1.0.0");
            setCommitCount(0);
          }
        });
    };

    if (isStudentBootstrapPath(pathname) && !isStudentShellBootstrapResolved()) {
      const unsub = onStudentShellBootstrap(() => {
        if (!cancelled) load();
      });
      return () => {
        cancelled = true;
        unsub();
      };
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <footer className={`border-t`} style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
      <div className={`${pageGutterClass} py-4`}>
        <div className={`flex flex-col sm:flex-row items-center justify-between gap-4`} style={{ color: theme.text2 }}>
          {/* Left: Links */}
          <div className="flex items-center gap-6 text-sm">
            <a href="https://mtuci.ru" target="_blank" rel="noopener noreferrer" className={`hover:underline`} style={{ color: theme.text2 }}>
              MTUCI.ru
            </a>
            <button className={`hover:underline`} style={{ color: theme.text2 }}>
              {t("admin.footer.reportBug")}
            </button>
            <button className={`hover:underline`} style={{ color: theme.text2 }}>
              {t("admin.footer.gitCheatsheet")}
            </button>
            <button className={`hover:underline`} style={{ color: theme.text2 }}>
              {t("admin.footer.importGithub")}
            </button>
          </div>

          {/* Right: Version */}
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <GitBranch className={`h-4 w-4`} style={{ color: theme.text2 }} />
              <span>{commitCount} {t("admin.footer.commits")}</span>
            </div>
            <div className={`h-4 w-px`} style={{ backgroundColor: theme.divider }} />
            <span className={`font-mono`} style={{ color: theme.text2 }}>{version}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
