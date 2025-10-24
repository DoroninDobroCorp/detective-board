import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Go to main page first
  await page.goto('http://localhost:5173/detective-board/');
  await page.waitForTimeout(3000);
  
  // Check if store is exposed
  const hasStore = await page.evaluate(() => {
    return Boolean(window.__appStore);
  });
  console.log('Store available on main page:', hasStore);
  
  // Now go to active page
  await page.goto('http://localhost:5173/detective-board/active');
  await page.waitForTimeout(3000);
  
  // Check if store is exposed
  const hasStoreOnActive = await page.evaluate(() => {
    return Boolean(window.__appStore);
  });
  console.log('Store available on active page:', hasStoreOnActive);
  
  await browser.close();
})();
