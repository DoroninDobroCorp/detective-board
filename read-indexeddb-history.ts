/**
 * Script to read IndexedDB history and find XP/level before specific undo action
 */

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function readIndexedDBHistory() {
  console.log('Starting IndexedDB history reader...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Navigate to the app - try localhost first
  const appUrl = 'http://localhost:5173';
  console.log(`Navigating to ${appUrl}`);
  
  try {
    await page.goto(appUrl, { waitUntil: 'networkidle', timeout: 10000 });
    console.log('Successfully loaded app');
  } catch (e) {
    console.log('Could not connect to localhost:5173, trying file://');
    const fileUrl = `file://${join(__dirname, 'index.html')}`;
    await page.goto(fileUrl, { waitUntil: 'load', timeout: 10000 });
  }
  
  // Wait for IndexedDB to be available
  await page.waitForTimeout(3000);
  
  // Read IndexedDB history
  const historyData = await page.evaluate(async () => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('detective_board_db');
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['history'], 'readonly');
        const store = transaction.objectStore('history');
        const getRequest = store.get('history_state');
        
        getRequest.onsuccess = () => {
          const historyState = getRequest.result;
          resolve(historyState || null);
        };
        
        getRequest.onerror = () => reject(getRequest.error);
      };
    });
  });
  
  await browser.close();
  
  return historyData;
}

async function main() {
  try {
    const historyData = await readIndexedDBHistory();
    
    if (!historyData) {
      console.log('No history data found in IndexedDB');
      return;
    }
    
    console.log('\n=== IndexedDB History State ===');
    console.log(`Updated at: ${new Date((historyData as any).updatedAt).toISOString()}`);
    console.log(`Past entries: ${(historyData as any).past?.length || 0}`);
    console.log(`Future entries: ${(historyData as any).future?.length || 0}`);
    
    // Analyze the history
    const past = (historyData as any).past || [];
    const future = (historyData as any).future || [];
    
    console.log('\n=== Recent History Entries (Past) ===');
    const recentPast = past.slice(-5);
    recentPast.forEach((entry: any, idx: number) => {
      console.log(`\nEntry ${past.length - recentPast.length + idx + 1}:`);
      if (entry.gamification) {
        console.log(`  XP: ${entry.gamification.xp}`);
        console.log(`  Level: ${entry.gamification.level}`);
        console.log(`  Completions: ${entry.gamification.completions?.length || 0}`);
      } else {
        console.log('  (No gamification data)');
      }
    });
    
    if (future.length > 0) {
      console.log('\n=== Future History Entries ===');
      future.slice(0, 5).forEach((entry: any, idx: number) => {
        console.log(`\nFuture Entry ${idx + 1}:`);
        if (entry.gamification) {
          console.log(`  XP: ${entry.gamification.xp}`);
          console.log(`  Level: ${entry.gamification.level}`);
          console.log(`  Completions: ${entry.gamification.completions?.length || 0}`);
        } else {
          console.log('  (No gamification data)');
        }
      });
    }
    
    // The undo:gamification-restored logs the XP/level from prev.gamification
    // which is the last entry in historyPast at the time of undo
    // The current state before undo would be what gets pushed to historyFuture[0]
    
    console.log('\n=== Analysis ===');
    console.log('When undo:gamification-restored was called:');
    console.log('- The logged XP/level came from the last historyPast entry (being restored)');
    console.log('- The state "just prior to" the undo would be historyFuture[0] (if undo was done)');
    
    if (future.length > 0 && future[0].gamification) {
      console.log('\n=== State BEFORE the undo (from historyFuture[0]) ===');
      console.log(`XP: ${future[0].gamification.xp}`);
      console.log(`Level: ${future[0].gamification.level}`);
    }
    
    if (past.length > 0 && past[past.length - 1].gamification) {
      console.log('\n=== State AFTER the undo (from last historyPast) ===');
      console.log(`XP: ${past[past.length - 1].gamification.xp}`);
      console.log(`Level: ${past[past.length - 1].gamification.level}`);
    }
    
    // Save full data to file
    const fs = await import('fs');
    const outputPath = join(__dirname, 'indexeddb-history-dump.json');
    fs.writeFileSync(outputPath, JSON.stringify(historyData, null, 2));
    console.log(`\n=== Full history data saved to ${outputPath} ===`);
    
  } catch (error) {
    console.error('Error reading IndexedDB:', error);
    process.exit(1);
  }
}

main();
