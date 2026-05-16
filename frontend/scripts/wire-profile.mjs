import fs from "fs";
import path from "path";

const p = path.resolve("src/pages/ProfilePage.tsx");
let s = fs.readFileSync(p, "utf8");

const pairs = [
  [">Профиль</h1>", ">{t(\"admin.profile.title\")}</h1>"],
  ["Управление аккаунтом и настройки безопасности", '{t("admin.profile.subtitle")}'],
  [">Загрузка...</div>", ">{t(\"common.loading\")}</div>"],
  [">Изменить</span>", ">{t(\"admin.profile.editAvatar\")}</span>"],
  ["                ИНФОРМАЦИЯ", '                {t("admin.profile.infoSection")}'],
  ["                Только чтение", '                {t("admin.profile.readOnly")}'],
  [">Имя</span>", ">{t(\"admin.profile.fieldName\")}</span>"],
  [">Роль</span>", ">{t(\"admin.profile.fieldRole\")}</span>"],
  [">Кафедра</span>", ">{t(\"admin.profile.fieldDepartment\")}</span>"],
  [">Средний балл</span>", ">{t(\"admin.profile.fieldAvgGrade\")}</span>"],
  [">Дата регистрации</span>", ">{t(\"admin.profile.registeredAt\")}</span>"],
  [">Последний вход</span>", ">{t(\"admin.profile.lastLogin\")}</span>"],
  [">Статус</span>", ">{t(\"admin.profile.fieldStatus\")}</span>"],
  ['me?.is_blocked ? "Заблокирован" : "Активен"', 'me?.is_blocked ? t("admin.profile.statusBlocked") : t("admin.profile.statusActive")'],
  ["                Смена пароля", '                {t("admin.profile.changePasswordTitle")}'],
  ["                  Старый пароль", '                  {t("admin.profile.oldPasswordLabel")}'],
  ["                  Новый пароль", '                  {t("admin.profile.newPasswordLabel")}'],
  ["                  Повторите новый пароль", '                  {t("admin.profile.repeatPassword")}'],
  ['placeholder="Введите текущий пароль"', 'placeholder={t("admin.profile.currentPassword")}'],
  ['placeholder="Минимум 8 символов"', 'placeholder={t("admin.profile.newPasswordMin")}'],
  ['placeholder="Повторите новый пароль"', 'placeholder={t("admin.profile.repeatPassword")}'],
  ['{saving ? "Смена..." : "Сменить пароль"}', '{saving ? t("admin.profile.changingPassword") : t("admin.profile.changePassword")}'],
  [">Отмена</button>", ">{t(\"common.cancel\")}</button>"],
  ['{isStudent ? "АКТИВНОСТЬ" : "ПОСЛЕДНИЕ ДЕЙСТВИЯ"}', '{isStudent ? t("admin.profile.activitySection") : t("admin.profile.actionsSection")}'],
  ['{isStudent ? "Лента событий" : "Последние 24 часа"}', '{isStudent ? t("admin.profile.activityFeed") : t("admin.profile.last24h")}'],
  ["                    Пока нет событий", '                    {t("admin.profile.noEvents")}'],
  ["                  Нет действий за последние 24 часа", '                  {t("admin.profile.noActions24h")}'],
  ["                РЕЙТИНГ ГРУППЫ", '                {t("admin.profile.groupRankingTitle")}'],
  ["                  Рейтинг недоступен", '                  {t("admin.profile.rankingUnavailable")}'],
  ['formatLastLogin(me?.last_login || null)', 'formatLastLogin(me?.last_login || null, tp, dateLocale)'],
  ['getActionDescription(action)', 'getActionDescription(action, t)'],
  ['formatActionTime(action.created_at)', 'formatActionTime(action.created_at, t, tp)'],
  ['toLocaleDateString("ru-RU")', 'toLocaleDateString(dateLocale)'],
  ['? "Курсов"', '? t("admin.profile.coursesMany")'],
  ['? "Сдано работ"', '? t("admin.profile.worksSubmitted")'],
  ['? "Студентов"', '? t("admin.profile.studentsMany")'],
  ['? "На проверке"', '? t("admin.profile.pendingReview")'],
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
