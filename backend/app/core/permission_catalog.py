"""Single source of truth for role permission definitions and default templates."""

from __future__ import annotations

from app.models.user import UserRole

PERMISSION_DEFINITIONS: dict[str, dict[str, str]] = {
    "repo_view": {
        "name": "Просмотр репозиториев",
        "description": "Видеть список и содержимое репозиториев",
        "category": "repositories",
        "level": "read",
    },
    "repo_view_students": {
        "name": "Просмотр репозиториев студентов",
        "description": "Доступ к репозиториям студентов по поручению преподавателя",
        "category": "repositories",
        "level": "read",
    },
    "repo_create": {
        "name": "Создание репозиториев",
        "description": "Создавать новые репозитории",
        "category": "repositories",
        "level": "write",
    },
    "repo_edit": {
        "name": "Редактирование репозиториев",
        "description": "Блокировать и разблокировать репозитории",
        "category": "repositories",
        "level": "write",
    },
    "repo_delete": {
        "name": "Удаление репозиториев",
        "description": "Удалять репозитории",
        "category": "repositories",
        "level": "delete",
    },
    "repo_comment": {
        "name": "Добавление комментариев к коду",
        "description": "Просматривать pull requests и комментарии",
        "category": "repositories",
        "level": "write",
    },
    "user_view": {
        "name": "Просмотр пользователей",
        "description": "Видеть профили других пользователей",
        "category": "users",
        "level": "read",
    },
    "user_edit": {
        "name": "Редактирование пользователей",
        "description": "Изменять данные пользователей",
        "category": "users",
        "level": "write",
    },
    "user_delete": {
        "name": "Удаление пользователей",
        "description": "Удалять учётные записи",
        "category": "users",
        "level": "delete",
    },
    "group_manage": {
        "name": "Управление группами",
        "description": "Создавать и редактировать группы",
        "category": "users",
        "level": "write",
    },
    "assignment_view": {
        "name": "Просмотр заданий",
        "description": "Видеть курсы, задания и материалы",
        "category": "assignments",
        "level": "read",
    },
    "assignment_create": {
        "name": "Создание заданий",
        "description": "Создавать курсы и новые задания",
        "category": "assignments",
        "level": "write",
    },
    "assignment_delete": {
        "name": "Удаление заданий",
        "description": "Удалять курсы и задания",
        "category": "assignments",
        "level": "delete",
    },
    "grade_edit": {
        "name": "Выставление оценок",
        "description": "Изменять оценки студентов",
        "category": "assignments",
        "level": "write",
    },
    "lab_accept": {
        "name": "Прием лабораторных работ",
        "description": "Просматривать сдачи и менять статус проверки",
        "category": "assignments",
        "level": "write",
    },
    "grade_view_groups": {
        "name": "Просмотр оценок в своих группах",
        "description": "Видеть оценки студентов по поручению преподавателя",
        "category": "assignments",
        "level": "read",
    },
    "settings_view": {
        "name": "Просмотр настроек",
        "description": "Видеть системные настройки и статистику",
        "category": "system",
        "level": "read",
    },
    "settings_edit": {
        "name": "Изменение настроек",
        "description": "Модифицировать системные параметры",
        "category": "system",
        "level": "delete",
    },
    "logs_view": {
        "name": "Просмотр логов",
        "description": "Доступ к системным логам",
        "category": "system",
        "level": "read",
    },
    "admin": {
        "name": "Перезапуск системы",
        "description": "Выполнять административные операции перезапуска",
        "category": "system",
        "level": "delete",
    },
}

CATEGORY_NAMES = {
    "repositories": "РЕПОЗИТОРИИ",
    "users": "ПОЛЬЗОВАТЕЛИ И ГРУППЫ",
    "assignments": "ОЦЕНКИ И ЗАДАНИЯ",
    "system": "СИСТЕМА",
}

PERMISSION_TEMPLATES: dict[str, dict[str, bool]] = {
    "admin": {
        "repo_view": True,
        "repo_view_students": True,
        "repo_create": True,
        "repo_edit": True,
        "repo_delete": True,
        "repo_comment": True,
        "user_view": True,
        "user_edit": True,
        "user_delete": True,
        "group_manage": True,
        "assignment_view": True,
        "assignment_create": True,
        "assignment_delete": True,
        "grade_edit": True,
        "lab_accept": True,
        "grade_view_groups": True,
        "settings_view": True,
        "settings_edit": True,
        "logs_view": True,
        "admin": True,
    },
    "teacher": {
        "repo_view": True,
        "repo_view_students": True,
        "repo_create": True,
        "repo_comment": True,
        "user_view": True,
        "user_edit": True,
        "group_manage": True,
        "assignment_view": True,
        "assignment_create": True,
        "assignment_delete": True,
        "grade_edit": True,
        "lab_accept": True,
        "grade_view_groups": True,
        "settings_view": True,
        "logs_view": True,
    },
    "laborant": {
        "repo_view": True,
        "repo_view_students": True,
        "repo_comment": True,
        "user_view": True,
        "assignment_view": True,
        "lab_accept": True,
        "grade_view_groups": True,
        "settings_view": True,
        "logs_view": True,
    },
    "student": {
        "repo_view": True,
        "repo_create": True,
        "repo_delete": True,
        "repo_comment": True,
        "user_view": True,
        "assignment_view": True,
        "settings_view": True,
    },
}


def permission_ids_from_template(role: str) -> set[str]:
    template = PERMISSION_TEMPLATES.get(role, {})
    return {perm_id for perm_id, enabled in template.items() if enabled}


def build_default_permissions() -> dict[UserRole, set[str]]:
    return {
        UserRole.admin: permission_ids_from_template("admin"),
        UserRole.teacher: permission_ids_from_template("teacher"),
        UserRole.laborant: permission_ids_from_template("laborant"),
        UserRole.student: permission_ids_from_template("student"),
    }
