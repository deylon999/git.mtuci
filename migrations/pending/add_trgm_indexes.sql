-- IMPORTANT:
-- Do NOT run this file via Alembic.
-- Run manually via psql, outside an explicit transaction block,
-- because CREATE INDEX CONCURRENTLY is not allowed inside transactions.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Users
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_mtuci_login_trgm
  ON users USING gin (mtuci_login gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_full_name_trgm
  ON users USING gin (full_name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_trgm
  ON users USING gin (email gin_trgm_ops);

-- Repositories
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_name_trgm
  ON repositories USING gin (name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_gitea_repo_name_trgm
  ON repositories USING gin (gitea_repo_name gin_trgm_ops);
