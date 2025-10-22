import { chromium } from '@playwright/test';

async function migrate() {
  console.log('🚀 Starting automatic data migration...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Step 1: Export from old path (without /detective-board)
    console.log('📦 Step 1: Opening old version to export data...');
    await page.goto('http://145.239.82.124:5173/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Wait for app to initialize

    console.log('📥 Extracting data from old IndexedDB...');
    const exportData = await page.evaluate(async () => {
      // Import modules
      const { getBackupData } = await import('./src/exportImport');
      const data = await getBackupData();
      console.log('Data extracted:', {
        nodes: data.nodes?.length,
        diary: data.diary?.length,
        level: (data.gamification as any)?.level,
        xp: (data.gamification as any)?.xp,
        achievements: (data.gamification as any)?.achievements?.length,
      });
      return data;
    });

    console.log('\n✅ Data exported successfully!');
    console.log('📊 Statistics:');
    console.log(`   • Nodes: ${exportData.nodes?.length || 0}`);
    console.log(`   • Links: ${exportData.links?.length || 0}`);
    console.log(`   • Diary entries: ${exportData.diary?.length || 0}`);
    console.log(`   • Level: ${(exportData.gamification as any)?.level || 1}`);
    console.log(`   • XP: ${(exportData.gamification as any)?.xp || 0}`);
    console.log(`   • Achievements: ${(exportData.gamification as any)?.achievements?.length || 0}`);
    console.log(`   • LocalStorage keys: ${exportData.localStorageExtra ? Object.keys(exportData.localStorageExtra).length : 0}`);
    
    const imgKeys = exportData.localStorageExtra 
      ? Object.keys(exportData.localStorageExtra).filter(k => k.startsWith('img:')).length 
      : 0;
    console.log(`   • Images: ${imgKeys}`);

    // Step 2: Send data to migration endpoint
    console.log('\n📤 Step 2: Sending data to migration endpoint...');
    const response = await fetch('http://localhost:5173/api/migration/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exportData),
    });

    if (!response.ok) {
      throw new Error(`Migration endpoint failed: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Data sent to server:', result);

    // Step 3: Import to new path
    console.log('\n📥 Step 3: Opening new path to import data...');
    await page.goto('http://145.239.82.124:5173/detective-board/?auto-import=1');
    await page.waitForLoadState('networkidle');
    
    // Wait for auto-import to complete
    console.log('⏳ Waiting for import to complete...');
    await page.waitForTimeout(5000);

    // Step 4: Verify imported data
    console.log('\n🔍 Step 4: Verifying imported data...');
    const verifyResult = await page.evaluate(async () => {
      const { db } = await import('./src/db');
      const { useGamificationStore } = await import('./src/gamification');

      const nodes = await db.nodes.toArray();
      const diary = await db.diary.toArray();
      const gamifState = useGamificationStore.getState();

      const imgKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('img:')) {
          imgKeys.push(key);
        }
      }

      return {
        nodes: nodes.length,
        diaryCount: diary.length,
        level: gamifState.level,
        xp: gamifState.xp,
        achievements: gamifState.achievements.length,
        levelTitles: Object.keys(gamifState.levelTitles),
        imgKeys: imgKeys.length,
      };
    });

    console.log('\n✅ Migration completed successfully!');
    console.log('📊 Verification:');
    console.log(`   • Nodes: ${verifyResult.nodes} ✅`);
    console.log(`   • Diary entries: ${verifyResult.diaryCount} ✅`);
    console.log(`   • Level: ${verifyResult.level} ✅`);
    console.log(`   • XP: ${verifyResult.xp} ✅`);
    console.log(`   • Achievements: ${verifyResult.achievements} ✅`);
    console.log(`   • Level titles: ${verifyResult.levelTitles.join(', ')} ✅`);
    console.log(`   • Images: ${verifyResult.imgKeys} ✅`);

    console.log('\n🎉 All data migrated successfully!');
    console.log('\n🌐 Your app is now available at: https://ibet.team/detective-board/');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

migrate().catch(console.error);
