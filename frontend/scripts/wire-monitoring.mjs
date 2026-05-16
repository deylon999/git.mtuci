import fs from "fs";
import path from "path";

const p = path.resolve("src/pages/MonitoringPage.tsx");
let s = fs.readFileSync(p, "utf8");

const pairs = [
  [">Дисковое хранилище</div>", ">{t(\"admin.monitoring.diskStorage\")}</div>"],
  ["{metrics?.disk_percent || 0}% заполнен", '{tp("admin.monitoring.diskPercent", { n: metrics?.disk_percent || 0 })}'],
  ["{metrics?.disk_used_gb?.toFixed(1) || 0} ГБ из {metrics?.disk_total_gb?.toFixed(1) || 0} ГБ",
    '{tp("admin.monitoring.diskUsage", { used: metrics?.disk_used_gb?.toFixed(1) || 0, total: metrics?.disk_total_gb?.toFixed(1) || 0 })}'],
  ["              Ресурсы сервера", '              {t("admin.monitoring.serverResources")}'],
  ["обновлено {secondsSinceUpdate} сек назад", '{tp("admin.monitoring.updatedAgo", { n: secondsSinceUpdate })}'],
  [">Диск</span>", ">{t(\"admin.dashboard.disk\")}</span>"],
  [">Сеть ↑</span>", ">{t(\"admin.monitoring.networkUp\")}</span>"],
  [">Сеть ↓</span>", ">{t(\"admin.monitoring.networkDown\")}</span>"],
  [">Модель CPU</span>", ">{t(\"admin.monitoring.cpuModel\")}</span>"],
  [">RAM всего</span>", ">{t(\"admin.monitoring.ramTotal\")}</span>"],
  [">RAM использовано</span>", ">{t(\"admin.monitoring.ramUsed\")}</span>"],
  [">Диск всего</span>", ">{t(\"admin.monitoring.diskTotal\")}</span>"],
  [">Диск свободно</span>", ">{t(\"admin.monitoring.diskFree\")}</span>"],
  [" || 0} ГБ\n", ' || 0} {t("admin.monitoring.gb")}\n'],
  ["              Состояние сервисов", '              {t("admin.monitoring.servicesState")}'],
  [">Последний бэкап</div>", ">{t(\"admin.monitoring.lastBackup\")}</div>"],
  [">Дата</span>", ">{t(\"admin.monitoring.date\")}</span>"],
  [">Размер</span>", ">{t(\"admin.monitoring.size\")}</span>"],
  [">Статус</span>", ">{t(\"admin.monitoring.status\")}</span>"],
  [">Следующий</span>", ">{t(\"admin.monitoring.next\")}</span>"],
  ['backups?.last_backup ? "Успешно" : "Нет данных"', 'backups?.last_backup ? t("admin.monitoring.success") : t("admin.dashboard.noBackupData")'],
  [': "Нет данных"}', ': t("admin.dashboard.noBackupData")}'],
  ["              HTTP запросы", '              {t("admin.monitoring.httpRequests")}'],
  [">За последний час</span>", ">{t(\"admin.monitoring.lastHour\")}</span>"],
  ['marginBottom: "2px" }}>Всего</div>', 'marginBottom: "2px" }}>{t("admin.monitoring.total")}</div>'],
  ['marginBottom: "2px" }}>Ошибок</div>', 'marginBottom: "2px" }}>{t("admin.monitoring.errors")}</div>'],
  [" || 0} мс", ' || 0} {t("admin.monitoring.ms")}'],
  [">RPS (сейчас)</span>", ">{t(\"admin.monitoring.rpsNow\")}</span>"],
  [">Активных соединений</span>", ">{t(\"admin.monitoring.activeConnections\")}</span>"],
  [">Размер БД</span>", ">{t(\"admin.monitoring.dbSize\")}</span>"],
  [">Таблиц</span>", ">{t(\"admin.monitoring.tables\")}</span>"],
  [">Запросов/сек</span>", ">{t(\"admin.monitoring.queriesPerSec\")}</span>"],
  [">Последняя миграция</span>", ">{t(\"admin.monitoring.lastMigration\")}</span>"],
  ["                Топ таблиц по размеру", '                {t("admin.monitoring.topTables")}'],
  ["              Инциденты и алерты", '              {t("admin.monitoring.incidents")}'],
  [">Последние 24ч</span>", ">{t(\"admin.monitoring.last24h\")}</span>"],
  [">Активно</div>", ">{t(\"admin.monitoring.active\")}</div>"],
  ["                  Нет активных инцидентов", '                  {t("admin.monitoring.noIncidents")}'],
  [">Перезапустить API?</motion.div>", ">{t(\"admin.monitoring.restartConfirmTitle\")}</div>"],
  [">Перезапустить API?</div>", ">{t(\"admin.monitoring.restartConfirmTitle\")}</div>"],
  ["Сервис будет недоступен ~10 секунд.", '{t("admin.monitoring.restartConfirmMsg")}'],
  [">Отмена</button>", ">{t(\"common.cancel\")}</button>"],
  ['{restartLoading ? "Перезапуск..." : "Перезапустить"}', '{restartLoading ? t("admin.monitoring.restarting") : t("admin.monitoring.restart")}'],
  ["{metrics?.database?.connections_active || 0} соединений · v{serviceStatus?.db_version || \"15.2\"}",
    '{tp("admin.monitoring.dbConnections", { n: metrics?.database?.connections_active || 0, version: serviceStatus?.db_version || "15.2" })}'],
  ["{serviceStatus?.git_repos_count || 0} репо · v{serviceStatus?.git_version || \"1.21.4\"}",
    '{tp("admin.monitoring.gitRepos", { n: serviceStatus?.git_repos_count || 0, version: serviceStatus?.git_version || "1.21.4" })}'],
  [" || 0} МБ", ' || 0} {t("admin.monitoring.mb")}'],
  ["                      Диск заполнен на {metrics.disk_percent.toFixed(0)}% — рекомендуется очистить старые логи или расширить хранилище",
    '{tp("admin.monitoring.diskAlert", { n: metrics.disk_percent.toFixed(0) })}'],
  ["                      FastAPI недоступен", '                      {t("admin.monitoring.apiDownAlert")}'],
  ['onClick={restartAPI}', 'onClick={handleRestartAPI}'],
  ['toLocaleString("ru-RU"', 'toLocaleString(dateLocale'],
];

let n = 0;
for (const [from, to] of pairs) {
  if (s.includes(from)) {
    s = s.split(from).join(to);
    n++;
  }
}
fs.writeFileSync(p, s, "utf8");
console.log("replacements", n);
console.log("cyrillic left", (s.match(/[\u0400-\u04FF]/g) || []).length);
