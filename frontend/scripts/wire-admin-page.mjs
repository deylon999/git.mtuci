import fs from "fs";
import path from "path";

const p = path.resolve("src/pages/AdminPage.tsx");
let s = fs.readFileSync(p, "utf8");

const pairs = [
  ['style={{ color: theme.text }}>Новые пользователи</h2>', 'style={{ color: theme.text }}>{t("admin.dashboard.newUsers")}</h2>'],
  [">Все <ArrowRight", ">{t(\"admin.dashboard.viewAll\")} <ArrowRight"],
  ['style={{ color: theme.text2 }}>Загрузка...</motion.div>', 'style={{ color: theme.text2 }}>{t("common.loading")}</div>'],
  ['style={{ color: theme.text2 }}>Загрузка...</motion.div>', 'style={{ color: theme.text2 }}>{t("common.loading")}</div>'],
  ['style={{ color: theme.text2 }}>Загрузка...</div>', 'style={{ color: theme.text2 }}>{t("common.loading")}</motion.div>'],
  ['style={{ color: theme.text2 }}>Загрузка...</div>', 'style={{ color: theme.text2 }}>{t("common.loading")}</motion.div>'],
  ['style={{ color: theme.text2 }}>Загрузка...</div>', 'style={{ color: theme.text2 }}>{t("common.loading")}</motion.div>'],
];

// fix loading - simple replace
s = s.replace('style={{ color: theme.text2 }}>Загрузка...</div>', 'style={{ color: theme.text2 }}>{t("common.loading")}</div>');
s = s.replace('style={{ color: theme.text2 }}>Загрузка метрик...</div>', 'style={{ color: theme.text2 }}>{t("admin.dashboard.loadingMetrics")}</div>');

const more = [
  ['style={{ color: theme.text2 }}>Имя</th>', 'style={{ color: theme.text2 }}>{t("admin.dashboard.colName")}</th>'],
  ['style={{ color: theme.text2 }}>Группа</th>', 'style={{ color: theme.text2 }}>{t("admin.dashboard.colGroup")}</th>'],
  ['style={{ color: theme.text2 }}>Роль</th>', 'style={{ color: theme.text2 }}>{t("admin.dashboard.colRole")}</th>'],
  ['style={{ color: theme.text2 }}>Дата</th>', 'style={{ color: theme.text2 }}>{t("admin.dashboard.colDate")}</th>'],
  ['style={{ color: theme.text2 }}>Статус</th>', 'style={{ color: theme.text2 }}>{t("admin.dashboard.colStatus")}</th>'],
  ['user.role === "admin" ? "Админ" : user.role === "teacher" ? "Препод" : user.role === "laborant" ? "Лаборант" : "Студент"',
    'user.role === "admin" ? t("admin.users.roleShortAdmin") : user.role === "teacher" ? t("admin.users.roleShortTeacher") : user.role === "laborant" ? t("admin.users.roleShortLaborant") : t("admin.users.roleShortStudent")'],
  ['toLocaleDateString("ru-RU")', 'toLocaleDateString(dateLocale)'],
  ['getStatusBadge(user.is_blocked ? "blocked" : "active")', 'getStatusBadge(user.is_blocked ? "blocked" : user.is_pending ? "pending" : "active", t)'],
  ['style={{ color: theme.text2 }}>Нет данных</td>', 'style={{ color: theme.text2 }}>{t("admin.dashboard.noData")}</td>'],
  ['style={{ color: theme.text }}>Активные репозитории</h2>', 'style={{ color: theme.text }}>{t("admin.dashboard.activeRepos")}</h2>'],
  ["                          Создать репозиторий", '                          {t("admin.dashboard.createRepo")}'],
  ["                        Поиск проекта", '                        {t("admin.dashboard.searchProject")}'],
  ["                        Фильтр по кафедре", '                        {t("admin.dashboard.filterFaculty")}'],
  ["                        Обновить список", '                        {t("admin.dashboard.refreshList")}'],
  ["                    Нет активных репозиториев", '                    {t("admin.dashboard.noActiveRepos")}'],
  ['{repo.author} • {repo.commits} коммитов</p>', '{repo.author} • {tp("admin.dashboard.commitsCount", { n: repo.commits })}</p>'],
  ['style={{ color: theme.text }}>Уведомления</h2>', 'style={{ color: theme.text }}>{t("admin.dashboard.notifications")}</h2>'],
  ["                  Очистить все", '                  {t("admin.dashboard.clearAll")}'],
  ['<p className="text-sm">Уведомлений пока нет</p>', '<p className="text-sm">{t("admin.dashboard.noNotifications")}</p>'],
  ['style={{ color: theme.text }}>Коммиты по кафедрам</h2>', 'style={{ color: theme.text }}>{t("admin.dashboard.commitsByFaculty")}</h2>'],
  ["                    Нет данных о коммитах", '                    {t("admin.dashboard.noCommitData")}'],
  ["                  Code Review в очереди", '                  {t("admin.dashboard.codeReviewQueue")}'],
  ['{item.pr} на ревью</p>', '{tp("admin.dashboard.prOnReview", { pr: item.pr })}</p>'],
  ['status: "Срочно"', 'status: t("admin.dashboard.urgent")'],
  ['status: "Сегодня"', 'status: t("admin.dashboard.today")'],
  ['status: "Норм"', 'status: t("admin.dashboard.normal")'],
  ['style={{ color: theme.text }}>Состояние системы</h2>', 'style={{ color: theme.text }}>{t("admin.dashboard.systemState")}</h2>'],
  ['{ label: "Диск", value:', '{ label: t("admin.dashboard.disk"), value:'],
  ['{ icon: GitBranch, label: "Git сервис",', '{ icon: GitBranch, label: t("admin.dashboard.gitService"),'],
  ['{ icon: Database, label: "БД (PostgreSQL)",', '{ icon: Database, label: t("admin.dashboard.dbLabel"),'],
  ['style={{ color: theme.text3 }}>Бэкап</span>', 'style={{ color: theme.text3 }}>{t("admin.dashboard.backupLabel")}</span>'],
  ['{backupInfo?.last_backup || "Нет данных"}', '{backupInfo?.last_backup || t("admin.dashboard.noBackupData")}'],
  ['{loading ? "Обновление..." : "Обновить данные"}', '{loading ? t("admin.dashboard.refreshing") : t("admin.dashboard.refreshData")}'],
  ['{backupLoading ? "Создание..." : "Бэкап сейчас"}', '{backupLoading ? t("admin.dashboard.backupCreating") : t("admin.dashboard.backupNow")}'],
];

let n = 0;
for (const [from, to] of [...pairs, ...more]) {
  if (s.includes(from)) {
    s = s.split(from).join(to);
    n++;
  }
}
fs.writeFileSync(p, s, "utf8");
console.log("admin page", n);
console.log("cyrillic", (s.match(/[\u0400-\u04FF]/g) || []).length);
