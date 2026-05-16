import fs from "fs";
import path from "path";

const p = path.resolve("src/pages/LogsPage.tsx");
let s = fs.readFileSync(p, "utf8");

const pairs = [
  ['alert("Не удалось экспортировать логи")', 'alert(t("admin.logs.exportFailed"))'],
  ['alert(`Удалено ${result.deleted_count} записей`)', 'alert(tp("admin.logs.deletedCount", { n: result.deleted_count }))'],
  ['alert("Не удалось удалить старые логи")', 'alert(t("admin.logs.deleteFailed"))'],
  [">Логи</h1>", ">{t(\"admin.logs.title\")}</h1>"],
  ["Системные события, ошибки и аудит действий", '{t("admin.logs.subtitle")}'],
  ['{isExporting ? "Экспорт..." : "Экспорт"}', '{isExporting ? t("admin.logs.exporting") : t("admin.logs.export")}'],
  ["              Очистить старые", '              {t("admin.logs.deleteOld")}'],
  ["            <motion.div style={{ fontSize: \"11px\", color: textMuted, marginBottom: \"4px\" }}>Всего записей</motion.div>", ""],
  ['marginBottom: "4px" }}>Всего записей</div>', 'marginBottom: "4px" }}>{t("admin.logs.statTotal")}</div>'],
  ['marginBottom: "4px" }}>Ошибок сегодня</motion.div>', 'marginBottom: "4px" }}>{t("admin.logs.statErrorsToday")}</div>'],
  ['marginBottom: "4px" }}>Ошибок сегодня</div>', 'marginBottom: "4px" }}>{t("admin.logs.statErrorsToday")}</div>'],
  ['marginBottom: "4px" }}>Предупреждений</div>', 'marginBottom: "4px" }}>{t("admin.logs.statWarnings")}</div>'],
  ['marginBottom: "4px" }}>Успешных запросов</div>', 'marginBottom: "4px" }}>{t("admin.logs.statSuccess")}</motion.div>'],
  ['marginBottom: "4px" }}>Успешных запросов</motion.div>', 'marginBottom: "4px" }}>{t("admin.logs.statSuccess")}</div>'],
  ['marginTop: "3px" }}>За всё время</div>', 'marginTop: "3px" }}>{t("admin.logs.periodAllTime")}</div>'],
  ['marginTop: "3px" }}>За сегодня</div>', 'marginTop: "3px" }}>{t("admin.logs.periodToday")}</div>'],
  ['placeholder="Поиск по сообщению, пользователю, IP..."', 'placeholder={t("admin.logs.searchPlaceholder")}'],
  ['<option value="">Все уровни</option>', '<option value="">{t("admin.logs.allLevels")}</option>'],
  ['<option value="">Все источники</option>', '<option value="">{t("admin.logs.allSources")}</option>'],
  ['<option value="today">Сегодня</option>', '<option value="today">{t("admin.logs.periodToday")}</option>'],
  ['<option value="hour">За час</option>', '<option value="hour">{t("admin.logs.periodHour")}</option>'],
  ['<option value="week">За неделю</option>', '<option value="week">{t("admin.logs.periodWeek")}</option>'],
  ['<option value="month">За месяц</option>', '<option value="month">{t("admin.logs.periodMonth")}</option>'],
  ['<option value="desc">Новые сначала</option>', '<option value="desc">{t("admin.logs.sortNewFirst")}</option>'],
  ['<option value="asc">Старые сначала</option>', '<option value="asc">{t("admin.logs.sortOldFirst")}</option>'],
  [">Загрузка...</span>", ">{t(\"common.loading\")}</span>"],
  [">Логов не найдено</span>", ">{t(\"admin.logs.empty\")}</span>"],
  [">Время</th>", ">{t(\"admin.logs.colTime\")}</th>"],
  [">Уровень</th>", ">{t(\"admin.logs.colLevel\")}</th>"],
  [">Источник</th>", ">{t(\"admin.logs.colModule\")}</th>"],
  [">Пользователь</th>", ">{t(\"admin.logs.colUser\")}</th>"],
  [">Сообщение</th>", ">{t(\"admin.logs.colMessage\")}</th>"],
  [">Статус</th>", ">{t(\"admin.logs.colStatus\")}</th>"],
  ["<span>Показано {logs.length} из {total}</span>", "<span>{tp(\"admin.logs.shownOf\", { shown: logs.length, total })}</span>"],
  ["<span>По</span>", "<span>{t(\"admin.logs.perPage\")}</span>"],
  ["<span>на странице</span>", "<span>{t(\"admin.logs.onPage\")}</span>"],
  ['title="Удалить старые логи"', 'title={t("admin.logs.deleteTitle")}'],
  ['message="Удалить записи старше 1 дня? Это действие необратимо."', 'message={t("admin.logs.deleteMessage")}'],
  ['confirmText="Удалить"', 'confirmText={t("admin.logs.deleteConfirmBtn")}'],
  ['cancelText="Отмена"', 'cancelText={t("common.cancel")}'],
];

let n = 0;
for (const [from, to] of pairs) {
  if (!to && from) continue;
  if (s.includes(from)) {
    s = s.split(from).join(to);
    n++;
  }
}
// stats labels - direct
s = s.replace('marginBottom: "4px" }}>Всего записей</motion.div>', 'marginBottom: "4px" }}>{t("admin.logs.statTotal")}</div>');
s = s.replace('marginBottom: "4px" }}>Всего записей</div>', 'marginBottom: "4px" }}>{t("admin.logs.statTotal")}</div>');
s = s.replace('marginBottom: "4px" }}>Ошибок сегодня</motion.div>', 'marginBottom: "4px" }}>{t("admin.logs.statErrorsToday")}</motion.div>');
s = s.replace('marginBottom: "4px" }}>Ошибок сегодня</motion.div>', 'marginBottom: "4px" }}>{t("admin.logs.statErrorsToday")}</div>');
s = s.replace('marginBottom: "4px" }}>Предупреждений</motion.div>', 'marginBottom: "4px" }}>{t("admin.logs.statWarnings")}</motion.div>');
s = s.replace('marginBottom: "4px" }}>Предупреждений</div>', 'marginBottom: "4px" }}>{t("admin.logs.statWarnings")}</motion.div>');
s = s.replace('marginBottom: "4px" }}>Успешных запросов</motion.div>', 'marginBottom: "4px" }}>{t("admin.logs.statSuccess")}</motion.div>');

fs.writeFileSync(p, s, "utf8");
console.log("logs", n);
