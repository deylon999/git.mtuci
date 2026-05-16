import fs from "fs";
import path from "path";

const p = path.resolve("src/pages/AdminSettingsPage.tsx");
let s = fs.readFileSync(p, "utf8");

const pairs = [
  ["                  Системные настройки", '                  {t("admin.settings.systemSection")}'],
  ["                  Основные параметры системы", '                  {t("admin.settings.systemSectionHint")}'],
  ["                    Открытая регистрация", '                    {t("admin.settings.openRegistration")}'],
  ["                    Разрешить новым пользователям регистрироваться", '                    {t("admin.settings.openRegistrationHint")}'],
  ["                    Верификация email", '                    {t("admin.settings.emailVerification")}'],
  ["                    Требовать подтверждение email при регистрации", '                    {t("admin.settings.emailVerificationHint")}'],
  ["                    Авто-одобрение пользователей", '                    {t("admin.settings.autoApprove")}'],
  ["                    Автоматически одобрять новых пользователей", '                    {t("admin.settings.autoApproveHint")}'],
  ["                    Режим обслуживания", '                    {t("admin.settings.maintenanceMode")}'],
  ["                    Отключить доступ для обычных пользователей", '                    {t("admin.settings.maintenanceModeHint")}'],
  ["                  Пользователи и лимиты", '                  {t("admin.settings.usersLimits")}'],
  ["                  Управление лимитами и сессиями", '                  {t("admin.settings.usersLimitsHint")}'],
  ["                  Максимальное количество пользователей", '                  {t("admin.settings.maxUsers")}'],
  ["                  Тайм-аут сессии (часы)", '                  {t("admin.settings.sessionTimeout")}'],
  ["                  Уведомления администратора", '                  {t("admin.settings.adminNotifications")}'],
  ["                  Настройка системных уведомлений", '                  {t("admin.settings.adminNotificationsHint")}'],
  ["                    Новые пользователи", '                    {t("admin.settings.notifyNewUsers")}'],
  ["                    Уведомлять о регистрации новых пользователей", '                    {t("admin.settings.notifyNewUsersHint")}'],
  ["                    Ошибки системы", '                    {t("admin.settings.notifySystemErrors")}'],
  ["                    Уведомлять о критических ошибках", '                    {t("admin.settings.notifySystemErrorsHint")}'],
  ["                    Оповещения безопасности", '                    {t("admin.settings.notifySecurity")}'],
  ["                    Уведомлять о подозрительной активности", '                    {t("admin.settings.notifySecurityHint")}'],
  ["                    Ежедневные отчёты", '                    {t("admin.settings.notifyDailyReports")}'],
  ["                    Отправлять ежедневный сводный отчёт", '                    {t("admin.settings.notifyDailyReportsHint")}'],
  ["                  Настройки email", '                  {t("admin.settings.emailSettings")}'],
  ["                  Конфигурация почтового сервера", '                  {t("admin.settings.emailSettingsHint")}'],
  ["                  SMTP сервер", '                  {t("admin.settings.smtpServer")}'],
  ["                    Порт", '                    {t("admin.settings.port")}'],
  ["                    Отправитель", '                    {t("admin.settings.sender")}'],
];

let n = 0;
for (const [from, to] of pairs) {
  if (s.includes(from)) {
    s = s.split(from).join(to);
    n++;
  }
}
fs.writeFileSync(p, s, "utf8");
console.log("settings", n);
