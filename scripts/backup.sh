#!/bin/bash
set -e

# Backup script for PostgreSQL database
# Runs automatically via cron

BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.sql"

echo "Starting backup at $(date)"

# Create backup using pg_dump
PGPASSWORD=$POSTGRES_PASSWORD pg_dump \
  -h $POSTGRES_HOST \
  -U $POSTGRES_USER \
  -d $POSTGRES_DB \
  > $BACKUP_FILE

# Compress the backup
gzip $BACKUP_FILE
BACKUP_FILE="${BACKUP_FILE}.gz"

# Remove backups older than 30 days
find $BACKUP_DIR -name "backup_*.sql.gz" -type f -mtime +30 -delete

echo "Backup completed: ${BACKUP_FILE}"
echo "Old backups (>30 days) removed"
