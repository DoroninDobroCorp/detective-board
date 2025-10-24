/**
 * Comprehensive verification of gamification state restoration
 */

import { chromium } from '@playwright/test';

async function verifyGamificationState() {
  console.log('='.repeat(70));
  console.log('GAMIFICATION STATE VERIFICATION');
  console.log('='.repeat(70));
  console.log('\nTarget values:');
  console.log('  XP: 2500');
  console.log('  Level: 7');
  console.log('\n' + '='.repeat(70) + '\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    console.log('Step 1: Navigating to application...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('✅ Application loaded\n');
    
    await page.waitForTimeout(2000);
    
    // Comprehensive verification
    console.log('Step 2: Extracting all gamification data...\n');
    const verification = await page.evaluate(() => {
      const results: any = {
        localStorage: {
          exists: false,
          raw: null,
          parsed: null,
          error: null,
        },
        store: {
          exists: false,
          state: null,
          error: null,
        },
        verification: {
          localStorageMatch: false,
          storeMatch: false,
          errors: [],
        },
      };
      
      const targetXP = 2500;
      const targetLevel = 7;
      
      // Check localStorage
      try {
        const gamKey = 'GAMIFICATION_STATE_V1';
        const raw = localStorage.getItem(gamKey);
        
        if (raw) {
          results.localStorage.exists = true;
          results.localStorage.raw = raw;
          
          try {
            const parsed = JSON.parse(raw);
            results.localStorage.parsed = parsed;
            
            // Verify values
            const storedXP = parsed?.state?.xp;
            const storedLevel = parsed?.state?.level;
            
            if (storedXP === targetXP && storedLevel === targetLevel) {
              results.verification.localStorageMatch = true;
            } else {
              results.verification.errors.push(
                `localStorage mismatch: XP=${storedXP} (expected ${targetXP}), Level=${storedLevel} (expected ${targetLevel})`
              );
            }
          } catch (parseError) {
            results.localStorage.error = `Parse error: ${parseError}`;
            results.verification.errors.push('Failed to parse localStorage JSON');
          }
        } else {
          results.verification.errors.push('GAMIFICATION_STATE_V1 not found in localStorage');
        }
      } catch (localStorageError) {
        results.localStorage.error = String(localStorageError);
        results.verification.errors.push(`localStorage access error: ${localStorageError}`);
      }
      
      // Check Zustand store
      try {
        const gamStore = (window as any).useGamificationStore;
        
        if (gamStore) {
          results.store.exists = true;
          const state = gamStore.getState();
          
          results.store.state = {
            xp: state.xp,
            level: state.level,
            xpHistory: state.xpHistory?.length || 0,
            completions: state.completions?.length || 0,
            processedTasks: Object.keys(state.processedTasks || {}).length,
            achievements: state.achievements?.length || 0,
            levelTitles: state.levelTitles,
            claimedBonuses: Object.keys(state.claimedBonuses || {}).length,
            pendingLevelUps: state.pendingLevelUps?.length || 0,
          };
          
          // Verify values
          if (state.xp === targetXP && state.level === targetLevel) {
            results.verification.storeMatch = true;
          } else {
            results.verification.errors.push(
              `Store mismatch: XP=${state.xp} (expected ${targetXP}), Level=${state.level} (expected ${targetLevel})`
            );
          }
        } else {
          results.verification.errors.push('useGamificationStore not found on window');
        }
      } catch (storeError) {
        results.store.error = String(storeError);
        results.verification.errors.push(`Store access error: ${storeError}`);
      }
      
      return results;
    });
    
    // Display results
    console.log('='.repeat(70));
    console.log('LOCALSTORAGE VERIFICATION');
    console.log('='.repeat(70));
    
    if (verification.localStorage.exists) {
      console.log('✅ GAMIFICATION_STATE_V1 exists in localStorage\n');
      
      if (verification.localStorage.parsed) {
        const state = verification.localStorage.parsed.state;
        console.log('Stored values:');
        console.log(`  XP: ${state.xp}`);
        console.log(`  Level: ${state.level}`);
        console.log(`  XP History entries: ${state.xpHistory?.length || 0}`);
        console.log(`  Completions: ${state.completions?.length || 0}`);
        console.log(`  Processed tasks: ${Object.keys(state.processedTasks || {}).length}`);
        console.log(`  Achievements: ${state.achievements?.length || 0}`);
        console.log(`  Level titles: ${Object.keys(state.levelTitles || {}).join(', ')}`);
        console.log(`  Claimed bonuses: ${Object.keys(state.claimedBonuses || {}).length}`);
        console.log(`  Pending level ups: ${state.pendingLevelUps?.length || 0}`);
        
        if (state.levelTitles) {
          console.log('\nLevel titles:');
          for (const [level, info] of Object.entries(state.levelTitles as any)) {
            console.log(`  Level ${level}: "${info.title}"`);
          }
        }
        
        if (state.xpHistory && state.xpHistory.length > 0) {
          console.log('\nXP History:');
          state.xpHistory.forEach((entry: any, idx: number) => {
            console.log(`  ${idx + 1}. ${entry.amount} XP - ${entry.source} - ${entry.note || 'no note'}`);
          });
        }
      } else {
        console.log('❌ Failed to parse localStorage data');
        if (verification.localStorage.error) {
          console.log(`Error: ${verification.localStorage.error}`);
        }
      }
    } else {
      console.log('❌ GAMIFICATION_STATE_V1 NOT FOUND in localStorage');
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('ZUSTAND STORE VERIFICATION');
    console.log('='.repeat(70));
    
    if (verification.store.exists) {
      console.log('✅ useGamificationStore found\n');
      
      if (verification.store.state) {
        console.log('Store state:');
        console.log(`  XP: ${verification.store.state.xp}`);
        console.log(`  Level: ${verification.store.state.level}`);
        console.log(`  XP History entries: ${verification.store.state.xpHistory}`);
        console.log(`  Completions: ${verification.store.state.completions}`);
        console.log(`  Processed tasks: ${verification.store.state.processedTasks}`);
        console.log(`  Achievements: ${verification.store.state.achievements}`);
        console.log(`  Claimed bonuses: ${verification.store.state.claimedBonuses}`);
        console.log(`  Pending level ups: ${verification.store.state.pendingLevelUps}`);
        
        if (verification.store.state.levelTitles) {
          console.log('\nLevel titles:');
          for (const [level, info] of Object.entries(verification.store.state.levelTitles as any)) {
            console.log(`  Level ${level}: "${info.title}"`);
          }
        }
      }
    } else {
      console.log('❌ useGamificationStore NOT FOUND');
      if (verification.store.error) {
        console.log(`Error: ${verification.store.error}`);
      }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('FINAL VERIFICATION RESULT');
    console.log('='.repeat(70) + '\n');
    
    let passed = true;
    
    // Check localStorage match
    if (verification.verification.localStorageMatch) {
      console.log('✅ localStorage values MATCH target (XP=2500, Level=7)');
    } else {
      console.log('❌ localStorage values DO NOT MATCH target');
      passed = false;
    }
    
    // Check store match
    if (verification.store.exists) {
      if (verification.verification.storeMatch) {
        console.log('✅ Store values MATCH target (XP=2500, Level=7)');
      } else {
        console.log('❌ Store values DO NOT MATCH target');
        passed = false;
      }
    } else {
      console.log('⚠️  Store not available (may load after page initialization)');
    }
    
    // Display errors
    if (verification.verification.errors.length > 0) {
      console.log('\nErrors encountered:');
      verification.verification.errors.forEach((error: string, idx: number) => {
        console.log(`  ${idx + 1}. ${error}`);
      });
    }
    
    console.log('\n' + '='.repeat(70));
    if (passed && verification.verification.localStorageMatch) {
      console.log('✅ VERIFICATION PASSED');
      console.log('='.repeat(70));
      console.log('\nData store contains correct values:');
      console.log('  XP: 2500 ✓');
      console.log('  Level: 7 ✓');
    } else {
      console.log('❌ VERIFICATION FAILED');
      console.log('='.repeat(70));
      console.log('\nData store does NOT match target values.');
    }
    
    console.log('\n');
    
    await browser.close();
    
    // Return exit code based on verification
    process.exit(passed && verification.verification.localStorageMatch ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ VERIFICATION ERROR:', error);
    await browser.close();
    process.exit(1);
  }
}

verifyGamificationState().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
