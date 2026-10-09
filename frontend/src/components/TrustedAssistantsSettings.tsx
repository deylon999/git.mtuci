import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import toast from "react-hot-toast";
import { getLaborants, trustLaborant, untrustLaborant, type Laborant } from "../api/rolesApi";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { getTheme } from "../theme";

/** Lets an instructor (or admin) pick the teaching assistants who may grade in their own courses. */
export default function TrustedAssistantsSettings({ isDarkTheme = false }: { isDarkTheme?: boolean }) {
  const { t } = useUserPreferences();
  const theme = getTheme(isDarkTheme);
  const [assistants, setAssistants] = useState<Laborant[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLaborants()
      .then((list) => {
        if (!cancelled) setAssistants(list);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (assistant: Laborant) => {
    if (togglingId) return;
    setTogglingId(assistant.id);
    try {
      if (assistant.trusted) {
        await untrustLaborant(assistant.id);
        toast.success(t("admin.roles.laborantRemoved"));
      } else {
        await trustLaborant(assistant.id);
        toast.success(t("admin.roles.laborantAdded"));
      }
      setAssistants((prev) => prev?.map((a) => (a.id === assistant.id ? { ...a, trusted: !a.trusted } : a)) ?? prev);
    } catch {
      toast.error(t("admin.roles.trustError"));
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div
      style={{
        backgroundColor: theme.bgCard,
        border: `1px solid ${theme.border}`,
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
            backgroundColor: isDarkTheme ? "rgba(16, 185, 129, 0.2)" : "rgba(16, 185, 129, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Users size={20} style={{ color: "#10b981" }} />
        </div>
        <div>
          <h3 style={{ color: theme.text, fontSize: "16px", fontWeight: 600, margin: 0 }}>
            {t("admin.roles.trustedTitle")}
          </h3>
          <p style={{ color: theme.text2, fontSize: "12px", margin: "2px 0 0 0" }}>{t("admin.roles.assistantHint")}</p>
        </div>
      </div>

      {loadFailed ? (
        <p style={{ color: theme.text2, fontSize: "13px" }}>{t("admin.roles.assistantsLoadError")}</p>
      ) : assistants === null ? (
        <p style={{ color: theme.text2, fontSize: "13px" }}>{t("common.loading")}</p>
      ) : assistants.length === 0 ? (
        <p style={{ color: theme.text2, fontSize: "13px" }}>{t("admin.roles.noAssistants")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {assistants.map((assistant) => (
            <div
              key={assistant.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                padding: "10px 12px",
                borderRadius: "8px",
                backgroundColor: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                <span
                  style={{
                    width: "30px",
                    height: "30px",
                    flexShrink: 0,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#10b981",
                    backgroundColor: isDarkTheme ? "rgba(16, 185, 129, 0.2)" : "rgba(16, 185, 129, 0.12)",
                  }}
                >
                  {assistant.initials}
                </span>
                <span style={{ color: theme.text, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {assistant.name}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={assistant.trusted}
                aria-label={assistant.name}
                disabled={togglingId === assistant.id}
                onClick={() => void toggle(assistant)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  assistant.trusted ? "bg-blue-600" : isDarkTheme ? "bg-[#2d2d2d]" : "bg-gray-300"
                }`}
              >
                <span
                  className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                    assistant.trusted ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
