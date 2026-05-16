import fs from "fs";
import path from "path";

function apply(fileRel, pairs, hook = true) {
  const p = path.resolve(fileRel);
  let s = fs.readFileSync(p, "utf8");
  if (hook && !s.includes("useUserPreferences")) {
    const imp = 'import { useUserPreferences } from "../context/UserPreferencesContext";\n';
    const imp2 = 'import { useUserPreferences } from "../../context/UserPreferencesContext";\n';
    if (fileRel.startsWith("components/repo/")) {
      s = s.replace(/^(import .+\n)+/m, (m) => m + imp2);
    } else if (fileRel.startsWith("components/")) {
      s = s.replace(/^(import .+\n)+/m, (m) => m + imp);
    } else if (fileRel.startsWith("pages/")) {
      s = s.replace(/^(import .+\n)+/m, (m) => m + imp);
    }
  }
  let n = 0;
  for (const [from, to] of pairs) {
    if (s.includes(from)) {
      s = s.split(from).join(to);
      n++;
    }
  }
  fs.writeFileSync(p, s, "utf8");
  const cy = (s.match(/[\u0400-\u04FF]/g) || []).length;
  console.log(fileRel, n, "cyrillic", cy);
}

apply("src/pages/StudentRepositorySectionPage.tsx", [
  ["          Загрузка…", '          {t("repo.section.loadingShort")}'],
  ['title="Нет issues"', 'title={t("repo.section.noIssuesTitle")}'],
  ['hint="Создайте issue в Gitea или выберите другой фильтр."', 'hint={t("repo.section.noIssuesHint")}'],
  ["            Загрузить ещё", '            {t("repo.section.loadMore")}'],
  ['title="Нет pull requests"', 'title={t("repo.section.noPrTitle")}'],
  ['hint="Создайте ветку, внесите изменения и откройте pull request в этот репозиторий."', 'hint={t("repo.section.noPrHint")}'],
  ['title="Wiki не настроена"', 'title={t("repo.section.wikiEmptyTitle")}'],
  ['hint="Включите wiki в настройках репозитория и создайте первую страницу в Gitea — она появится здесь."', 'hint={t("repo.section.wikiEmptyHint")}'],
  ["            Страницы", '            {t("repo.section.wikiPages")}'],
  ["              Пустая страница", '              {t("repo.section.emptyPage")}'],
  ['<span>обновлено {formatRelativeTime(item.updated_at)}</span>', '<span>{t("repo.section.updated").replace("{time}", formatRelativeTime(item.updated_at))}</span>'],
]);

// add t to panel functions - inject hook at start of IssuesPanel
let sec = fs.readFileSync(path.resolve("src/pages/StudentRepositorySectionPage.tsx"), "utf8");
if (!sec.includes("function IssuesPanel")) {
  console.log("skip issues hook");
} else {
  sec = sec.replace(
    "function IssuesPanel({ theme, repoId }: { theme: ThemeColors; repoId: string }) {",
    "function IssuesPanel({ theme, repoId }: { theme: ThemeColors; repoId: string }) {\n  const { t } = useUserPreferences();",
  );
  sec = sec.replace(
    "function PullsPanel({ theme, repoId }: { theme: ThemeColors; repoId: string }) {",
    "function PullsPanel({ theme, repoId }: { theme: ThemeColors; repoId: string }) {\n  const { t } = useUserPreferences();",
  );
  sec = sec.replace(
    "function WikiPanel({ theme, repoId }: { theme: ThemeColors; repoId: string }) {",
    "function WikiPanel({ theme, repoId }: { theme: ThemeColors; repoId: string }) {\n  const { t } = useUserPreferences();",
  );
  sec = sec.replace(
    "function IssueRow({ theme, item }: { theme: ThemeColors; item: StudentRepoIssue }) {",
    "function IssueRow({ theme, item }: { theme: ThemeColors; item: StudentRepoIssue }) {\n  const { t } = useUserPreferences();",
  );
  fs.writeFileSync(path.resolve("src/pages/StudentRepositorySectionPage.tsx"), sec, "utf8");
}

apply("src/components/repo/RepoMonacoViewer.tsx", [
  ['label: "Проверяем файл…"', 'label: t("repo.lint.checking")'],
  ['label: "Линтер недоступен"', 'label: t("repo.lint.linterUnavailable")'],
  ['res.skipped ? res.message ?? "Проверка пропущена"', 'res.skipped ? res.message ?? t("repo.lint.checkSkipped")'],
  ['label: "Замечаний нет"', 'label: t("repo.lint.noIssues")'],
  ["            Редактор…", '            {t("repo.monaco.loading")}'],
], true);

apply("src/components/repo/RepoCodeToolbar.tsx", [
  ['note: "Не удалось получить токен — для приватного репо может понадобиться логин Gitea."', 'note: t("repo.clone.tokenNote")'],
  ['toast.error("Не удалось скопировать")', 'toast.error(t("repo.errors.copyFailed")'],
  ["                Подготовка команды…", '                {t("repo.clone.preparing")}'],
  ['"Команда git clone скопирована"', 't("repo.clone.cloneCopied")'],
  ['? "Скопировать git clone (с токеном)"', '? t("repo.clone.copyWithToken")'],
  ['"Скопировать git clone (HTTPS)"', 't("repo.clone.copyHttps")'],
  ["                URL Gitea недоступен", '                {t("repo.clone.giteaUnavailable")}'],
  ['"Ссылка на страницу MTUCI скопирована"', 't("repo.clone.pageLinkCopied")'],
  ["                Ссылка на страницу (не для git)", '                {t("repo.clone.pageLink")}'],
  ["                Открыть в Gitea", '                {t("repo.clone.openGitea")}'],
  ['placeholder="Поиск по файлам…"', 'placeholder={t("repo.clone.searchFiles")}'],
  ["                Поиск…", '                {t("repo.clone.searching")}'],
  ["                Ничего не найдено", '                {t("repo.clone.notFound")}'],
  ["        Добавить", '        {t("repo.toolbar.newFile")}'],
  ["          Клонировать", '          {t("repo.clone.clone")}'],
], true);

// add keys for clone.preparing, pageLink, clone, giteaUnavailable to repo en/ru if missing

apply("src/components/repo/RepoCreateFileModal.tsx", [
  ['setError("Укажите путь к файлу")', 'setError(t("repo.errors.filePathRequired")'],
  ['err.message : "Не удалось создать файл"', 'err.message : t("repo.errors.createFileFailed")'],
  ["            Новый файл", '            {t("repo.createFile.title")}'],
  ['aria-label="Закрыть"', 'aria-label={t("common.close")}'],
  ["            Ветка", '            {t("repo.createFile.branch")}'],
  ["            Путь к файлу", '            {t("repo.createFile.pathLabel")}'],
  ["            Сообщение коммита", '            {t("repo.createFile.commitMessage")}'],
  ["            Содержимое", '            {t("repo.createFile.content")}'],
  ["            Отмена", '            {t("common.cancel")}'],
  ["            Создать", '            {t("repo.createFile.submit")}'],
], true);
