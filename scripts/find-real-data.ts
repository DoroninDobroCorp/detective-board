import { chromium } from '@playwright/test';

async function findRealData() {
  console.log('🔍 Searching for real user data in all possible locations...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const locations = [
    'http://145.239.82.124:5173/',
    'http://145.239.82.124:5173/detective-board',
    'http://localhost:5173/',
    'http://localhost:5173/detective-board',
    'https://ibet.team/detective-board/',
  ];

  let bestData = null;
  let bestLocation = null;
  let bestScore = 0;

  try {
    for (const url of locations) {
      console.log(`\n📦 Checking: ${url}`);
      const page = await context.newPage();
      
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(3000);

        const data = await page.evaluate(async () => {
          try {
            const { getBackupData } = await import('./src/exportImport');
            const backup = await getBackupData();
            
            const level = (backup.gamification as any)?.level || 1;
            const xp = (backup.gamification as any)?.xp || 0;
            const achievements = (backup.gamification as any)?.achievements?.length || 0;
            const diary = backup.diary?.length || 0;
            const nodes = backup.nodes?.length || 0;

            return {
              nodes,
              diary,
              level,
              xp,
              achievements,
              levelTitles: (backup.gamification as any)?.levelTitles || {},
              fullBackup: backup,
            };
          } catch (e) {
            return { error: String(e), nodes: 0, diary: 0, level: 1, xp: 0, achievements: 0 };
          }
        });

        console.log(`   Nodes: ${data.nodes}, Diary: ${data.diary}, Level: ${data.level}, XP: ${data.xp}, Achievements: ${data.achievements}`);

        // Calculate score (higher = more real data)
        const score = 
          (data.level - 1) * 100 + 
          data.xp + 
          data.achievements * 50 + 
          data.diary * 10 + 
          Math.max(0, data.nodes - 6) * 5; // -6 because demo has 3-6 nodes

        if (score > bestScore) {
          bestScore = score;
          bestData = data;
          bestLocation = url;
        }

        console.log(`   Score: ${score} ${score > 0 ? '✅' : ''}`);

      } catch (e) {
        console.log(`   ⚠️ Failed to load: ${e.message}`);
      } finally {
        await page.close();
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESULTS:');
    console.log('='.repeat(60));

    if (bestScore === 0) {
      console.log('\n❌ NO REAL DATA FOUND in any location!');
      console.log('\nPossible reasons:');
      console.log('1. Data is in a different browser (not Chromium/Playwright)');
      console.log('2. Data was cleared/lost during configuration changes');
      console.log('3. Data is in browser profile that Playwright cannot access');
      console.log('\n💡 Solution: User needs to open check-my-data.html in THEIR browser');
    } else {
      console.log(`\n✅ FOUND REAL DATA at: ${bestLocation}`);
      console.log(`\nData summary:`);
      console.log(`   • Level: ${bestData.level}`);
      console.log(`   • XP: ${bestData.xp}`);
      console.log(`   • Achievements: ${bestData.achievements}`);
      console.log(`   • Diary entries: ${bestData.diary}`);
      console.log(`   • Total nodes: ${bestData.nodes}`);
      console.log(`   • Score: ${bestScore}`);
      
      if (bestData.levelTitles) {
        const titles = Object.entries(bestData.levelTitles).map(([k, v]: [string, any]) => `${k}: ${v.title}`).join(', ');
        console.log(`   • Level titles: ${titles}`);
      }

      // Save export
      const fs = await import('fs');
      const exportPath = '/srv/detective-board/found-data.json';
      fs.writeFileSync(exportPath, JSON.stringify(bestData.fullBackup, null, 2));
      console.log(`\n💾 Data exported to: ${exportPath}`);
      console.log('\n🚀 Next: Import this data to new path!');
    }

  } catch (error) {
    console.error('\n❌ Search failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

findRealData().catch(console.error);
