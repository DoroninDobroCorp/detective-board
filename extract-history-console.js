/**
 * Browser Console Script to Extract IndexedDB History
 * 
 * To use: Copy and paste this entire script into your browser's developer console
 * while on the detective-board application page.
 */

(async function extractHistoryData() {
  console.log('=== Detective Board History Extractor ===\n');
  
  try {
    // Open IndexedDB
    const dbRequest = indexedDB.open('detective_board_db');
    
    const db = await new Promise((resolve, reject) => {
      dbRequest.onsuccess = () => resolve(dbRequest.result);
      dbRequest.onerror = () => reject(dbRequest.error);
    });
    
    console.log(`Database opened: ${db.name} (version ${db.version})`);
    
    // Read history table
    const transaction = db.transaction(['history'], 'readonly');
    const store = transaction.objectStore('history');
    const getRequest = store.get('history_state');
    
    const historyState = await new Promise((resolve, reject) => {
      getRequest.onsuccess = () => resolve(getRequest.result);
      getRequest.onerror = () => reject(getRequest.error);
    });
    
    if (!historyState) {
      console.log('No history state found in IndexedDB');
      return;
    }
    
    console.log(`\nHistory State Updated: ${new Date(historyState.updatedAt).toISOString()}`);
    console.log(`Past entries: ${historyState.past?.length || 0}`);
    console.log(`Future entries: ${historyState.future?.length || 0}`);
    
    // Analyze past entries
    console.log('\n=== PAST HISTORY (Last 10 entries) ===');
    const past = historyState.past || [];
    const recentPast = past.slice(-10);
    
    recentPast.forEach((entry, idx) => {
      const entryNum = past.length - recentPast.length + idx + 1;
      console.log(`\nPast Entry #${entryNum}:`);
      if (entry.gamification) {
        console.log(`  XP: ${entry.gamification.xp}`);
        console.log(`  Level: ${entry.gamification.level}`);
        console.log(`  Completions: ${entry.gamification.completions?.length || 0}`);
        console.log(`  Processed Tasks: ${Object.keys(entry.gamification.processedTasks || {}).length}`);
      } else {
        console.log('  (No gamification data)');
      }
      console.log(`  Nodes: ${entry.nodes?.length || 0}`);
      console.log(`  Links: ${entry.links?.length || 0}`);
    });
    
    // Analyze future entries
    if (historyState.future && historyState.future.length > 0) {
      console.log('\n=== FUTURE HISTORY (First 5 entries) ===');
      const future = historyState.future;
      future.slice(0, 5).forEach((entry, idx) => {
        console.log(`\nFuture Entry #${idx + 1}:`);
        if (entry.gamification) {
          console.log(`  XP: ${entry.gamification.xp}`);
          console.log(`  Level: ${entry.gamification.level}`);
          console.log(`  Completions: ${entry.gamification.completions?.length || 0}`);
          console.log(`  Processed Tasks: ${Object.keys(entry.gamification.processedTasks || {}).length}`);
        } else {
          console.log('  (No gamification data)');
        }
        console.log(`  Nodes: ${entry.nodes?.length || 0}`);
        console.log(`  Links: ${entry.links?.length || 0}`);
      });
    }
    
    // Analysis based on undo logic
    console.log('\n=== UNDO/REDO ANALYSIS ===');
    console.log('\nHow undo works:');
    console.log('1. Current state is captured and pushed to historyFuture[0]');
    console.log('2. Last historyPast entry is popped and restored');
    console.log('3. The log "undo:gamification-restored" shows the XP/level being restored FROM historyPast');
    
    if (historyState.future && historyState.future.length > 0) {
      console.log('\n>> If you just performed an undo:');
      console.log('   - The state BEFORE undo is now in historyFuture[0]');
      console.log('   - The state AFTER undo (restored) came from the last historyPast entry');
      
      if (historyState.future[0].gamification) {
        console.log('\n>> State BEFORE the most recent undo (from historyFuture[0]):');
        console.log(`   XP: ${historyState.future[0].gamification.xp}`);
        console.log(`   Level: ${historyState.future[0].gamification.level}`);
      }
    }
    
    if (past.length > 0 && past[past.length - 1].gamification) {
      console.log('\n>> Current state (last historyPast entry):');
      console.log(`   XP: ${past[past.length - 1].gamification.xp}`);
      console.log(`   Level: ${past[past.length - 1].gamification.level}`);
    }
    
    // Save to downloadable JSON
    console.log('\n=== DOWNLOADING FULL DATA ===');
    const dataStr = JSON.stringify(historyState, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `history-state-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('Full history data downloaded to file');
    
    // Also return the data
    console.log('\n=== RETURNING DATA ===');
    console.log('Full history state is available as the return value of this function');
    return historyState;
    
  } catch (error) {
    console.error('Error extracting history:', error);
    return null;
  }
})();
