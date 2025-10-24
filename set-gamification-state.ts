/**
 * Script to set gamification state in localStorage and verify UI
 * 
 * Usage: npx tsx set-gamification-state.ts [XP] [LEVEL]
 */

import { chromium } from '@playwright/test';
import { join } from 'path';

async function setGamificationState() {
  // Get XP and Level from command line args, or use defaults
  const targetXP = parseInt(process.argv[2]) || 1500;
  const targetLevel = parseInt(process.argv[3]) || 5;
  
  console.log('=== Setting Gamification State ===');
  console.log(`Target XP: ${targetXP}`);
  console.log(`Target Level: ${targetLevel}\n`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    console.log('Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('App loaded\n');
    
    await page.waitForTimeout(2000);
    
    // First, capture the current state
    console.log('📊 Capturing current state...');
    const beforeState = await page.evaluate(() => {
      const gamKey = 'GAMIFICATION_STATE_V1';
      const existing = localStorage.getItem(gamKey);
      return {
        hasData: !!existing,
        data: existing ? JSON.parse(existing) : null,
      };
    });
    
    console.log(`Current localStorage data exists: ${beforeState.hasData}`);
    if (beforeState.hasData) {
      console.log(`Current XP: ${beforeState.data.state?.xp || 'N/A'}`);
      console.log(`Current Level: ${beforeState.data.state?.level || 'N/A'}`);
    }
    
    // Create the gamification state object
    const gamificationState = {
      state: {
        xp: targetXP,
        level: targetLevel,
        xpHistory: [
          {
            id: `xp-${Date.now()}`,
            amount: targetXP,
            source: 'manual',
            note: 'Restored from historical data',
            ts: Date.now(),
          },
        ],
        completions: [],
        processedTasks: {},
        achievements: [],
        levelTitles: {
          1: { title: 'Новичок', assignedAt: Date.now() - 1000000 },
          [targetLevel]: { title: `Восстановленный уровень ${targetLevel}`, assignedAt: Date.now() },
        },
        claimedBonuses: {},
        pendingLevelUps: [],
        pendingManualCandidates: [],
      },
      version: 0,
    };
    
    console.log('\n🔄 Writing gamification state to localStorage...');
    
    const result = await page.evaluate((data) => {
      const gamKey = 'GAMIFICATION_STATE_V1';
      try {
        localStorage.setItem(gamKey, JSON.stringify(data));
        
        // Verify it was written
        const written = localStorage.getItem(gamKey);
        const parsed = written ? JSON.parse(written) : null;
        
        return {
          success: true,
          verified: !!parsed,
          xp: parsed?.state?.xp,
          level: parsed?.state?.level,
        };
      } catch (error) {
        return {
          success: false,
          error: String(error),
        };
      }
    }, gamificationState);
    
    if (!result.success) {
      console.error(`❌ Failed to write localStorage: ${result.error}`);
      await browser.close();
      return;
    }
    
    console.log('✅ localStorage updated successfully');
    console.log(`Verified XP: ${result.xp}`);
    console.log(`Verified Level: ${result.level}`);
    
    // Reload the page to apply the state
    console.log('\n🔄 Reloading page to apply state...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Verify the store has loaded the state
    console.log('\n🔍 Verifying store state...');
    const storeState = await page.evaluate(() => {
      try {
        const gamStore = (window as any).useGamificationStore;
        if (!gamStore) {
          return { found: false, error: 'Store not found on window' };
        }
        
        const state = gamStore.getState();
        return {
          found: true,
          xp: state.xp,
          level: state.level,
          xpHistory: state.xpHistory?.length || 0,
          completions: state.completions?.length || 0,
        };
      } catch (error) {
        return { found: false, error: String(error) };
      }
    });
    
    if (!storeState.found) {
      console.log(`⚠️  Store verification: ${storeState.error}`);
    } else {
      console.log('✅ Store loaded successfully:');
      console.log(`   XP: ${storeState.xp}`);
      console.log(`   Level: ${storeState.level}`);
      console.log(`   XP History entries: ${storeState.xpHistory}`);
      console.log(`   Completions: ${storeState.completions}`);
    }
    
    // Check UI for gamification display
    console.log('\n🔍 Checking UI elements...');
    const uiElements = await page.evaluate(() => {
      const results: any = {
        xpText: [],
        levelText: [],
        gamificationComponents: [],
      };
      
      // Search for text containing XP or level
      const allText = Array.from(document.querySelectorAll('*')).map(el => ({
        tag: el.tagName,
        text: el.textContent?.trim() || '',
        classes: Array.from(el.classList || []),
      }));
      
      results.xpText = allText.filter(el => 
        el.text && (el.text.includes('XP') || /\d+\s*xp/i.test(el.text))
      ).slice(0, 5);
      
      results.levelText = allText.filter(el => 
        el.text && (/level\s*\d+/i.test(el.text) || /уровень\s*\d+/i.test(el.text) || /^Lv\.\s*\d+/.test(el.text))
      ).slice(0, 5);
      
      // Check for specific gamification UI elements
      const commonSelectors = [
        '[data-testid*="xp"]',
        '[data-testid*="level"]',
        '[class*="gamification"]',
        '[class*="xp"]',
        '[class*="level"]',
      ];
      
      commonSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          results.gamificationComponents.push({
            selector,
            count: elements.length,
          });
        }
      });
      
      return results;
    });
    
    console.log(`UI Elements with XP: ${uiElements.xpText.length}`);
    if (uiElements.xpText.length > 0) {
      uiElements.xpText.forEach((el: any) => {
        console.log(`  - ${el.tag}: "${el.text.substring(0, 50)}"`);
      });
    }
    
    console.log(`UI Elements with Level: ${uiElements.levelText.length}`);
    if (uiElements.levelText.length > 0) {
      uiElements.levelText.forEach((el: any) => {
        console.log(`  - ${el.tag}: "${el.text.substring(0, 50)}"`);
      });
    }
    
    if (uiElements.gamificationComponents.length > 0) {
      console.log('Gamification components found:');
      uiElements.gamificationComponents.forEach((comp: any) => {
        console.log(`  - ${comp.selector}: ${comp.count} elements`);
      });
    }
    
    // Take screenshots
    console.log('\n📸 Taking screenshots...');
    const screenshotPath = join(process.cwd(), 'gamification-state-screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Full page screenshot: ${screenshotPath}`);
    
    // Try to find and screenshot just the gamification UI if it exists
    const gamificationArea = await page.$('[class*="gamification"], [data-testid*="xp"], [data-testid*="level"]');
    if (gamificationArea) {
      const focusedPath = join(process.cwd(), 'gamification-ui-focused.png');
      await gamificationArea.screenshot({ path: focusedPath });
      console.log(`Focused screenshot: ${focusedPath}`);
    }
    
    // Save updated all-storage-data.json
    console.log('\n💾 Updating all-storage-data.json...');
    const updatedData = await page.evaluate(() => {
      const result: any = {
        localStorage: {},
        timestamp: new Date().toISOString(),
      };
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          try {
            result.localStorage[key] = JSON.parse(value || '');
          } catch {
            result.localStorage[key] = value;
          }
        }
      }
      
      return result;
    });
    
    const fs = await import('fs');
    fs.writeFileSync(
      join(process.cwd(), 'all-storage-data.json'),
      JSON.stringify(updatedData, null, 2)
    );
    console.log('✅ all-storage-data.json updated');
    
    console.log('\n✅ GAMIFICATION STATE RESTORATION COMPLETE!');
    console.log(`XP: ${targetXP}, Level: ${targetLevel}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await browser.close();
    console.log('\n✅ Browser closed');
  }
}

setGamificationState().catch(console.error);
