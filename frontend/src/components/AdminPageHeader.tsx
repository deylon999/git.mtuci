interface AdminPageHeaderProps {
  isDarkTheme?: boolean;
  title: string;
  subtitle?: string;
  subtitleBelow?: boolean;
  actions?: React.ReactNode;
}

export default function AdminPageHeader({
  isDarkTheme = false,
  title,
  subtitle,
  subtitleBelow = false,
  actions,
}: AdminPageHeaderProps) {
  const titleText = isDarkTheme ? "text-[#ccd0d4]" : "text-gray-900";
  const subtitleText = isDarkTheme ? "text-[#8b949e]" : "text-gray-500";

  return (
    <div className="flex items-center justify-between">
      <div className={subtitleBelow ? "flex flex-col items-start" : "flex items-center gap-3"}>
        <h1 className={`text-2xl font-bold ${titleText} transition-colors`}>{title}</h1>
        {subtitle && (
          <span className={`text-sm ${subtitleText} transition-colors ${subtitleBelow ? "mt-1" : ""}`}>{subtitle}</span>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
