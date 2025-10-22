import { chromium } from '@playwright/test';

async function checkData() {
  console.log('🔍 Checking IndexedDB data in both locations...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  try {
    // Check domain paths
    console.log('📦 Checking: https://ibet.team/detective-board/ (HTTPS)');
    const page1 = await context.newPage();
    await page1.goto('https://ibet.team/detective-board/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {
      console.log('Failed to load HTTPS domain');
    });
    await page1.waitForLoadState('networkidle');
    await page1.waitForTimeout(3000);

    const data1 = await page1.evaluate(async () => {
      try {
        const { getBackupData } = await import('./src/exportImport');
        const data = await getBackupData();
        return {
          nodes: data.nodes?.length || 0,
          diary: data.diary?.length || 0,
          level: (data.gamification as any)?.level || 1,
          xp: (data.gamification as any)?.xp || 0,
          achievements: (data.gamification as any)?.achievements?.length || 0,
          levelTitles: (data.gamification as any)?.levelTitles || {},
        };
      } catch (e) {
        return { error: String(e) };
      }
    });

    console.log('Results:');
    console.log(JSON.stringify(data1, null, 2));
    
    await page1.close();

    // Check new path (with /detective-board)
    console.log('\n📦 Checking: http://145.239.82.124:5173/detective-board/');
    const page2 = await context.newPage();
    await page2.goto('http://145.239.82.124:5173/detective-board/');
    await page2.waitForLoadState('networkidle');
    await page2.waitForTimeout(3000);

    const data2 = await page2.evaluate(async () => {
      try {
        const { getBackupData } = await import('./src/exportImport');
        const data = await getBackupData();
        return {
          nodes: data.nodes?.length || 0,
          diary: data.diary?.length || 0,
          level: (data.gamification as any)?.level || 1,
          xp: (data.gamification as any)?.xp || 0,
          achievements: (data.gamification as any)?.achievements?.length || 0,
          levelTitles: (data.gamification as any)?.levelTitles || {},
        };
      } catch (e) {
        return { error: String(e) };
      }
    });

    console.log('Results:');
    console.log(JSON.stringify(data2, null, 2));

    await page2.close();

    console.log('\n📊 Summary:');
    console.log(`\nOLD (no base path): Level ${data1.level}, XP ${data1.xp}, ${data1.achievements} achievements`);
    console.log(`NEW (/detective-board): Level ${data2.level}, XP ${data2.xp}, ${data2.achievements} achievements`);

    if (data2.level > 1 || data2.xp > 0 || data2.achievements > 0) {
      console.log('\n✅ Found real data in NEW path! Your data is already there!');
      console.log('🌐 Just open: https://ibet.team/detective-board/');
    } else if (data1.level > 1 || data1.xp > 0 || data1.achievements > 0) {
      console.log('\n✅ Found real data in OLD path! Need to migrate.');
    } else {
      console.log('\n⚠️ No real data found in either location. Might be in different browser/profile.');
    }

  } catch (error) {
    console.error('\n❌ Check failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

checkData().catch(console.error);
