import { FolderPlus, GitFork, ClipboardList, TrendingUp } from "lucide-react";
import FeaturePlaceholder from "../components/FeaturePlaceholder";

interface StubProps {
  isDarkTheme?: boolean;
}

export function StudentCreateRepoPage({ isDarkTheme }: StubProps) {
  return (
    <FeaturePlaceholder
      isDarkTheme={isDarkTheme}
      title="Создать репозиторий"
      description="Мастер создания личного или учебного репозитория с выбором шаблона, видимости и привязкой к заданию появится здесь."
      hint="Пока создайте репозиторий из раздела «Все репозитории» или через задание курса."
      icon={<FolderPlus className="h-8 w-8" />}
    />
  );
}

export function StudentForksPage({ isDarkTheme }: StubProps) {
  return (
    <FeaturePlaceholder
      isDarkTheme={isDarkTheme}
      title="Форки"
      description="Список форков ваших репозиториев и клонов заданий с синхронизацией с Gitea будет доступен в этом разделе."
      icon={<GitFork className="h-8 w-8" />}
    />
  );
}

export function StudentAssignmentsPage({ isDarkTheme }: StubProps) {
  return (
    <FeaturePlaceholder
      isDarkTheme={isDarkTheme}
      title="Задания"
      description="Единый список всех лабораторных и домашних работ по курсам с фильтрами и статусом сдачи."
      hint="Часть заданий уже доступна внутри карточек курсов."
      icon={<ClipboardList className="h-8 w-8" />}
    />
  );
}

export function StudentGradesPage({ isDarkTheme }: StubProps) {
  return (
    <FeaturePlaceholder
      isDarkTheme={isDarkTheme}
      title="Оценки"
      description="Сводная ведомость оценок по курсам, средний балл и история проверок появятся здесь."
      icon={<TrendingUp className="h-8 w-8" />}
    />
  );
}
