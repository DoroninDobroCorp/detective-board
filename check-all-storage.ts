/**
 * Script to check all browser storage for gamification data
 */

import { chromium } from '@playwright/test';
import * as fs from 'fs';
import { join } from 'path';

async function checkAllStorage() {
  console.log('=== Checking All Browser Storage ===\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    console.log('Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('App loaded successfully\n');
    
    await page.waitForTimeout(3000);
    
    const allData = await page.evaluate(async () => {
      const result: any = {
        localStorage: {},
        indexedDB: {},
        stores: {},
      };
      
      // 1. Check localStorage
      console.log('Checking localStorage...');
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          try {
            const value = localStorage.getItem(key);
            // Try to parse JSON values
            try {
              const parsed = JSON.parse(value || '');
              result.localStorage[key] = parsed;
            } catch {
              result.localStorage[key] = value;
            }
          } catch (e) {
            result.localStorage[key] = `Error: ${e}`;
          }
        }
      }
      
      // Specifically check for GAMIFICATION_STATE_V1
      const gamificationKey = 'GAMIFICATION_STATE_V1';
      if (!result.localStorage[gamificationKey]) {
        console.log(`Warning: ${gamificationKey} not found in localStorage`);
      }
      
      // 2. Check Zustand stores
      console.log('Checking Zustand stores...');
      try {
        const gamStore = (window as any).useGamificationStore;
        if (gamStore) {
          const state = gamStore.getState();
          result.stores.gamification = {
            xp: state.xp,
            level: state.level,
            xpHistory: state.xpHistory?.length || 0,
            completions: state.completions?.length || 0,
            processedTasks: Object.keys(state.processedTasks || {}).length,
            achievements: state.achievements?.length || 0,
          };
        } else {
          result.stores.gamification = 'Store not found';
        }
        
        const appStore = (window as any).useAppStore;
        if (appStore) {
          const state = appStore.getState();
          result.stores.app = {
            nodes: state.nodes?.length || 0,
            links: state.links?.length || 0,
            historyPast: state.historyPast?.length || 0,
            historyFuture: state.historyFuture?.length || 0,
          };
        } else {
          result.stores.app = 'Store not found';
        }
      } catch (e) {
        result.stores.error = String(e);
      }
      
      // 3. Check IndexedDB
      console.log('Checking IndexedDB...');
      try {
        const dbRequest = indexedDB.open('detective_board_db');
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          dbRequest.onsuccess = () => resolve(dbRequest.result);
          dbRequest.onerror = () => reject(dbRequest.error);
        });
        
        result.indexedDB.version = db.version;
        result.indexedDB.objectStores = Array.from(db.objectStoreNames);
        
        // Get all data from relevant stores
        const tables = ['nodes', 'links', 'history'];
        const tableData: any = {};
        
        for (const tableName of tables) {
          if (db.objectStoreNames.contains(tableName)) {
            const transaction = db.transaction([tableName], 'readonly');
            const store = transaction.objectStore(tableName);
            const getAllRequest = store.getAll();
            
            const data = await new Promise((resolve, reject) => {
              getAllRequest.onsuccess = () => resolve(getAllRequest.result);
              getAllRequest.onerror = () => reject(getAllRequest.error);
            });
            
            if (tableName === 'history') {
              tableData[tableName] = data;
            } else {
              tableData[tableName] = {
                count: (data as any[]).length,
                sample: (data as any[]).slice(0, 2),
              };
            }
          }
        }
        
        result.indexedDB.tables = tableData;
        
      } catch (e) {
        result.indexedDB.error = String(e);
      }
      
      return result;
    });
    
    console.log('\n=== LOCALSTORAGE ===');
    console.log(JSON.stringify(allData.localStorage, null, 2));
    
    console.log('\n=== ZUSTAND STORES ===');
    console.log(JSON.stringify(allData.stores, null, 2));
    
    console.log('\n=== INDEXEDDB ===');
    console.log(`Version: ${allData.indexedDB.version}`);
    console.log(`Object Stores: ${allData.indexedDB.objectStores?.join(', ')}`);
    
    if (allData.indexedDB.tables) {
      console.log('\nTable Data:');
      for (const [table, data] of Object.entries(allData.indexedDB.tables)) {
        console.log(`\n${table}:`);
        console.log(JSON.stringify(data, null, 2));
      }
    }
    
    // Save to file
    const outputPath = join(process.cwd(), 'all-storage-data.json');
    fs.writeFileSync(outputPath, JSON.stringify(allData, null, 2));
    console.log(`\n✅ Full data saved to: ${outputPath}`);
    
    await browser.close();
    
  } catch (error) {
    console.error('Error:', error);
    await browser.close();
  }
}

checkAllStorage().catch(console.error);
