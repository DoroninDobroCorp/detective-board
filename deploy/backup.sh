#!/bin/bash

# Daily backup script for Detective Board
# Backs up the database and important files to a backup directory

set -e

BACKUP_DIR="/srv/detective-board/backups"
APP_DIR="/srv/detective-board"
DB_DIR="$APP_DIR"
RETENTION_DAYS=30
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/detective-board_backup_$TIMESTAMP.tar.gz"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting Detective Board backup..."

# Backup database files and important data
cd "$APP_DIR"

# Include what needs to be backed up (DB files, memory-bank, public)
# Exclude node_modules, dist, large files
tar -czf "$BACKUP_FILE" \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  --exclude='test-results' \
  --exclude='tests' \
  --exclude='.env.local' \
  --exclude='*.log' \
  --exclude='backups' \
  -C "$APP_DIR" . 2>/dev/null || true

if [ -f "$BACKUP_FILE" ]; then
  FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "[$(date)] Backup created successfully: $BACKUP_FILE ($FILE_SIZE)"
  
  # Clean up old backups (keep only last 30 days)
  find "$BACKUP_DIR" -name "detective-board_backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete
  echo "[$(date)] Cleaned up backups older than $RETENTION_DAYS days"
else
  echo "[$(date)] ERROR: Backup file was not created" >&2
  exit 1
fi

echo "[$(date)] Backup completed successfully"
exit 0
