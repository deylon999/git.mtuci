# MTUCI Git Management System

Система управления лабораторными работами и репозиториями студентов для МТУСИ.

**Стек:** FastAPI · PostgreSQL · Alembic · React · Vite · Gitea · Docker

---

## Требования

- Docker
- Docker Compose

## Запуск

```bash
docker compose up --build
```

Первый запуск занимает 2–3 минуты. После этого доступны:

| Сервис | URL |
|--------|-----|
| Frontend | http://localhost:3001 |
| API Docs | http://localhost:8000/docs |
| Gitea | http://localhost:3000 |

---

## Учётные данные по умолчанию

> ⚠️ Смените пароли перед деплоем в продакшен.

**API (супер-админ)**
```
admin@mtuci.local / admin123
```

**Gitea**
```
gitea_admin / admin12345
```

---

## Конфигурация

Все настройки задаются через переменные окружения в `docker-compose.yml`. Отдельный `.env` файл для запуска не нужен.

```yaml
api:
  environment:
    - JWT_SECRET_KEY=dev-secret-key-...   # сменить в продакшене
    - ADMIN_EMAIL=admin@mtuci.local
    - ADMIN_PASSWORD=admin123

postgres:
  environment:
    - POSTGRES_USER=mtuci
    - POSTGRES_PASSWORD=mtuci
    - POSTGRES_DB=mtuci_app

gitea:
  environment:
    - GITEA__admin__DEFAULT_ADMIN_USERNAME=gitea_admin
    - GITEA__admin__DEFAULT_ADMIN_PASSWORD=admin12345
```

### Gitea Token

Gitea API использует basic auth с admin credentials (gitea_admin / admin12345) для создания репозиториев, настройки webhooks и получения информации о коммитах.

Если вы хотите использовать токен вместо basic auth:
1. Зайдите на http://localhost:3000
2. Settings → Applications → Generate New Token
3. Добавьте в `docker-compose.yml`: `GITEA_TOKEN=<токен>`

### SMTP (опционально)

Нужен только для функции сброса пароля:

```yaml
- SMTP_HOST=smtp.gmail.com
- SMTP_PORT=587
- SMTP_USER=your@gmail.com
- SMTP_PASS=your-app-password
```

---

## Команды

```bash
# Логи
docker compose logs -f
docker compose logs -f api

# Перезапуск / остановка
docker compose restart
docker compose down

# Удалить всё включая данные
docker compose down -v

# Миграции
docker compose exec api alembic upgrade heads
docker compose exec api alembic revision --autogenerate -m "description"
```

---

## Структура проекта

```
.
├── backend/
│   ├── app/              # Основной код приложения
│   ├── alembic/          # Миграции
│   └── Dockerfile
├── frontend/
│   ├── src/
│   └── Dockerfile
└── docker-compose.yml
```

---

## Troubleshooting

**Порт занят** — поменяйте левый порт в `docker-compose.yml`:
```yaml
ports:
  - "3002:3001"
```

**Ошибка базы данных** — пересоздайте volumes:
```bash
docker compose down -v && docker compose up --build
```

**Frontend не достучится до API:**
```bash
curl http://localhost:8000/docs
docker compose ps
```
