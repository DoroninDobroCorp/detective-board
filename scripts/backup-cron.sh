#!/bin/bash
# Cron job wrapper for backup script
# Runs daily at 3 AM

cd /srv/detective-board
/usr/bin/npx tsx scripts/auto-backup-to-git.ts >> /var/log/detective-board-backup.log 2>&1
