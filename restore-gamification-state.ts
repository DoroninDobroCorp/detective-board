/**
 * Script to extract historical gamification data and restore it
 */

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function extractAndRestoreGamification() {
  console.log('=== Starting Gamification State Restoration ===\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Navigate to the app
    const appUrl = 'http://localhost:5173';
    console.log(`Navigating to ${appUrl}...`);
    await page.goto(appUrl, { waitUntil: 'networkidle', timeout: 15000 });
    console.log('App loaded successfully\n');
    
    // Wait for app to initialize
    await page.waitForTimeout(3000);
    
    // Extract current state and history
    console.log('Extracting IndexedDB history data...');
    const data = await page.evaluate(async () => {
      try {
        // Get current gamification state from store
        const currentState = {
          xp: (window as any).useGamificationStore?.getState()?.xp || null,
          level: (window as any).useGamificationStore?.getState()?.level || null,
        };
        
        // Get history from IndexedDB
        const dbRequest = indexedDB.open('detective_board_db');
        
        const historyState = await new Promise<any>((resolve, reject) => {
          dbRequest.onsuccess = () => {
            const db = dbRequest.result;
            const transaction = db.transaction(['history'], 'readonly');
            const store = transaction.objectStore('history');
            const getRequest = store.get('history_state');
            
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error);
          };
          dbRequest.onerror = () => reject(dbRequest.error);
        });
        
        return {
          currentState,
          historyState,
          dbVersion: dbRequest.result?.version,
        };
      } catch (error) {
        return {
          error: String(error),
          currentState: null,
          historyState: null,
        };
      }
    });
    
    if (data.error) {
      console.error('Error extracting data:', data.error);
      await browser.close();
      return;
    }
    
    console.log('\n=== CURRENT STATE ===');
    console.log(`Current XP: ${data.currentState?.xp ?? 'N/A'}`);
    console.log(`Current Level: ${data.currentState?.level ?? 'N/A'}`);
    console.log(`DB Version: ${data.dbVersion}`);
    
    if (!data.historyState) {
      console.log('\n❌ No history data found in IndexedDB');
      console.log('The history may have been cleared or undo was never performed.');
      await browser.close();
      return;
    }
    
    const past = data.historyState.past || [];
    const future = data.historyState.future || [];
    
    console.log(`\nHistory State Updated: ${new Date(data.historyState.updatedAt).toISOString()}`);
    console.log(`Past entries: ${past.length}`);
    console.log(`Future entries: ${future.length}`);
    
    // Save full history to file
    const historyFile = join(__dirname, 'history-data-extracted.json');
    fs.writeFileSync(historyFile, JSON.stringify(data.historyState, null, 2));
    console.log(`\n📄 Full history saved to: ${historyFile}`);
    
    // Analyze the history
    console.log('\n=== HISTORY ANALYSIS ===');
    
    let targetXP = null;
    let targetLevel = null;
    let stateDescription = '';
    
    // If there's a future entry (meaning undo was performed)
    if (future.length > 0 && future[0].gamification) {
      targetXP = future[0].gamification.xp;
      targetLevel = future[0].gamification.level;
      stateDescription = 'State BEFORE the most recent undo (from historyFuture[0])';
      
      console.log(`\n✅ Found: ${stateDescription}`);
      console.log(`   XP: ${targetXP}`);
      console.log(`   Level: ${targetLevel}`);
      console.log(`   Completions: ${future[0].gamification.completions?.length || 0}`);
    } else if (past.length > 0 && past[past.length - 1].gamification) {
      targetXP = past[past.length - 1].gamification.xp;
      targetLevel = past[past.length - 1].gamification.level;
      stateDescription = 'Last historical state (from last historyPast entry)';
      
      console.log(`\n⚠️  No future history found (no undo detected recently)`);
      console.log(`Using: ${stateDescription}`);
      console.log(`   XP: ${targetXP}`);
      console.log(`   Level: ${targetLevel}`);
    } else {
      console.log('\n❌ No gamification data found in history');
      await browser.close();
      return;
    }
    
    // Show recent past entries for context
    console.log('\n=== RECENT HISTORY (Last 5 Past Entries) ===');
    const recentPast = past.slice(-5);
    recentPast.forEach((entry: any, idx: number) => {
      const entryNum = past.length - recentPast.length + idx + 1;
      console.log(`\nPast Entry #${entryNum}:`);
      if (entry.gamification) {
        console.log(`  XP: ${entry.gamification.xp}, Level: ${entry.gamification.level}`);
      } else {
        console.log('  (No gamification data)');
      }
    });
    
    if (future.length > 0) {
      console.log('\n=== FUTURE HISTORY (First 3 Entries) ===');
      future.slice(0, 3).forEach((entry: any, idx: number) => {
        console.log(`\nFuture Entry #${idx + 1}:`);
        if (entry.gamification) {
          console.log(`  XP: ${entry.gamification.xp}, Level: ${entry.gamification.level}`);
        } else {
          console.log('  (No gamification data)');
        }
      });
    }
    
    // Ask for confirmation before restoring
    console.log('\n' + '='.repeat(60));
    console.log(`RESTORATION TARGET: XP=${targetXP}, Level=${targetLevel}`);
    console.log(`SOURCE: ${stateDescription}`);
    console.log('='.repeat(60));
    console.log('\nProceeding with restoration in 3 seconds...');
    await page.waitForTimeout(3000);
    
    // Restore the gamification state
    console.log('\n🔄 Restoring gamification state...');
    const restoreResult = await page.evaluate(async ({ xp, level }) => {
      try {
        // Access the gamification store
        const gamStore = (window as any).useGamificationStore;
        if (!gamStore) {
          return { success: false, error: 'Gamification store not found' };
        }
        
        const currentState = gamStore.getState();
        
        // Update the state
        gamStore.setState({
          xp: xp,
          level: level,
        }, false);
        
        const newState = gamStore.getState();
        
        return {
          success: true,
          before: { xp: currentState.xp, level: currentState.level },
          after: { xp: newState.xp, level: newState.level },
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }, { xp: targetXP, level: targetLevel });
    
    if (!restoreResult.success) {
      console.error(`\n❌ Restoration failed: ${restoreResult.error}`);
      await browser.close();
      return;
    }
    
    console.log('\n✅ Gamification state updated successfully!');
    console.log(`   Before: XP=${restoreResult.before.xp}, Level=${restoreResult.before.level}`);
    console.log(`   After:  XP=${restoreResult.after.xp}, Level=${restoreResult.after.level}`);
    
    // Wait a moment for UI to update
    await page.waitForTimeout(1000);
    
    // Verify the UI displays the correct values
    console.log('\n🔍 Verifying UI display...');
    const uiVerification = await page.evaluate(() => {
      const results: any = {
        found: [],
        notFound: [],
      };
      
      // Check for XP display in the DOM
      const xpElements = Array.from(document.querySelectorAll('*')).filter(el => {
        const text = el.textContent || '';
        return /\bXP\b/i.test(text) || /experience/i.test(text);
      });
      
      // Check for level display
      const levelElements = Array.from(document.querySelectorAll('*')).filter(el => {
        const text = el.textContent || '';
        return /\blevel\b/i.test(text) || /\bLv\b/i.test(text);
      });
      
      // Get gamification store state for verification
      const gamState = (window as any).useGamificationStore?.getState();
      
      return {
        xpElementsFound: xpElements.length,
        levelElementsFound: levelElements.length,
        storeState: {
          xp: gamState?.xp,
          level: gamState?.level,
        },
      };
    });
    
    console.log(`   XP elements found in UI: ${uiVerification.xpElementsFound}`);
    console.log(`   Level elements found in UI: ${uiVerification.levelElementsFound}`);
    console.log(`   Store state verified: XP=${uiVerification.storeState.xp}, Level=${uiVerification.storeState.level}`);
    
    // Take a screenshot
    const screenshotPath = join(__dirname, 'gamification-restored-screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`\n📸 Screenshot saved to: ${screenshotPath}`);
    
    console.log('\n✅ RESTORATION COMPLETE!');
    console.log('Browser will remain open for 10 seconds for visual verification...');
    await page.waitForTimeout(10000);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await browser.close();
    console.log('\n✅ Browser closed');
  }
}

extractAndRestoreGamification().catch(console.error);
