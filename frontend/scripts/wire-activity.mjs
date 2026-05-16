import fs from "fs";
import path from "path";

const p = path.resolve("src/pages/ActivityPage.tsx");
let s = fs.readFileSync(p, "utf8");

s = s.replace(
  `  const eventTypes = [
    { value: "", label: "Все типы" },
    { value: "push", label: "Push" },
    { value: "commit", label: "Commit" },
    { value: "pull_request", label: "Pull Request" },
    { value: "pr_merge", label: "PR Merge" },
    { value: "repo_created", label: "Создание репозитория" },
    { value: "repo_deleted", label: "Удаление репозитория" },
    { value: "fork", label: "Fork" },
    { value: "login", label: "Вход в систему" },
  ];`,
  `  const eventTypes = [
    { value: "", label: t("admin.activity.filterAllTypes") },
    { value: "push", label: "Push" },
    { value: "commit", label: "Commit" },
    { value: "pull_request", label: "Pull Request" },
    { value: "pr_merge", label: "PR Merge" },
    { value: "repo_created", label: t("admin.activity.eventRepoCreated") },
    { value: "repo_deleted", label: t("admin.activity.eventRepoDeleted") },
    { value: "fork", label: "Fork" },
    { value: "login", label: t("admin.activity.eventLogin") },
  ];`,
);

const pairs = [
  ['к вчера', '{t("admin.activity.vsYesterday")}'],
  [">Активность</motion.div>", ">{t(\"admin.activity.title\")}</div>"],
  [">Активность</div>", ">{t(\"admin.activity.title\")}</div>"],
  ["Лента всех событий платформы в реальном времени", '{t("admin.activity.subtitleFull")}'],
  ["<Download size={14} /> Экспорт", '<Download size={14} /> {t("admin.activity.export")}'],
  ['">Загрузка...</div>', '">{t("admin.activity.loading")}</div>'],
  ['">Ошибка загрузки</div>', '">{t("admin.activity.loadError")}</div>'],
  ['marginBottom: "4px" }}>Событий сегодня</motion.div>', 'marginBottom: "4px" }}>{t("admin.activity.statEventsToday")}</div>'],
  ['marginBottom: "4px" }}>Событий сегодня</div>', 'marginBottom: "4px" }}>{t("admin.activity.statEventsToday")}</div>'],
  ['marginBottom: "4px" }}>Коммитов</div>', 'marginBottom: "4px" }}>{t("admin.activity.statCommits")}</motion.div>'],
  ['marginBottom: "4px" }}>Коммитов</motion.div>', 'marginBottom: "4px" }}>{t("admin.activity.statCommits")}</div>'],
  ['marginBottom: "4px" }}>Активных пользователей</div>', 'marginBottom: "4px" }}>{t("admin.activity.statActiveUsers")}</div>'],
  ['marginBottom: "4px" }}>Новых репозиториев</div>', 'marginBottom: "4px" }}>{t("admin.activity.statNewRepos")}</div>'],
  ['placeholder="Поиск по событиям, пользователям, репо..."', 'placeholder={t("admin.activity.searchPlaceholder")}'],
  ['<option value="">Все пользователи</option>', '<option value="">{t("admin.activity.filterAllUsers")}</option>'],
  ['<option value="today">Сегодня</option>', '<option value="today">{t("admin.activity.periodToday")}</option>'],
  ['<option value="week">За неделю</option>', '<option value="week">{t("admin.activity.periodWeek")}</option>'],
  ['<option value="month">За месяц</option>', '<option value="month">{t("admin.activity.periodMonth")}</option>'],
  ['<option value="all">Все время</option>', '<option value="all">{t("admin.activity.periodAll")}</option>'],
  ['Сегодня — {new Date().toLocaleDateString("ru-RU")}', '{tp("admin.activity.todayHeader", { date: new Date().toLocaleDateString(dateLocale) })}'],
  ['activity.type === "commit" && " сделал коммит в "', 'activity.type === "commit" && t("admin.activity.actionCommit")'],
  ['activity.type === "pr" && " открыл Pull Request в "', 'activity.type === "pr" && t("admin.activity.actionPr")'],
  ['activity.type === "push" && " запушил "', 'activity.type === "push" && t("admin.activity.actionPush")'],
  ['activity.type === "create" && " создал "', 'activity.type === "create" && t("admin.activity.actionCreate")'],
  ['activity.type === "fork" && " форкнул "', 'activity.type === "fork" && t("admin.activity.actionFork")'],
  ['activity.type === "merge" && " смёрджил "', 'activity.type === "merge" && t("admin.activity.actionMerge")'],
  ['activity.type === "delete" && " удалил репозиторий "', 'activity.type === "delete" && t("admin.activity.actionDelete")'],
  ["<span>Показано {activities.length} из {totalActivities}</span>", "<span>{tp(\"admin.activity.shownOf\", { shown: activities.length, total: totalActivities })}</span>"],
  ["<span>По</span>", "<span>{t(\"admin.activity.perPage\")}</span>"],
  ['case "Коммит":', 'case "Commit":'],
  ['case "Создание":', 'case "Created":'],
  ['case "Форк":', 'case "Fork":'],
  ['case "Удаление":', 'case "Deleted":'],
  ["              Активность по часам", '              {t("admin.activity.activityByHour")}'],
  ['<span style={{ fontSize: "10px", color: colors.textSecondary, fontWeight: 400 }}>Сегодня</span>', '<span style={{ fontSize: "10px", color: colors.textSecondary, fontWeight: 400 }}>{t("admin.activity.today")}</span>'],
  ['{tooltip.count} событий</div>', '{tp("admin.activity.eventsCount", { n: tooltip.count })}</div>'],
  ["              Топ пользователей", '              {t("admin.activity.topUsers")}'],
  ['По коммитам</span>', '{t("admin.activity.byCommits")}</span>'],
  ["              <span>Горячие репо</span>", '              <span>{t("admin.activity.hotRepos")}</span>'],
  ['title="Рейтинг репозиториев по количеству действий за последние 24 часа"', 'title={t("admin.activity.hotReposHint")}'],
  ["                Сегодня пока затишье", '                {t("admin.activity.quietToday")}'],
  ['{repo.events} событие</span>', '{tp("admin.activity.eventsCount", { n: repo.events })}</span>'],
];

let n = 0;
for (const [from, to] of pairs) {
  if (s.includes(from)) {
    s = s.split(from).join(to);
    n++;
  }
}
fs.writeFileSync(p, s, "utf8");
console.log("activity", n, "cyrillic", (s.match(/[\u0400-\u04FF]/g) || []).length);
