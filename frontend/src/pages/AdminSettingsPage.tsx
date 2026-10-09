import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Mail, Plug, Shield } from "lucide-react";
import AdminPageHeader from "../components/AdminPageHeader";
import { getPlatformSettings, type PlatformSettings } from "../api/adminApi";
import { useUserPreferences } from "../context/UserPreferencesContext";

interface AdminSettingsPageProps {
  isDarkTheme?: boolean;
}

const getColors = (isDarkTheme: boolean) => ({
  pageBg: isDarkTheme ? "#0f0f10" : "#f9fafb",
  cardBg: isDarkTheme ? "#141414" : "#ffffff",
  rowBg: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
  border: isDarkTheme ? "#30363d" : "#e0e0e0",
  accent: "#2563eb",
  textPrimary: isDarkTheme ? "#e6e6e6" : "#1a1a1a",
  textSecondary: isDarkTheme ? "#888888" : "#666666",
  warnBg: isDarkTheme ? "rgba(234, 179, 8, 0.12)" : "rgba(234, 179, 8, 0.1)",
  warnBorder: isDarkTheme ? "rgba(234, 179, 8, 0.35)" : "rgba(234, 179, 8, 0.4)",
  warnText: isDarkTheme ? "#facc15" : "#a16207",
});

type Colors = ReturnType<typeof getColors>;

function Section({
  colors,
  icon,
  iconColor,
  title,
  children,
}: {
  colors: Colors;
  icon: ReactNode;
  iconColor: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        backgroundColor: colors.cardBg,
        border: `1px solid ${colors.border}`,
        borderRadius: "12px",
        padding: "20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <div
          style={{
            width: "40px",
            height: "40px",
            flexShrink: 0,
            borderRadius: "8px",
            backgroundColor: `${iconColor}1f`,
            color: iconColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
        <h3 style={{ color: colors.textPrimary, fontSize: "16px", fontWeight: 600, margin: 0 }}>{title}</h3>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>{children}</div>
    </section>
  );
}

function Row({ colors, label, envVar, value }: { colors: Colors; label: string; envVar?: string; value: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "4px 16px",
        padding: "12px",
        backgroundColor: colors.rowBg,
        borderRadius: "8px",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ color: colors.textPrimary, fontSize: "14px", fontWeight: 500 }}>{label}</div>
        {envVar ? (
          <code style={{ color: colors.textSecondary, fontSize: "11px" }}>{envVar}</code>
        ) : null}
      </div>
      <div style={{ color: colors.textPrimary, fontSize: "13px", overflowWrap: "anywhere", textAlign: "right" }}>
        {value}
      </div>
    </div>
  );
}

export default function AdminSettingsPage({ isDarkTheme = false }: AdminSettingsPageProps) {
  const { t } = useUserPreferences();
  const colors = getColors(isDarkTheme);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setError(false);
    getPlatformSettings()
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  const muted = (text: string) => <span style={{ color: colors.textSecondary }}>{text}</span>;
  const orNotSet = (value: string) => (value ? value : muted(t("admin.settings.notSet")));

  return (
    <div style={{ backgroundColor: colors.pageBg, minHeight: "100%", padding: "16px" }}>
      <AdminPageHeader isDarkTheme={isDarkTheme} title={t("admin.settings.title")} />
      <p style={{ color: colors.textSecondary, fontSize: "13px", margin: "4px 0 16px" }}>
        {t("admin.settings.subtitle")}
      </p>

      {error ? (
        <div style={{ color: colors.textSecondary, fontSize: "14px" }}>
          {t("admin.settings.loadError")}{" "}
          <button
            type="button"
            onClick={() => {
              setSettings(null);
              load();
            }}
            style={{ color: colors.accent, background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            {t("admin.settings.retry")}
          </button>
        </div>
      ) : !settings ? (
        <div style={{ color: colors.textSecondary, fontSize: "14px" }}>{t("common.loading")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {settings.insecure_defaults.length > 0 ? (
            <div
              role="alert"
              style={{
                display: "flex",
                gap: "12px",
                padding: "14px 16px",
                borderRadius: "12px",
                border: `1px solid ${colors.warnBorder}`,
                backgroundColor: colors.warnBg,
              }}
            >
              <AlertTriangle size={20} style={{ color: colors.warnText, flexShrink: 0 }} />
              <div>
                <div style={{ color: colors.warnText, fontSize: "14px", fontWeight: 600 }}>
                  {t("admin.settings.insecureTitle")}
                </div>
                <div style={{ color: colors.textPrimary, fontSize: "13px", marginTop: "4px" }}>
                  {t("admin.settings.insecureHint")}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                  {settings.insecure_defaults.map((name) => (
                    <code key={name} style={{ color: colors.textPrimary, fontSize: "12px" }}>
                      {name}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <Section colors={colors} icon={<Shield size={20} />} iconColor="#2563eb" title={t("admin.settings.accessSection")}>
            <Row colors={colors} label={t("admin.settings.newAccounts")} value={t("admin.settings.newAccountsValue")} />
            <Row
              colors={colors}
              label={t("admin.settings.sessionLifetime")}
              envVar="ACCESS_TOKEN_EXPIRE_MINUTES"
              value={`${settings.session_lifetime_minutes} ${t("admin.settings.minutesShort")}`}
            />
            <Row
              colors={colors}
              label={t("admin.settings.rateLimit")}
              envVar="RATE_LIMIT_RPM"
              value={`${settings.rate_limit_rpm} ${t("admin.settings.perMinute")}`}
            />
          </Section>

          <Section colors={colors} icon={<Mail size={20} />} iconColor="#eab308" title={t("admin.settings.emailSection")}>
            {settings.smtp_configured ? (
              <>
                <Row
                  colors={colors}
                  label={t("admin.settings.smtpServer")}
                  envVar="SMTP_HOST, SMTP_PORT"
                  value={`${settings.smtp_host}:${settings.smtp_port}`}
                />
                <Row
                  colors={colors}
                  label={t("admin.settings.sender")}
                  envVar="SMTP_USER"
                  value={orNotSet(settings.smtp_sender)}
                />
              </>
            ) : (
              <Row
                colors={colors}
                label={t("admin.settings.smtpServer")}
                envVar="SMTP_HOST"
                value={muted(t("admin.settings.smtpNotConfigured"))}
              />
            )}
          </Section>

          <Section colors={colors} icon={<Plug size={20} />} iconColor="#a855f7" title={t("admin.settings.integrationsSection")}>
            <Row colors={colors} label={t("admin.settings.giteaUrl")} envVar="GITEA_PUBLIC_URL" value={orNotSet(settings.gitea_public_url)} />
            <Row colors={colors} label={t("admin.settings.appUrl")} envVar="FRONTEND_URL" value={orNotSet(settings.frontend_url)} />
            <Row
              colors={colors}
              label={t("admin.settings.aiReview")}
              envVar="OPENAI_BASE_URL, OPENAI_MODEL"
              value={settings.ai_review_configured ? settings.ai_review_model : muted(t("admin.settings.notConfigured"))}
            />
          </Section>
        </div>
      )}
    </div>
  );
}
