#!/usr/bin/env node
/**
 * Автоматический бекап через migration API
 * Запускается через cron каждый день
 */

import { writeFileSync } from 'fs';
import { execSync } from 'child_process';

const BACKUP_PATH = '/srv/detective-board/data-backups';

async function backupToGit() {
  console.log('🚀 Starting automatic backup to git...');
  
  try {
    // Check if migration endpoint has data
    console.log('📥 Checking migration endpoint...');
    const response = await fetch('http://localhost:5173/api/migration/import');
    
    let data;
    if (response.ok) {
      data = await response.json();
      console.log('✅ Found data in migration endpoint');
    } else {
      console.log('⚠️ No data in migration endpoint, using empty backup');
      data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        nodes: [],
        links: [],
        users: [],
        books: [],
        movies: [],
        games: [],
        purchases: [],
        diary: [],
      };
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.json`;
    const filepath = `${BACKUP_PATH}/${filename}`;

    // Save to file
    console.log(`💾 Saving to ${filepath}...`);
    execSync(`mkdir -p ${BACKUP_PATH}`);
    writeFileSync(filepath, JSON.stringify(data, null, 2));

    // Git commit
    console.log('📤 Committing to git...');
    execSync(`cd /srv/detective-board && git add data-backups/${filename}`);
    
    const stats = {
      nodes: data.nodes?.length || 0,
      diary: data.diary?.length || 0,
      level: (data.gamification as any)?.level || 1,
      xp: (data.gamification as any)?.xp || 0,
      achievements: (data.gamification as any)?.achievements?.length || 0,
    };
    
    const commitMsg = `Auto backup: ${stats.nodes} nodes, Level ${stats.level}, XP ${stats.xp}, ${stats.achievements} achievements`;
    
    try {
      execSync(`cd /srv/detective-board && git commit -m "${commitMsg}"`, { encoding: 'utf8' });
      console.log('✅ Committed to git!');
    } catch (e) {
      // No changes to commit
      console.log('ℹ️ No changes since last backup');
    }

    console.log('\n📊 Backup stats:');
    console.log(`   • Nodes: ${stats.nodes}`);
    console.log(`   • Diary: ${stats.diary}`);
    console.log(`   • Level: ${stats.level}`);
    console.log(`   • XP: ${stats.xp}`);
    console.log(`   • Achievements: ${stats.achievements}`);
    console.log('\n✅ Backup completed successfully!');

  } catch (error) {
    console.error('❌ Backup failed:', error);
    throw error;
  }
}

backupToGit().catch((e) => {
  console.error(e);
  process.exit(1);
});
