import fs from "fs";
import path from "path";

const p = path.resolve("src/pages/RolesPage.tsx");
let s = fs.readFileSync(p, "utf8");

s = s.replace(/pluralizeUsers\(/g, 'pluralWord(language, "admin.roles.users", ');

const pairs = [
  ["getLevelBadge(level, isDarkTheme)", "getLevelBadge(level, isDarkTheme, t)"],
  ['toast.success("Лаборант убран из доверенных")', 'toast.success(t("admin.roles.laborantRemoved"))'],
  ['toast.success("Лаборант добавлен в доверенные")', 'toast.success(t("admin.roles.laborantAdded"))'],
  ['toast.error("Ошибка при изменении доверия")', 'toast.error(t("admin.roles.trustError"))'],
  ['toast.success("Права доступа сохранены")', 'toast.success(t("admin.roles.permissionsSaved"))'],
  ['toast.error("Ошибка при сохранении прав. Проверьте консоль (F12)")', 'toast.error(t("admin.roles.permissionsSaveError"))'],
  ['toast.success("Права сброшены по умолчанию")', 'toast.success(t("admin.roles.permissionsReset"))'],
  ['toast.error("Ошибка при сбросе прав. Проверьте консоль (F12)")', 'toast.error(t("admin.roles.permissionsResetError"))'],
  ['title="Роли и доступ"', 'title={t("admin.roles.title")}'],
  ['subtitle={`${roles.length} ролей`}', 'subtitle={`${roles.length} ${pluralWord(language, "admin.roles.users", roles.length).replace(/^\\w+\\s/, "") || ""}`}'],
  ["              Выбрать роль для редактирования", '              {t("admin.roles.selectRole")}'],
  ["                        Выбрана", '                        {t("admin.roles.selected")}'],
  ["                        Системная", '                        {t("admin.roles.systemRole")}'],
  ['{currentRole?.name || "Роль"}', '{currentRole?.name || t("admin.roles.roleFallback")}'],
  ["                <span className={textTertiary}>права доступа</span>", '                <span className={textTertiary}>{t("admin.roles.accessRights")}</span>'],
  ["                  Сбросить", '                  {t("admin.roles.reset")}'],
  ["                  Сохранить", '                  {t("admin.roles.save")}'],
  ["                          История изменений прав", '                          {t("admin.roles.permissionHistory")}'],
  ["                            Нет записей для этой роли", '                            {t("admin.roles.noHistory")}'],
  ['log.action === "save_batch" ? "изменил права" :', 'log.action === "save_batch" ? t("admin.roles.changedPermissions") :'],
  ['log.action === "reset" ? "сбросил права" : log.action', 'log.action === "reset" ? t("admin.roles.resetPermissions") : log.action'],
  ["                        УПРАВЛЕНИЕ АССИСТЕНТАМИ", '                        {t("admin.roles.assistantManagement")}'],
  ["                          <p className={`text-sm font-medium ${textPrimary}`}>Разрешить лаборантам проверку моих курсов</p>", '                          <p className={`text-sm font-medium ${textPrimary}`}>{t("admin.roles.allowAssistantGrading")}</p>'],
  ["                          <p className={`text-xs ${textSecondary}`}>Доверенные лаборанты смогут выставлять оценки</p>", '                          <p className={`text-xs ${textSecondary}`}>{t("admin.roles.allowAssistantGradingHint")}</p>'],
  ['toast.success(newValue ? "Лаборантам разрешена проверка" : "Лаборантам запрещена проверка")', 'toast.success(newValue ? t("admin.roles.assistantGradingAllowed") : t("admin.roles.assistantGradingDenied"))'],
  ['toast.error("Ошибка при сохранении настройки")', 'toast.error(t("admin.roles.settingSaveError")'],
  ['assistant.trusted ? "Доверенный" : "Не доверенный"', 'assistant.trusted ? t("admin.roles.trusted") : t("admin.roles.notTrusted")'],
  ['"РЕПОЗИТОРИИ": GitBranch', '"REPOS": GitBranch'],
  ['title: "РЕПОЗИТОРИИ"', 'title: t("admin.roles.sectionRepos")'],
  ['title: "ПОЛЬЗОВАТЕЛИ И ГРУППЫ"', 'title: t("admin.roles.sectionUsers")'],
  ['title: "ОЦЕНКИ И ЗАДАНИЯ"', 'title: t("admin.roles.sectionGrades")'],
  ['title: "СИСТЕМА"', 'title: t("admin.roles.sectionSystem")'],
];

// fix subtitle simpler
s = s.replace(
  'subtitle={`${roles.length} ${pluralWord(language, "admin.roles.users", roles.length).replace(/^\\w+\\s/, "") || ""}`}',
  'subtitle={`${roles.length} ${t("admin.roles.title").toLowerCase().includes("role") ? "roles" : ""}`}',
);

// simpler subtitle
s = s.replace(
  /subtitle=\{`[^`]+`\}/,
  'subtitle={`${roles.length}`}',
);

let n = 0;
for (const [from, to] of pairs) {
  if (s.includes(from)) {
    s = s.split(from).join(to);
    n++;
  }
}

// roles count subtitle
s = s.replace(
  'subtitle={`${roles.length}`}',
  'subtitle={`${roles.length} ${language === "en" ? "roles" : "ролей"}`}',
);

// fix broken toast.error line if missing paren
if (s.includes('toast.error(t("admin.roles.settingSaveError")')) {
  s = s.replace('toast.error(t("admin.roles.settingSaveError")', 'toast.error(t("admin.roles.settingSaveError"))');
}

fs.writeFileSync(p, s, "utf8");
console.log("roles", n);
