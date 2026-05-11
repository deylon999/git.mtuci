import { getTheme } from "../theme";

interface DashboardPageProps {
  isDarkTheme?: boolean;
}

export default function DashboardPage({ isDarkTheme = false }: DashboardPageProps) {
  const theme = getTheme(isDarkTheme);

  return (
    <div className="mx-auto max-w-5xl transition-colors" style={{ backgroundColor: theme.bg }}>
      <h1 className="mb-6 text-2xl font-semibold transition-colors" style={{ color: theme.text }}>Дашборд</h1>
      <p className="transition-colors" style={{ color: theme.text2 }}>Страница в разработке...</p>
    </div>
  );
}
