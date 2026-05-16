import fs from "fs";
import path from "path";

const root = path.resolve("src");

function apply(fileRel, pairs) {
  const file = path.join(root, fileRel);
  let s = fs.readFileSync(file, "utf8");
  let n = 0;
  for (const [from, to] of pairs) {
    if (s.includes(from)) {
      s = s.split(from).join(to);
      n++;
    }
  }
  fs.writeFileSync(file, s);
  console.log(fileRel, n, "replacements");
}

apply("pages/AssignmentPage.tsx", [
  ["История коммитов", '{t("repo.assignment.commitsHistory")}'],
  ["Коммитов пока нет.", '{t("repo.assignment.noCommits")}'],
  ["Файлы (дерево)", '{t("repo.assignment.filesTree")}'],
  ["Файлов не найдено.", '{t("repo.assignment.noFiles")}'],
  ["AI антиплагиат", '{t("repo.assignment.plagiarismTitle")}'],
  ['<option value="">Студент 1</option>', '<option value="">{t("repo.assignment.student1")}</option>'],
  ['<option value="">Студент 2</option>', '<option value="">{t("repo.assignment.student2")}</option>'],
  ['plagiarismLoading ? "Сравнение..." : "Сравнить"', 'plagiarismLoading ? t("repo.assignment.comparing") : t("repo.assignment.compare")'],
  ["Схожесть", '{t("repo.assignment.similarity")}'],
  ['Вердикт:{" "}', '{t("repo.assignment.verdict")}{" "}'],
  ['?? "Студент 1"', '?? t("repo.assignment.student1")'],
  ['?? "Студент 2"', '?? t("repo.assignment.student2")'],
  ["Совпадающие AST элементы", '{t("repo.assignment.matchingAst")}'],
  ["Совпадающих AST элементов не найдено.", '{t("repo.assignment.noMatchingAst")}'],
  ["Оценивание студентов", '{t("repo.assignment.gradeStudents")}'],
  ["Загрузка сдач…", '{t("repo.assignment.loadingSubmissions")}'],
  ['? "Сдано" : "Не сдано"', '? t("repo.assignment.submitted") : t("repo.assignment.notSubmitted")'],
  ["Последний коммит:", '{t("repo.assignment.lastCommit")}'],
  ['placeholder="Комментарий"', 'placeholder={t("repo.assignment.commentPlaceholder")}'],
  ['? "Сохранение..." : "Сохранить"', '? t("repo.assignment.saving") : t("repo.assignment.save")'],
  ["В этом курсе пока нет студентов.", '{t("repo.assignment.noStudentsInCourse")}'],
  ["Моя оценка", '{t("repo.assignment.myGrade")}'],
  ["Закрыть", '{t("repo.assignment.close")}'],
  ["Загрузка файла…", '{t("repo.assignment.loadingFile")}'],
  ['course?.title || "Курс"', 'course?.title || t("repo.assignment.courseFallback")'],
]);

apply("pages/HomePage.tsx", [
  ['name: "Базы данных"', 'name: "Databases"'],
  ['name: "Web разработка"', 'name: "Web Development"'],
  ['name: "Python продвин."', 'name: "Advanced Python"'],
  ['title: "Лаб. №3"', 'title: "Lab #3"'],
  ['title: "Тест по БД"', 'title: "DB Test"'],
  ['title: "Курсовая"', 'title: "Term paper"'],
  ['name: "Петров И."', 'name: "Petrov I."'],
  ['name: "Иванов А."', 'name: "Ivanov A."'],
  ['name: "Сидоров К."', 'name: "Sidorov K."'],
]);

apply("pages/RegisterPage.tsx", [
  ['placeholder="ваш_логин"', 'placeholder={t("auth.register.mtuciLoginPlaceholder")}'],
]);

console.log("done");
