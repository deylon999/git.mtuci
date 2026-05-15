import { Github, GitBranch, AlertCircle, BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { apiRequest } from "../api/client";
import { getTheme } from "../theme";
import { pageGutterClass } from "../layout/pageLayout";

interface FooterProps {
  isDarkTheme?: boolean;
}

export default function Footer({ isDarkTheme = true }: FooterProps) {
  const [commitCount, setCommitCount] = useState(0);
  const [version, setVersion] = useState("v1.0.0");
  const theme = getTheme(isDarkTheme);

  useEffect(() => {
    // TODO: Replace with actual API call when backend endpoint is available
    // For now, fetch from a simple stats endpoint or use package.json version
    async function fetchSystemInfo() {
      try {
        // Try to get version from API if available
        const info = await apiRequest<any>("/system/info").catch(() => null);
        if (info) {
          setVersion(info.version || "v1.0.0");
          setCommitCount(info.commits || 0);
        }
      } catch (e) {
        console.error("Failed to fetch system info:", e);
        // Fallback to default values
        setVersion("v1.0.0");
        setCommitCount(0);
      }
    }
    fetchSystemInfo();
  }, []);

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
              Сообщить об ошибке
            </button>
            <button className={`hover:underline`} style={{ color: theme.text2 }}>
              Шпаргалка по Git
            </button>
            <button className={`hover:underline`} style={{ color: theme.text2 }}>
              Импорт из GitHub
            </button>
          </div>

          {/* Right: Version */}
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <GitBranch className={`h-4 w-4`} style={{ color: theme.text2 }} />
              <span>{commitCount} commits</span>
            </div>
            <div className={`h-4 w-px`} style={{ backgroundColor: theme.divider }} />
            <span className={`font-mono`} style={{ color: theme.text2 }}>{version}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
