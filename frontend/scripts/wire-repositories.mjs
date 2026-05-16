import fs from "fs";
import path from "path";

const p = path.resolve("src/pages/RepositoriesPage.tsx");
let s = fs.readFileSync(p, "utf8");

const pairs = [
  ['label: "Всего репо"', 'label: t("repo.repositories.statTotal")'],
  ['label: "Публичных"', 'label: t("repo.repositories.statPublic")'],
  ['label: "Приватных"', 'label: t("repo.repositories.statPrivate")'],
  ['label: "Курсовых"', 'label: t("repo.repositories.statCourse")'],
  ['label: "Заблокированных"', 'label: t("repo.repositories.statBlocked")'],
  ['label: "Все типы"', 'label: t("repo.repositories.filterAllTypes")'],
  ['label: "Публичный"', 'label: t("repo.visibility.public")'],
  ['label: "Приватный"', 'label: t("repo.visibility.private")'],
  ['label: "Курсовой"', 'label: t("repo.visibility.course")'],
  ['label: "Все статусы"', 'label: t("repo.repositories.filterAllStatuses")'],
  ['label: "Активные"', 'label: t("repo.repositories.filterActive")'],
  ['label: "Заблокированные"', 'label: t("repo.repositories.filterBlocked")'],
  [">Ошибка загрузки</p>", ">{t(\"repo.repositories.loadError\")}</p>"],
  [">Повторить", ">{t(\"repo.repositories.retry\")}"],
  [">Все репозитории</h1>", ">{t(\"repo.repositories.title\")}</h1>"],
  ["{totalCount} репозиториев", '{tp("repo.repositories.reposCount", { n: totalCount })}'],
  ["              Экспорт CSV", '              {t("repo.repositories.exportCsv")}'],
  ["              Создать репо", '              {t("repo.repositories.createRepo")}'],
  ['placeholder="Поиск по наз..."', 'placeholder={t("repo.repositories.searchPlaceholder")}'],
  ['label="Все типы"', 'label={t("repo.repositories.filterAllTypes")}'],
  ['label="Все статусы"', 'label={t("repo.repositories.filterAllStatuses")}'],
  ["              Удалить выбранные", '              {t("repo.repositories.deleteSelected")}'],
  ["                  Репозиторий", '                  {t("repo.repositories.colRepository")}'],
  ['adminPages.repositories.colType', 'repo.repositories.colRepository'], // skip
  ["                  Тип", '                  {t("admin.repositories.colType")}'],
  ["                  Язык", '                  {t("repo.repositories.colLanguage")}'],
  ["                  Владелец", '                  {t("admin.repositories.colOwner")}'],
  ["                  Коммиты", '                  {t("repo.repositories.colCommits")}'],
  ["                  Статус", '                  {t("admin.repositories.colStatus")}'],
  ["                    Репозитории не найдены", '                    {t("repo.repositories.notFound")}'],
  ['<span className="ml-2 text-red-400 text-xs">(заблокирован)</span>', '<span className="ml-2 text-red-400 text-xs">{t("repo.repositories.blockedSuffix")}</span>'],
  ["                            Заблокирован", '                            {t("repo.repositories.statusBlocked")}'],
  ["                            Активен", '                            {t("repo.repositories.statusActive")}'],
  ["getTypeBadge(repo.repo_type)", "getTypeBadge(repo.repo_type, t)"],
  ["formatDate(repo.updated_at)", "formatDate(repo.updated_at, t, tp, dateLocale)"],
];

let n = 0;
for (const [from, to] of pairs) {
  if (s.includes(from)) {
    s = s.split(from).join(to);
    n++;
  }
}
fs.writeFileSync(p, s, "utf8");
console.log("repos", n, "cyrillic", (s.match(/[\u0400-\u04FF]/g) || []).length);
