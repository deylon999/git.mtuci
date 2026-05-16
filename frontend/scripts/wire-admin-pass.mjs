import fs from "fs";
import path from "path";

const root = path.resolve("src/pages");

const files = {
  "UsersPage.tsx": [
    ['showToast("Вы не можете изменить статус пользователя с ролью Администратор", "error")', 'showToast(t("admin.users.cannotChangeAdminStatus"), "error")'],
    ['showToast(currentlyBlocked ? "Пользователь разблокирован" : "Пользователь заблокирован", "success")', 'showToast(currentlyBlocked ? t("admin.users.unblocked") : t("admin.users.blocked"), "success")'],
    ['showToast("Ошибка при изменении статуса", "error")', 'showToast(t("admin.users.statusChangeError"), "error")'],
    ['showToast("Вы не можете подтвердить пользователя с ролью Администратор", "error")', 'showToast(t("admin.users.cannotConfirmAdmin"), "error")'],
    ['showToast("Пользователь подтвержден", "success")', 'showToast(t("admin.users.confirmed"), "success")'],
    ['showToast("Ошибка при подтверждении", "error")', 'showToast(t("admin.users.confirmError"), "error")'],
    ['showToast("Вы не можете редактировать пользователя с ролью Администратор", "error")', 'showToast(t("admin.users.cannotEditAdmin"), "error")'],
    ['showToast("Изменения сохранены", "success")', 'showToast(t("admin.users.saved"), "success")'],
    ['showToast("Ошибка при сохранении", "error")', 'showToast(t("admin.users.saveError"), "error")'],
    ['setError("Ошибка загрузки пользователей")', 'setError(t("admin.users.loadError"))'],
    ['showToast("Пользователи успешно экспортированы", "success")', 'showToast(t("admin.users.exportSuccess"), "success")'],
    ['showToast("Ошибка при экспорте", "error")', 'showToast(t("admin.users.exportError"), "error")'],
    ['showToast("Ошибка при импорте", "error")', 'showToast(t("admin.users.importError"), "error")'],
    ['label: "Всего"', 'label: t("admin.users.statTotal")'],
    ['label: "Активных"', 'label: t("admin.users.statActive")'],
    ['label: "Ожидают"', 'label: t("admin.users.statPending")'],
    ['label: "Заблокировано"', 'label: t("admin.users.statBlocked")'],
    ['title="Все пользователи"', 'title={t("admin.users.title")}'],
    ['{exporting ? "Экспорт..." : "Экспорт CSV"}', '{exporting ? t("admin.users.exporting") : t("admin.users.exportCsv")}'],
    ['{importing ? "Импорт..." : "Импорт"}', '{importing ? t("admin.users.importing") : t("admin.users.import")}'],
    ['>Добавить<', '>{t("admin.users.addUser")}<'],
    ['"Все роли"', 't("admin.users.filterAllRoles")'],
    ['"Администратор"', 't("admin.users.roleAdminFull")'],
    ['"Преподаватель"', 't("admin.users.roleTeacherFull")'],
    ['"Лаборант"', 't("admin.users.roleLaborantFull")'],
    ['"Студент"', 't("admin.users.roleStudentFull")'],
    ['"Все статусы"', 't("admin.users.filterAllStatuses")'],
    ['"Все группы"', 't("admin.users.filterAllGroups")'],
    ['>Нет групп<', '>{t("admin.users.noGroups")}<'],
    ['>Удалить выбранных', '>{t("admin.users.deleteSelected").replace("({n})", "")}<'],
    ['>Пользователь</th>', '>{t("admin.users.colUser")}</th>'],
    ['>Группа</th>', '>{t("admin.users.colGroup")}</th>'],
    ['>Роль</th>', '>{t("admin.users.colRole")}</th>'],
    ['>Статус</th>', '>{t("admin.users.colStatus")}</th>'],
    ['>Репо</th>', '>{t("admin.users.colRepos")}</th>'],
    ['>Последний вход</th>', '>{t("admin.users.colLastLogin")}</th>'],
    ['>Действия</th>', '>{t("admin.users.colActions")}</th>'],
    ['>Пользователи не найдены<', '>{t("admin.users.notFound")}<'],
    ['>Сбросить фильтры<', '>{t("admin.users.resetFilters")}<'],
    [' репо</td>', ' {t("admin.users.reposCount").replace("{n}", String(user.repos))}</td>'],
    ['title="Недостаточно прав для изменения этого профиля"', 'title={t("admin.users.noPermission")}'],
    ['placeholder="Поиск по ФИО..."', 'placeholder={t("admin.users.searchPlaceholder")}'],
    ['>Профиль пользователя<', '>{t("admin.users.profileModal")}<'],
    ['>Редактирование пользователя<', '>{t("admin.users.editModal")}<'],
    ['>Роль</p>', '>{t("admin.users.fieldRole")}</p>'],
    ['>Группа</p>', '>{t("admin.users.fieldGroup")}</p>'],
    ['>Статус</p>', '>{t("admin.users.colStatus")}</p>'],
    ['>Последний вход</p>', '>{t("admin.users.colLastLogin")}</p>'],
    ['>Отмена<', '>{t("common.cancel")}<'],
    ['? "Сохранение..." : "Сохранить"', '? t("admin.users.saving") : t("admin.users.save")'],
    ['value="">— Не выбрана —</option>', 'value="">{t("admin.users.groupNotSelected")}</option>'],
  ],
};

for (const [file, pairs] of Object.entries(files)) {
  const p = path.join(root, file);
  let s = fs.readFileSync(p, "utf8");
  let n = 0;
  for (const [from, to] of pairs) {
    if (s.includes(from)) {
      s = s.split(from).join(to);
      n++;
    }
  }
  fs.writeFileSync(p, s, "utf8");
  console.log(file, n);
}
